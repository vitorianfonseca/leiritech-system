"""The object-storage contract the rest of the app codes against (F17).

F17 requires an abstraction layer so the storage provider can be swapped. That
layer is the :mod:`app.storage` package facade: application code imports
``app.storage`` and never ``app.storage.r2``. This module states the contract a
provider module must satisfy, so "swap the provider" means writing one module
with these four functions and changing the import in ``app/storage/__init__.py``
— nothing in the routes or services moves.

The contract is deliberately presigned-URL shaped: the API never proxies bytes,
so a provider must be able to mint short-lived, *constrained* upload URLs. The
constraints are not decorative — ``presign_upload`` takes ``content_type`` and
``content_length`` because they must be bound into the credential the client
gets, which is what makes the size/MIME policy unbypassable (#47).
"""

from __future__ import annotations

import uuid
from typing import Protocol


class ObjectStorage(Protocol):
    """Structural contract for a storage provider module (see r2.py)."""

    def is_configured(self) -> bool:
        """True only when the provider has everything it needs to sign URLs."""
        ...

    def build_key(
        self, entity_type: str, entity_id: uuid.UUID, filename: str
    ) -> str:
        """A collision-resistant object key for an attachment."""
        ...

    def presign_upload(
        self, key: str, *, content_type: str, content_length: int
    ) -> str:
        """A short-lived upload URL that is only valid for a body of exactly
        ``content_length`` bytes with exactly ``content_type``.

        Implementations MUST bind both values to the credential (not merely
        advertise them), so a client that lied in the presign request cannot
        upload something else with the URL it was handed.
        """
        ...

    def presign_download(
        self, key: str, *, filename: str | None = None, content_type: str | None = None
    ) -> str:
        """A short-lived download URL that forces an attachment disposition."""
        ...
