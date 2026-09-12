"""Cloudflare R2 (S3-compatible) object storage adapter — signed URLs (F/#46).

The app never proxies file bytes: clients upload/download directly to R2 using
short-lived presigned URLs. This keeps the API stateless and cheap.

Configuration is env-driven (``R2_*`` in :mod:`app.core.config`). When the
credentials are absent the adapter is *not configured* and every operation
raises :class:`StorageNotConfigured` — the routes translate that into a clear
503 so nothing silently pretends a file was stored. ``boto3`` is imported lazily
so the dependency is only required once storage is actually configured.
"""

from __future__ import annotations

import uuid

from app.core.config import settings

# Presigned URL lifetimes (seconds).
UPLOAD_URL_TTL = 15 * 60
DOWNLOAD_URL_TTL = 15 * 60


class StorageNotConfigured(RuntimeError):
    """Raised when an object-storage operation is attempted without R2 creds."""


def is_configured() -> bool:
    """True only when every R2 setting needed to sign URLs is present."""
    return all(
        [
            settings.R2_ACCOUNT_ID or settings.R2_ENDPOINT,
            settings.R2_ACCESS_KEY_ID,
            settings.R2_SECRET_ACCESS_KEY,
            settings.R2_BUCKET,
        ]
    )


def _endpoint() -> str:
    if settings.R2_ENDPOINT:
        return settings.R2_ENDPOINT
    return f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com"


def _client():
    if not is_configured():
        raise StorageNotConfigured(
            "Object storage is not configured. Set R2_ACCOUNT_ID/R2_ENDPOINT, "
            "R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET."
        )
    try:
        import boto3  # lazy — only needed when storage is configured
        from botocore.config import Config
    except ImportError as exc:  # pragma: no cover - depends on deploy env
        raise StorageNotConfigured(
            "boto3 is required for object storage but is not installed "
            "(add 'boto3' to the backend dependencies)."
        ) from exc

    return boto3.client(
        "s3",
        endpoint_url=_endpoint(),
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )


def _header_safe(value: str) -> str:
    """Strip anything that could break out of a quoted HTTP header value."""
    return "".join(
        ch
        for ch in value
        if ch not in '"\\\r\n' and 32 <= ord(ch) and ord(ch) != 127
    )[:200]


def build_key(entity_type: str, entity_id: uuid.UUID, filename: str) -> str:
    """Deterministic-ish, collision-resistant object key for an attachment.

    The random component means the caller's filename can never determine the
    key, so one upload cannot overwrite another's object even if the service
    layer's filename sanitisation were bypassed.
    """
    safe = filename.replace("/", "_").replace("\\", "_")
    return f"{entity_type}/{entity_id}/{uuid.uuid4().hex}-{safe}"


def presign_upload(key: str, *, content_type: str, content_length: int) -> str:
    """A presigned PUT URL valid ONLY for exactly this type and byte count.

    Passing ``ContentType``/``ContentLength`` as request params puts both into
    the request headers at signing time, and botocore's SigV4 query signer signs
    every non-blacklisted header present (it drops Content-Type only when it is
    the auto-set form-encoded default, which an explicit value never is). Both
    therefore land in ``X-Amz-SignedHeaders``, and R2 rejects the PUT with
    ``SignatureDoesNotMatch`` if the client sends different ones.

    That is what makes the #47 policy server-authoritative rather than advisory:
    a client that declares a 1 KB PDF gets a URL that can only ever store a 1 KB
    ``application/pdf``, no matter what it actually tries to send.
    """
    params: dict[str, object] = {
        "Bucket": settings.R2_BUCKET,
        "Key": key,
        "ContentType": content_type,
        "ContentLength": content_length,
    }
    return _client().generate_presigned_url(
        "put_object", Params=params, ExpiresIn=UPLOAD_URL_TTL
    )


def presign_download(
    key: str, *, filename: str | None = None, content_type: str | None = None
) -> str:
    """A presigned GET URL for direct download.

    Always forces ``Content-Disposition: attachment`` and overrides the response
    content type, so an object stored before the upload policy tightened (or one
    whose stored type is untrusted) is saved by the browser rather than rendered
    in the bucket's origin — closing the stored-XSS path on download.
    """
    disposition = "attachment"
    if filename:
        disposition = f'attachment; filename="{_header_safe(filename)}"'
    params: dict[str, object] = {
        "Bucket": settings.R2_BUCKET,
        "Key": key,
        "ResponseContentDisposition": disposition,
        "ResponseContentType": content_type or "application/octet-stream",
    }
    return _client().generate_presigned_url(
        "get_object", Params=params, ExpiresIn=DOWNLOAD_URL_TTL
    )
