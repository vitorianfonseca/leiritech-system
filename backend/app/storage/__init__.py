"""Object storage facade — the provider-swap point (F17).

Application code imports ``app.storage`` and never a concrete provider module.
Swapping Cloudflare R2 for another backend means writing one module that
satisfies :class:`app.storage.base.ObjectStorage` and changing the import below;
routes and services are unaffected.
"""

from app.storage.base import ObjectStorage
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
    "ObjectStorage",
    "StorageNotConfigured",
    "build_key",
    "is_configured",
    "presign_download",
    "presign_upload",
]
