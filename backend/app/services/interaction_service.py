"""Interaction (timeline) business logic (CRM F4).

Interactions are the CRM timeline: calls, meetings, emails, messages, notes and
follow-ups linked to a company/contact/opportunity/project. Reads are scoped for
a Membro (BR-002); logging is permitted for a Membro only on entities within
their own project scope (matrix §3). Every logged interaction also writes an
append-only audit entry (BR-064).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import structlog
from sqlalchemy.orm import Session

from app.core import errors
from app.core.permissions import Role, role_at_least
from app.models.crm import Company, Contact, Interaction, Opportunity
from app.models.project import Project
from app.models.user import User
from app.repositories import crm as crm_repo
from app.schemas.crm import InteractionCreate
from app.services import activity_service

logger = structlog.get_logger("aurea.crm.interaction")

ENTITY_TYPE = "interaction"


def _is_membro(user: User) -> bool:
    return not role_at_least(user.role, Role.GESTOR)


def _validate_links(db: Session, payload: InteractionCreate) -> None:
    """Every referenced entity must exist (404 otherwise)."""
    if payload.company_id and db.get(Company, payload.company_id) is None:
        raise errors.not_found("Empresa não encontrada.", code="COMPANY_NOT_FOUND")
    if payload.contact_id and db.get(Contact, payload.contact_id) is None:
        raise errors.not_found("Contacto não encontrado.", code="CONTACT_NOT_FOUND")
    if payload.opportunity_id and db.get(Opportunity, payload.opportunity_id) is None:
        raise errors.not_found(
            "Oportunidade não encontrada.", code="OPPORTUNITY_NOT_FOUND"
        )
    if payload.project_id and db.get(Project, payload.project_id) is None:
        raise errors.not_found("Projeto não encontrado.", code="PROJECT_NOT_FOUND")


def _assert_membro_may_log(db: Session, user: User, payload: InteractionCreate) -> None:
    """A Membro may log only on an entity within their own scope (matrix §3)."""
    if payload.project_id and crm_repo.membro_is_project_member(
        db, user.id, payload.project_id
    ):
        return
    if payload.company_id:
        company = db.get(Company, payload.company_id)
        if company and crm_repo.membro_can_see_company(db, user.id, company):
            return
    if payload.contact_id:
        contact = db.get(Contact, payload.contact_id)
        if contact and crm_repo.membro_can_see_contact(db, user.id, contact):
            return
    raise errors.forbidden(
        "Só pode registar interações nos seus próprios projetos/clientes.",
        code="INTERACTION_FORBIDDEN",
    )


def create_interaction(
    db: Session, user: User, payload: InteractionCreate
) -> Interaction:
    _validate_links(db, payload)
    if _is_membro(user):
        _assert_membro_may_log(db, user, payload)

    interaction = Interaction(
        type=payload.type,
        company_id=payload.company_id,
        contact_id=payload.contact_id,
        opportunity_id=payload.opportunity_id,
        project_id=payload.project_id,
        body=payload.body,
        occurred_at=payload.occurred_at or datetime.now(tz=UTC),
        user_id=user.id,
        created_by=user.id,
    )
    db.add(interaction)
    db.flush()
    activity_service.record(
        db,
        entity_type=ENTITY_TYPE,
        entity_id=interaction.id,
        action="interaction.logged",
        actor_id=user.id,
        after={
            "type": interaction.type,
            "company_id": str(interaction.company_id) if interaction.company_id else None,
            "contact_id": str(interaction.contact_id) if interaction.contact_id else None,
            "opportunity_id": (
                str(interaction.opportunity_id) if interaction.opportunity_id else None
            ),
            "project_id": str(interaction.project_id) if interaction.project_id else None,
        },
    )
    logger.info(
        "interaction_logged",
        interaction_id=str(interaction.id),
        type=interaction.type,
        actor_id=str(user.id),
    )
    return interaction


def list_interactions(
    db: Session,
    user: User,
    *,
    company_id: uuid.UUID | None,
    contact_id: uuid.UUID | None,
    opportunity_id: uuid.UUID | None,
    project_id: uuid.UUID | None,
    page: int,
    page_size: int,
) -> tuple[list[Interaction], int]:
    scope_filter = (
        crm_repo.membro_interaction_filter(user.id) if _is_membro(user) else None
    )
    return crm_repo.list_interactions(
        db,
        scope_filter=scope_filter,
        company_id=company_id,
        contact_id=contact_id,
        opportunity_id=opportunity_id,
        project_id=project_id,
        page=page,
        page_size=page_size,
    )
