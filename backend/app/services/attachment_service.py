"""Attachment authorization (#46 hardening).

Attachments are always *about* a parent record (a company, project, task…).
An attachment therefore inherits its parent's visibility: a caller may see,
list or attach a file only if they may see the parent entity. This module is
the single authorization gate the attachment routes call before minting any
presigned URL or returning any metadata — closing the IDOR where an attachment
id / (entity_type, entity_id) pair could otherwise be read or written by any
authenticated user regardless of scope (BR-002).

The per-entity ``get_*_or_404`` helpers already encapsulate each domain's
visibility rule and raise 404 (never 403 — no existence leak) when the caller
is out of scope, so we simply dispatch to them. Unknown entity types fail
closed with 404.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable

from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models.user import User
from app.services import (
    company_service,
    contact_service,
    opportunity_service,
    project_service,
    proposal_service,
    task_service,
)

# entity_type → a visibility-aware getter that raises 404 when the caller may
# not see the parent. Only these types may carry attachments; anything else is
# rejected (fail closed) rather than silently allowed.
_VISIBILITY_GETTERS: dict[str, Callable[[Session, User, uuid.UUID], object]] = {
    "company": company_service.get_company_or_404,
    "contact": contact_service.get_contact_or_404,
    "opportunity": opportunity_service.get_opportunity_or_404,
    "proposal": proposal_service.get_proposal_or_404,
    "project": project_service.get_project_or_404,
    "task": task_service.get_task_or_404,
}


def authorize_entity_access(
    db: Session, user: User, entity_type: str, entity_id: uuid.UUID
) -> None:
    """Raise 404 unless ``user`` may access the parent (entity_type, entity_id).

    Used as the read/write gate for every attachment endpoint. Because an
    attachment confers access to the file behind it, the parent's *read*
    visibility is the authoritative control here (a caller who can see the
    parent may read and attach files to it). Unknown parent types fail closed.
    """
    getter = _VISIBILITY_GETTERS.get(entity_type)
    if getter is None:
        raise ApiError(
            404,
            "NOT_FOUND",
            "Anexo não encontrado.",
        )
    # Raises 404 when out of scope — enumeration-safe (BR-002).
    getter(db, user, entity_id)
