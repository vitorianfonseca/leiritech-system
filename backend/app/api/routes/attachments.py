"""Attachment routes — signed-URL upload/download against R2 (#46).

The API never handles file bytes: it mints short-lived presigned URLs and the
client transfers directly to/from object storage. When R2 is not configured
every mutating endpoint returns a clear 503 (``STORAGE_NOT_CONFIGURED``) — it
never pretends a file was stored. Listing attachment metadata works regardless,
since it only touches the database.
"""

from __future__ import annotations

import uuid
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import storage
from app.storage import local as local_storage
from app.api.dependencies.auth import CurrentUser
from app.core.errors import ApiError
from app.database.session import get_db
from app.models.collaboration import Attachment
from app.schemas.attachments import (
    AttachmentDownloadResponse,
    AttachmentResponse,
    AttachmentUploadRequest,
    AttachmentUploadResponse,
)
from app.services import attachment_policy, attachment_service

router = APIRouter()
logger = structlog.get_logger("leiritech.attachment")

DbSession = Annotated[Session, Depends(get_db)]


def _storage_unavailable() -> ApiError:
    return ApiError(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        "STORAGE_NOT_CONFIGURED",
        "O armazenamento de ficheiros não está configurado.",
    )


@router.post(
    "/upload-url",
    response_model=AttachmentUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_upload_url(
    payload: AttachmentUploadRequest,
    user: CurrentUser,
    db: DbSession,
) -> AttachmentUploadResponse:
    # IDOR guard: may this caller write a file to the parent entity? (BR-002)
    attachment_service.authorize_entity_access(
        db, user, payload.entity_type, payload.entity_id
    )
    # #47: every field in the payload is attacker-controlled, so the service
    # layer — not the payload — decides the filename, content type and size that
    # get signed and persisted. Raises 422 for dangerous or oversized files.
    policy = attachment_policy.validate_upload(
        payload.filename, payload.content_type, payload.size_bytes
    )
    if not storage.is_configured():
        raise _storage_unavailable()

    key = storage.build_key(payload.entity_type, payload.entity_id, policy.filename)
    attachment = Attachment(
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        filename=policy.filename,
        mime_type=policy.content_type,
        size_bytes=policy.size_bytes,
        r2_key=key,
        uploaded_by=user.id,
        created_by=user.id,
    )
    db.add(attachment)
    db.flush()

    try:
        # Binds type + byte count into the signature: the URL handed back can
        # only ever store exactly what was validated above.
        url = storage.presign_upload(
            key,
            content_type=policy.content_type,
            content_length=policy.size_bytes,
        )
    except storage.StorageNotConfigured as exc:
        raise _storage_unavailable() from exc

    db.commit()
    logger.info(
        "attachment.upload_url_issued",
        attachment_id=str(attachment.id),
        entity_type=payload.entity_type,
        entity_id=str(payload.entity_id),
        content_type=policy.content_type,
        size_bytes=policy.size_bytes,
        actor_id=str(user.id),
    )
    return AttachmentUploadResponse(
        attachment_id=attachment.id,
        key=key,
        upload_url=url,
        expires_in=storage.UPLOAD_URL_TTL,
        content_type=policy.content_type,
        content_length=policy.size_bytes,
    )


@router.get("/{attachment_id}/download-url", response_model=AttachmentDownloadResponse)
def create_download_url(
    attachment_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
) -> AttachmentDownloadResponse:
    attachment = db.get(Attachment, attachment_id)
    if attachment is None:
        raise ApiError(
            status.HTTP_404_NOT_FOUND, "NOT_FOUND", "Anexo não encontrado."
        )
    # IDOR guard: may this caller read the parent this attachment belongs to?
    attachment_service.authorize_entity_access(
        db, user, attachment.entity_type, attachment.entity_id
    )
    if not storage.is_configured():
        raise _storage_unavailable()
    try:
        # #47: force an attachment disposition and a vetted response type, so a
        # row stored before the upload policy tightened cannot be rendered
        # (stored XSS) from the bucket origin.
        url = storage.presign_download(
            attachment.r2_key,
            filename=attachment.filename,
            content_type=attachment_policy.safe_download_content_type(
                attachment.mime_type
            ),
        )
    except storage.StorageNotConfigured as exc:
        raise _storage_unavailable() from exc
    return AttachmentDownloadResponse(
        download_url=url, expires_in=storage.DOWNLOAD_URL_TTL
    )


@router.delete(
    "/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None
)
def delete_attachment(
    attachment_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
) -> Response:
    """Remove an attachment and its stored object.

    The row goes first and the object second: if the unlink fails we are left
    with an orphaned file, which costs disk. The other order would leave a row
    pointing at nothing, which costs the user a download that 404s.
    """
    attachment = db.get(Attachment, attachment_id)
    if attachment is None:
        raise ApiError(
            status.HTTP_404_NOT_FOUND, "NOT_FOUND", "Anexo não encontrado."
        )
    # IDOR guard: same boundary as reading the parent (BR-002).
    attachment_service.authorize_entity_access(
        db, user, attachment.entity_type, attachment.entity_id
    )
    key = attachment.r2_key
    db.delete(attachment)
    db.commit()

    if storage.provider is local_storage:
        try:
            local_storage.resolve(key).unlink(missing_ok=True)
        except (OSError, local_storage.StorageNotConfigured):
            logger.warning("attachment.object_orphaned", key=key)

    logger.info(
        "attachment.deleted", attachment_id=str(attachment_id), actor_id=str(user.id)
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("", response_model=list[AttachmentResponse])
def list_attachments(
    user: CurrentUser,
    db: DbSession,
    entity_type: Annotated[str, Query(min_length=1, max_length=64)],
    entity_id: Annotated[uuid.UUID, Query()],
) -> list[Attachment]:
    # IDOR guard: only list attachments of a parent the caller may see (BR-002).
    attachment_service.authorize_entity_access(db, user, entity_type, entity_id)
    rows = db.execute(
        select(Attachment)
        .where(
            Attachment.entity_type == entity_type,
            Attachment.entity_id == entity_id,
        )
        .order_by(Attachment.created_at.desc())
    ).scalars()
    return list(rows)


# --------------------------------------------------------------------------- #
# Local transfer (only reachable when the local provider is active)
#
# The presigned-URL contract says the API does not proxy bytes. A filesystem
# cannot mint S3 credentials, so for the local provider these two routes ARE
# the signed URL: the token in the query string is an HMAC over the key, and
# for uploads over the content type and byte count as well. They are
# deliberately unauthenticated in the session sense — the signature is the
# credential, exactly as it is for R2 — and they enforce against the body they
# actually receive, so a client that lied at presign time cannot store
# something else with the URL it was handed (#47).
# --------------------------------------------------------------------------- #
def _require_local() -> None:
    if storage.provider is not local_storage:
        raise ApiError(
            status.HTTP_404_NOT_FOUND, "NOT_FOUND", "Rota não disponível."
        )


def _bad_signature(detail: str) -> ApiError:
    return ApiError(status.HTTP_403_FORBIDDEN, "STORAGE_SIGNATURE_INVALID", detail)


@router.put("/local", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def local_upload(
    request: Request,
    key: Annotated[str, Query(min_length=1, max_length=512)],
    content_type: Annotated[str, Query(min_length=1, max_length=255)],
    content_length: Annotated[int, Query(ge=0)],
    expires: Annotated[int, Query()],
    signature: Annotated[str, Query(min_length=32, max_length=128)],
) -> Response:
    _require_local()
    try:
        local_storage.verify_upload(
            key, content_type, content_length, expires, signature
        )
        path = local_storage.resolve(key)
    except local_storage.StorageNotConfigured as exc:
        raise _bad_signature(str(exc)) from exc

    body = await request.body()
    # The signed values are the contract, not a hint: a body of a different
    # size, or sent as a different type, is refused rather than stored.
    if len(body) != content_length:
        raise _bad_signature("O tamanho do ficheiro não corresponde ao autorizado.")
    declared = (request.headers.get("content-type") or "").split(";")[0].strip()
    if declared and declared != content_type:
        raise _bad_signature("O tipo do ficheiro não corresponde ao autorizado.")

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(body)
    logger.info("attachment_stored_locally", key=key, bytes=len(body))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/local", response_model=None)
def local_download(
    key: Annotated[str, Query(min_length=1, max_length=512)],
    expires: Annotated[int, Query()],
    signature: Annotated[str, Query(min_length=32, max_length=128)],
    filename: Annotated[str | None, Query(max_length=255)] = None,
) -> Response:
    _require_local()
    try:
        local_storage.verify_download(key, expires, signature)
        path = local_storage.resolve(key)
    except local_storage.StorageNotConfigured as exc:
        raise _bad_signature(str(exc)) from exc

    if not path.is_file():
        raise ApiError(
            status.HTTP_404_NOT_FOUND, "NOT_FOUND", "Ficheiro não encontrado."
        )

    # Always an attachment, never inline, and never the stored MIME type: a row
    # written before the upload policy tightened must not be renderable from
    # this origin (stored XSS).
    safe_name = (filename or path.name).replace('"', "").replace("\\", "")
    return Response(
        content=path.read_bytes(),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )
