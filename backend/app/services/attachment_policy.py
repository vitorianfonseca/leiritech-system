"""Server-authoritative upload policy for attachments (F17 / #47).

Why this module exists
----------------------
``POST /attachments/upload-url`` mints a presigned PUT and the client then talks
to R2 *directly* — the API never sees the bytes. Everything the request says
about the file (``filename``, ``content_type``, ``size_bytes``) is therefore
attacker-controlled. Before #47 the route trusted that payload: a missing
``content_type`` skipped the MIME allowlist entirely, a missing ``size_bytes``
skipped the size cap, and no extension check existed at all — so ``evil.exe``
declared as ``application/pdf`` (or with no type at all) got a signed URL.

This module is the single decision point that turns the client's *claims* into a
**server-decided** ``UploadPolicy``. The route signs the URL with the values this
function returns, never with the values the client sent:

1. The filename is sanitised (no path segments, no control characters).
2. Every extension component is checked against a dangerous-extension denylist,
   so ``invoice.pdf.exe`` and ``report.exe.pdf`` both fail (double-extension).
3. The final extension must be on the allowlist; it — not the client — decides
   the canonical content type that gets baked into the signature.
4. A client-supplied content type is only accepted when it agrees with the
   extension; it can never widen what the extension allows.
5. The size must be present and within :data:`MAX_ATTACHMENT_SIZE_BYTES`.

The returned ``content_type``/``size_bytes`` are then signed into the presigned
PUT as ``Content-Type``/``Content-Length`` (see :mod:`app.storage.r2`), which puts
them in ``X-Amz-SignedHeaders``. R2 rejects any PUT whose actual headers differ,
so a client cannot declare a 1 KB PDF and then upload a 2 GB executable.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import status

from app.core.errors import ApiError

# 25 MiB — generous for proposal PDFs / images, small enough to bound abuse.
MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024

# Object keys and Content-Disposition headers are built from this.
MAX_FILENAME_LENGTH = 255

# Extensions that are never accepted, whatever content type is claimed. Checked
# against EVERY dot-separated component of the filename, not just the last one,
# so a double extension cannot smuggle one past the allowlist. Covers native
# executables and libraries, shell/script interpreters, installer and archive
# images, shortcut/registry formats, and markup that browsers execute (HTML and
# SVG are stored-XSS vectors the moment a file is served from a public bucket).
DANGEROUS_EXTENSIONS = frozenset(
    {
        # Windows executables / libraries
        "exe", "com", "scr", "pif", "msi", "msp", "cpl", "dll", "sys", "drv", "ocx",
        # Windows scripting
        "bat", "cmd", "ps1", "psm1", "ps1xml", "vbs", "vbe", "wsf", "wsh", "hta",
        # Unix / cross-platform scripting
        "sh", "bash", "zsh", "csh", "ksh", "run", "bin", "elf", "so", "dylib",
        "js", "jse", "mjs", "cjs", "py", "pyc", "pyo", "pyw", "rb", "pl", "pm",
        # Server-side templates that a misconfigured host would execute
        "php", "php3", "php4", "php5", "phtml", "phar", "asp", "aspx", "jsp",
        "jspx", "cgi", "cfm", "htaccess", "htpasswd",
        # JVM / mobile / desktop packages
        "jar", "class", "war", "ear", "apk", "dex", "ipa", "app", "jnlp",
        "dmg", "pkg", "deb", "rpm", "appimage", "msix", "appx",
        # Shortcuts, registry, config-as-code
        "lnk", "url", "desktop", "scf", "reg", "inf", "ins", "isp", "job", "ws",
        "library-ms", "settingcontent-ms", "msc", "gadget",
        # Browser-executable markup (stored XSS)
        "html", "htm", "xhtml", "shtml", "svg", "svgz", "xml", "xsl", "xslt",
        "swf", "mht", "mhtml",
        # Disk / help images that can carry any of the above
        "iso", "img", "vhd", "vhdx", "vmdk", "chm", "hlp",
    }
)


@dataclass(frozen=True)
class _ExtensionRule:
    """The canonical content type for an extension, plus the types a client may
    legitimately declare for it (browsers and OSes disagree on a few)."""

    canonical: str
    accepted: frozenset[str]


def _rule(canonical: str, *also: str) -> _ExtensionRule:
    return _ExtensionRule(canonical, frozenset({canonical, *also}))


# The extension allowlist. The extension is authoritative: it selects the
# content type that gets signed, so the client cannot pick one freely.
EXTENSION_RULES: dict[str, _ExtensionRule] = {
    "pdf": _rule("application/pdf"),
    "png": _rule("image/png"),
    "jpg": _rule("image/jpeg", "image/jpg"),
    "jpeg": _rule("image/jpeg", "image/jpg"),
    "webp": _rule("image/webp"),
    "gif": _rule("image/gif"),
    "heic": _rule("image/heic"),
    "txt": _rule("text/plain"),
    "md": _rule("text/markdown", "text/plain"),
    "csv": _rule("text/csv", "application/csv", "text/plain"),
    "doc": _rule("application/msword"),
    "docx": _rule(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ),
    "xls": _rule("application/vnd.ms-excel"),
    "xlsx": _rule(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ),
    "ppt": _rule("application/vnd.ms-powerpoint"),
    "pptx": _rule(
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    ),
    "odt": _rule("application/vnd.oasis.opendocument.text"),
    "ods": _rule("application/vnd.oasis.opendocument.spreadsheet"),
    "odp": _rule("application/vnd.oasis.opendocument.presentation"),
    "zip": _rule("application/zip", "application/x-zip-compressed"),
}

# Every content type any allowed extension may carry. Used to decide whether a
# *stored* mime type is safe to echo back on download.
ALLOWED_CONTENT_TYPES: frozenset[str] = frozenset(
    ct for rule in EXTENSION_RULES.values() for ct in rule.accepted
)

# Clients send this when the OS/browser could not sniff a type; it is a
# "don't know", not a claim, so it is treated as if no type had been sent.
_UNKNOWN_CONTENT_TYPES = frozenset({"", "application/octet-stream", "binary/octet-stream"})

_TYPE_NOT_ALLOWED = "ATTACHMENT_TYPE_NOT_ALLOWED"
_FILENAME_INVALID = "ATTACHMENT_FILENAME_INVALID"
_TOO_LARGE = "ATTACHMENT_TOO_LARGE"


@dataclass(frozen=True)
class UploadPolicy:
    """What the server decided. The route must sign and persist *these* values,
    not the ones the client sent."""

    filename: str
    content_type: str
    size_bytes: int


def _reject(code: str, message: str, **details: object) -> ApiError:
    return ApiError(
        status.HTTP_422_UNPROCESSABLE_ENTITY, code, message, details=dict(details)
    )


def sanitize_filename(raw: str) -> str:
    """Reduce a client-supplied filename to a bare, safe basename.

    Strips any directory component (``/`` and ``\\``, so ``../../etc/passwd``
    becomes ``passwd``) and rejects control characters, trailing dots/spaces
    (which Windows silently trims, defeating an extension check) and names that
    are nothing but dots.
    """
    name = raw.replace("\\", "/").rsplit("/", 1)[-1].strip()

    if any(ord(ch) < 32 or ord(ch) == 127 for ch in name):
        raise _reject(_FILENAME_INVALID, "O nome do ficheiro é inválido.")
    # Windows strips trailing dots/spaces on save: "evil.exe. " would land as
    # "evil.exe" while our extension check saw " " as the extension.
    if name != name.rstrip(". "):
        raise _reject(_FILENAME_INVALID, "O nome do ficheiro é inválido.")
    if not name or set(name) <= {"."}:
        raise _reject(_FILENAME_INVALID, "O nome do ficheiro é inválido.")
    if len(name) > MAX_FILENAME_LENGTH:
        raise _reject(
            _FILENAME_INVALID,
            "O nome do ficheiro é demasiado longo.",
            max_length=MAX_FILENAME_LENGTH,
        )
    return name


def _resolve_extension(filename: str) -> tuple[str, _ExtensionRule]:
    # Leading dot ignored so ".env.txt" is read as extension "txt", while a
    # bare dotfile like ".env" has no extension at all and is rejected below.
    components = filename.lstrip(".").lower().split(".")
    if len(components) < 2:
        raise _reject(
            _TYPE_NOT_ALLOWED,
            "O ficheiro tem de ter uma extensão permitida.",
            reason="missing_extension",
        )

    # Every component after the stem, so neither "a.pdf.exe" nor "a.exe.pdf"
    # slips through on the strength of its final extension alone.
    for component in components[1:]:
        if component in DANGEROUS_EXTENSIONS:
            raise _reject(
                _TYPE_NOT_ALLOWED,
                "Este tipo de ficheiro não é permitido.",
                reason="dangerous_extension",
                extension=component,
            )

    extension = components[-1]
    rule = EXTENSION_RULES.get(extension)
    if rule is None:
        raise _reject(
            _TYPE_NOT_ALLOWED,
            "Este tipo de ficheiro não é permitido.",
            reason="extension_not_allowed",
            extension=extension,
        )
    return extension, rule


def _resolve_content_type(declared: str | None, rule: _ExtensionRule) -> str:
    """The extension decides the type; a declared type may only agree with it."""
    if declared is None:
        return rule.canonical
    # "text/csv; charset=utf-8" -> "text/csv"
    normalized = declared.split(";", 1)[0].strip().lower()
    if normalized in _UNKNOWN_CONTENT_TYPES:
        return rule.canonical
    if normalized not in rule.accepted:
        raise _reject(
            _TYPE_NOT_ALLOWED,
            "Este tipo de ficheiro não é permitido.",
            reason="content_type_mismatch",
            declared=normalized,
            expected=rule.canonical,
        )
    # Always sign the canonical spelling so the signature is deterministic.
    return rule.canonical


def _resolve_size(size_bytes: int | None) -> int:
    if size_bytes is None:
        raise _reject(
            _TOO_LARGE,
            "O tamanho do ficheiro é obrigatório.",
            reason="size_required",
            max_bytes=MAX_ATTACHMENT_SIZE_BYTES,
        )
    if size_bytes <= 0:
        raise _reject(
            _TOO_LARGE,
            "O ficheiro está vazio.",
            reason="empty_file",
            max_bytes=MAX_ATTACHMENT_SIZE_BYTES,
        )
    if size_bytes > MAX_ATTACHMENT_SIZE_BYTES:
        raise _reject(
            _TOO_LARGE,
            "O ficheiro excede o tamanho máximo permitido (25 MB).",
            reason="too_large",
            max_bytes=MAX_ATTACHMENT_SIZE_BYTES,
        )
    return size_bytes


def validate_upload(
    filename: str, content_type: str | None, size_bytes: int | None
) -> UploadPolicy:
    """Turn the client's claims into server-decided upload parameters.

    Raises :class:`ApiError` (422) on any violation. The caller must use the
    returned values for both the presigned URL and the persisted metadata — the
    whole point is that the client's own values are never what gets signed.
    """
    safe_name = sanitize_filename(filename)
    _, rule = _resolve_extension(safe_name)
    return UploadPolicy(
        filename=safe_name,
        content_type=_resolve_content_type(content_type, rule),
        size_bytes=_resolve_size(size_bytes),
    )


def safe_download_content_type(stored_mime: str | None) -> str:
    """The content type it is safe to have R2 return on download.

    Anything not on the allowlist (including rows written before #47 tightened
    the rules) degrades to ``application/octet-stream`` so the browser saves it
    instead of rendering it.
    """
    if stored_mime and stored_mime.split(";", 1)[0].strip().lower() in ALLOWED_CONTENT_TYPES:
        return stored_mime.split(";", 1)[0].strip().lower()
    return "application/octet-stream"
