"""Local-filesystem storage provider (F17).

Satisfies :class:`app.storage.base.ObjectStorage` by keeping objects under a
directory on disk. It exists so file attachments work on a developer machine
and in a self-hosted deployment without a Cloudflare account — R2 stays the
production provider and the facade in ``app/storage/__init__.py`` picks between
them from configuration alone.

The contract is presigned-URL shaped, and that shape is not decorative: the
upload credential has to *bind* the content type and byte count so a client
that lied at presign time cannot store something else with the URL it was
handed (#47). A filesystem cannot sign S3 credentials, so this provider mints
an HMAC token over ``key | content_type | content_length | expiry`` and points
at the local transfer routes, which recompute the HMAC and then enforce both
values against the body they actually receive. A tampered token fails the MAC;
an honest token with a different body fails the length or type check. The
guarantee is the same one R2 gives, arrived at differently.

The token is signed with ``JWT_SECRET`` — already required to be strong in
production by the settings validator — under a distinct HMAC prefix so a
storage token can never be replayed as a session token.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import time
import uuid
from pathlib import Path
from urllib.parse import urlencode

from app.core.config import settings

UPLOAD_URL_TTL = 15 * 60
DOWNLOAD_URL_TTL = 15 * 60

# Domain separation: a storage token and a session token are signed with the
# same secret and must never be interchangeable.
_UPLOAD_PURPOSE = "storage:upload"
_DOWNLOAD_PURPOSE = "storage:download"


class StorageNotConfigured(RuntimeError):
    """Raised when the provider cannot serve a request for want of settings."""


def _root() -> Path:
    return Path(settings.LOCAL_STORAGE_DIR).expanduser().resolve()


def is_configured() -> bool:
    """True when a writable root directory is set and reachable."""
    if not settings.LOCAL_STORAGE_DIR:
        return False
    try:
        _root().mkdir(parents=True, exist_ok=True)
        return os.access(_root(), os.W_OK)
    except OSError:
        return False


def build_key(entity_type: str, entity_id: uuid.UUID, filename: str) -> str:
    """Collision-resistant object key. Same shape as the R2 provider: the
    random component means a caller's filename can never determine the key, so
    one upload cannot overwrite another's object."""
    safe = filename.replace("/", "_").replace("\\", "_")
    return f"{entity_type}/{entity_id}/{uuid.uuid4().hex}-{safe}"


def resolve(key: str) -> Path:
    """Absolute path for ``key``, guaranteed to stay inside the storage root.

    Keys are built by :func:`build_key`, but this is the function the transfer
    routes hand a value that arrived over the wire, so it re-checks rather than
    trusting the caller: a key containing ``..`` resolves outside the root and
    is rejected here rather than reading or writing an arbitrary file.
    """
    root = _root()
    path = (root / key).resolve()
    if path != root and root not in path.parents:
        raise StorageNotConfigured("Chave de armazenamento inválida.")
    return path


def _sign(purpose: str, parts: list[str]) -> str:
    msg = "|".join([purpose, *parts]).encode()
    return hmac.new(settings.JWT_SECRET.encode(), msg, hashlib.sha256).hexdigest()


def verify_upload(
    key: str, content_type: str, content_length: int, expires: int, signature: str
) -> None:
    """Raise unless the token is intact and unexpired."""
    _verify(
        _UPLOAD_PURPOSE,
        [key, content_type, str(content_length), str(expires)],
        expires,
        signature,
    )


def verify_download(key: str, expires: int, signature: str) -> None:
    _verify(_DOWNLOAD_PURPOSE, [key, str(expires)], expires, signature)


def _verify(purpose: str, parts: list[str], expires: int, signature: str) -> None:
    expected = _sign(purpose, parts)
    # compare_digest: constant time, so a wrong signature cannot be discovered
    # byte by byte from response timing.
    if not hmac.compare_digest(expected, signature):
        raise StorageNotConfigured("Assinatura de armazenamento inválida.")
    if time.time() > expires:
        raise StorageNotConfigured("Ligação de armazenamento expirada.")


def _url(path: str, params: dict[str, object]) -> str:
    base = settings.PUBLIC_API_URL.rstrip("/") or ""
    return f"{base}{settings.API_V1_PREFIX}{path}?{urlencode(params)}"


def presign_upload(key: str, *, content_type: str, content_length: int) -> str:
    """An upload URL valid only for exactly this type and byte count.

    Both values are inside the MAC, and ``PUT /attachments/local`` enforces
    them against the body it receives — so, as with R2, a client that declared
    a 1 KB PDF cannot use the URL to store anything else.
    """
    if not is_configured():
        raise StorageNotConfigured(
            "O armazenamento local não está configurado (LOCAL_STORAGE_DIR)."
        )
    expires = int(time.time()) + UPLOAD_URL_TTL
    sig = _sign(
        _UPLOAD_PURPOSE, [key, content_type, str(content_length), str(expires)]
    )
    return _url(
        "/attachments/local",
        {
            "key": key,
            "content_type": content_type,
            "content_length": content_length,
            "expires": expires,
            "signature": sig,
        },
    )


def presign_download(
    key: str, *, filename: str | None = None, content_type: str | None = None
) -> str:
    """A short-lived download URL. Disposition and response content type are
    decided by the route from values vetted at upload time, not from anything
    in this URL, so a stored file cannot be coaxed into rendering inline."""
    if not is_configured():
        raise StorageNotConfigured(
            "O armazenamento local não está configurado (LOCAL_STORAGE_DIR)."
        )
    expires = int(time.time()) + DOWNLOAD_URL_TTL
    sig = _sign(_DOWNLOAD_PURPOSE, [key, str(expires)])
    params: dict[str, object] = {"key": key, "expires": expires, "signature": sig}
    if filename:
        params["filename"] = filename
    return _url("/attachments/local", params)
