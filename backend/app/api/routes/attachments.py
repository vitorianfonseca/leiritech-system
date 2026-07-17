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

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

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
from app import storage

router = APIRouter()

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
    if not storage.is_configured():
        raise _storage_unavailable()

    key = storage.build_key(payload.entity_type, payload.entity_id, payload.filename)
    attachment = Attachment(
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        filename=payload.filename,
        mime_type=payload.content_type,
        size_bytes=payload.size_bytes,
        r2_key=key,
        uploaded_by=user.id,
        created_by=user.id,
    )
    db.add(attachment)
    db.flush()

    try:
        url = storage.presign_upload(key, payload.content_type)
    except storage.StorageNotConfigured as exc:
        raise _storage_unavailable() from exc

    db.commit()
    return AttachmentUploadResponse(
        attachment_id=attachment.id,
        key=key,
        upload_url=url,
        expires_in=storage.UPLOAD_URL_TTL,
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
    if not storage.is_configured():
        raise _storage_unavailable()
    try:
        url = storage.presign_download(attachment.r2_key, attachment.filename)
    except storage.StorageNotConfigured as exc:
        raise _storage_unavailable() from exc
    return AttachmentDownloadResponse(
        download_url=url, expires_in=storage.DOWNLOAD_URL_TTL
    )


@router.get("", response_model=list[AttachmentResponse])
def list_attachments(
    user: CurrentUser,
    db: DbSession,
    entity_type: Annotated[str, Query(min_length=1, max_length=64)],
    entity_id: Annotated[uuid.UUID, Query()],
) -> list[Attachment]:
    rows = db.execute(
        select(Attachment)
        .where(
            Attachment.entity_type == entity_type,
            Attachment.entity_id == entity_id,
        )
        .order_by(Attachment.created_at.desc())
    ).scalars()
    return list(rows)
