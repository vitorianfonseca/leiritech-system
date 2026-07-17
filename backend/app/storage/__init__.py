"""Object storage (Cloudflare R2 / S3-compatible) — signed-URL adapter."""

from app.storage.r2 import (
    DOWNLOAD_URL_TTL,
    UPLOAD_URL_TTL,
    StorageNotConfigured,
    build_key,
    is_configured,
    presign_download,
    presign_upload,
)

__all__ = [
    "DOWNLOAD_URL_TTL",
    "UPLOAD_URL_TTL",
    "StorageNotConfigured",
    "build_key",
    "is_configured",
    "presign_download",
    "presign_upload",
]
