"""Object storage facade — the provider-swap point (F17).

Application code imports ``app.storage`` and never a concrete provider module.

Which provider answers is decided here, once, from configuration: R2 when its
credentials are present, the local filesystem otherwise. That fallback is what
makes attachments work on a developer machine and in a self-hosted deployment
without a Cloudflare account — the routes and services are identical either
way, because both providers satisfy :class:`app.storage.base.ObjectStorage`.
"""

from app.storage import local as _local
from app.storage import r2 as _r2
from app.storage.base import ObjectStorage

_provider = _r2 if _r2.is_configured() else _local

DOWNLOAD_URL_TTL = _provider.DOWNLOAD_URL_TTL
UPLOAD_URL_TTL = _provider.UPLOAD_URL_TTL


class StorageNotConfigured(RuntimeError):
    """Raised when no provider can serve a request.

    Declared here rather than re-exported so `except storage.StorageNotConfigured`
    catches whichever provider raised — each module defines its own.
    """


def _wrap(fn):
    def call(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except (_r2.StorageNotConfigured, _local.StorageNotConfigured) as exc:
            raise StorageNotConfigured(str(exc)) from exc

    return call


is_configured = _provider.is_configured
build_key = _provider.build_key
presign_upload = _wrap(_provider.presign_upload)
presign_download = _wrap(_provider.presign_download)

#: The active provider module, for the local transfer routes.
provider = _provider

__all__ = [
    "DOWNLOAD_URL_TTL",
    "UPLOAD_URL_TTL",
    "ObjectStorage",
    "StorageNotConfigured",
    "build_key",
    "is_configured",
    "presign_download",
    "presign_upload",
    "provider",
]
