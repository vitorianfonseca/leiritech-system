"""Financial ops business logic (F14, BR-065..073) — internal tracking only.

Every payment-milestone and project-cost mutation flows through here so the
lifecycle state machine (§1.7), the BR-071 create prerequisites (completion
criteria + amount + expected date), the "no new milestone on a cancelled/
archived project" seam handed over by the projects domain (BR-037/BR-053), the
received-amount reconciliation guards, and the audit trail (BR-064) are enforced
in exactly one place. Route handlers stay thin: gate, delegate, serialize.

Access control (BR-008) is enforced upstream by the ``RequireFinance`` dependency
— Admin, or a Gestor holding the ``payments_grant``. A Membro never reaches this
module. No fiscal document is ever produced (BR-070/072/073); ``invoiced`` only
records that an external certified system issued the real invoice.

Money is integer EUR cents throughout.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

import structlog
from sqlalchemy.orm import Session

from app.core import errors
from app.core.clock import today as app_today
from app.models.finance import PaymentMilestone, ProjectCost
from app.models.project import Project
from app.models.user import User
from app.repositories import finance as finance_repo
from app.schemas.finance import (
    PaymentMilestoneCreate,
    PaymentMilestoneStatusChange,
    PaymentMilestoneUpdate,
    ProjectCostCreate,
    ProjectCostUpdate,
    ProjectFinancialSummary,
)
from app.services import activity_service, notification_service

logger = structlog.get_logger("leiritech.finance")

MILESTONE_ENTITY = "payment_milestone"
COST_ENTITY = "project_cost"

# Seam from the projects domain (BR-037/BR-053): a cancelled or archived project
# is closed to NEW payment milestones. Narrower than project_service.is_frozen
# (which also freezes on_hold/completed) — payments may still be recorded against
# a completed project, but never against one that was cancelled or archived.
_MILESTONE_CREATE_BLOCKED = ("cancelled", "archived")

# §1.7 valid transitions. ``planned`` is creation-only and never a target.
_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "planned": {"invoiced", "partially_paid", "paid", "overdue", "cancelled"},
    "invoiced": {"partially_paid", "paid", "overdue", "cancelled"},
    "partially_paid": {"paid", "overdue", "cancelled"},
    "overdue": {"partially_paid", "paid", "cancelled"},
    "paid": set(),
    "cancelled": set(),
}

_MILESTONE_SNAPSHOT_FIELDS = (
    "project_id",
    "company_id",
    "amount",
    "expected_date",
    "invoiced_date",
    "paid_date",
    "received_amount",
    "confirmer_id",
    "external_invoice_ref",
    "status",
)


def _snapshot(milestone: PaymentMilestone) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for field in _MILESTONE_SNAPSHOT_FIELDS:
        value = getattr(milestone, field)
        if isinstance(value, uuid.UUID | date | datetime):
            value = str(value)
        out[field] = value
    return out


# --------------------------------------------------------------------------- #
# Shared helpers
# --------------------------------------------------------------------------- #
def _get_project_or_404(db: Session, project_id: uuid.UUID) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise errors.not_found("Projeto não encontrado.", code="PROJECT_NOT_FOUND")
    return project


def _get_milestone_or_404(db: Session, milestone_id: uuid.UUID) -> PaymentMilestone:
    milestone = finance_repo.get_milestone(db, milestone_id)
    if milestone is None:
        raise errors.not_found(
            "Marco de pagamento não encontrado.", code="MILESTONE_NOT_FOUND"
        )
    return milestone


def _get_cost_or_404(db: Session, cost_id: uuid.UUID) -> ProjectCost:
    cost = finance_repo.get_cost(db, cost_id)
    if cost is None:
        raise errors.not_found("Custo não encontrado.", code="COST_NOT_FOUND")
    return cost


# --------------------------------------------------------------------------- #
# Payment milestones — reads
# --------------------------------------------------------------------------- #
def list_milestones(
    db: Session,
    *,
    project_id: uuid.UUID | None,
    company_id: uuid.UUID | None,
    status: str | None,
    page: int,
    page_size: int,
) -> tuple[list[PaymentMilestone], int]:
    return finance_repo.list_milestones(
        db,
        project_id=project_id,
        company_id=company_id,
        status=status,
        page=page,
        page_size=page_size,
    )


def get_milestone(db: Session, milestone_id: uuid.UUID) -> PaymentMilestone:
    return _get_milestone_or_404(db, milestone_id)


# --------------------------------------------------------------------------- #
# Payment milestones — writes
# --------------------------------------------------------------------------- #
def create_milestone(
    db: Session, user: User, payload: PaymentMilestoneCreate
) -> PaymentMilestone:
    project = _get_project_or_404(db, payload.project_id)
    if project.status in _MILESTONE_CREATE_BLOCKED:
        raise errors.conflict(
            "Não é possível criar marcos num projeto cancelado ou arquivado.",
            code="PROJECT_FROZEN",
        )
    milestone = PaymentMilestone(
        project_id=project.id,
        company_id=payload.company_id or project.company_id,
        description=payload.description,
        amount=payload.amount,
        expected_date=payload.expected_date,
        completion_criteria=payload.completion_criteria,
        reference=payload.reference,
        notes=payload.notes,
        status="planned",
        created_by=user.id,
    )
    db.add(milestone)
    db.flush()
    activity_service.record(
        db,
        entity_type=MILESTONE_ENTITY,
        entity_id=milestone.id,
        action="payment_milestone.created",
        actor_id=user.id,
        after=_snapshot(milestone),
    )
    logger.info(
        "payment_milestone_created",
        milestone_id=str(milestone.id),
        project_id=str(project.id),
        actor_id=str(user.id),
    )
    return milestone


def update_milestone(
    db: Session,
    user: User,
    milestone_id: uuid.UUID,
    payload: PaymentMilestoneUpdate,
) -> PaymentMilestone:
    milestone = _get_milestone_or_404(db, milestone_id)
    if milestone.status in ("paid", "cancelled"):
        raise errors.conflict(
            "Marco terminal (pago/cancelado) não pode ser editado.",
            code="MILESTONE_TERMINAL",
        )
    before = _snapshot(milestone)
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(milestone, field, value)
    db.flush()
    activity_service.record(
        db,
        entity_type=MILESTONE_ENTITY,
        entity_id=milestone.id,
        action="payment_milestone.updated",
        actor_id=user.id,
        before=before,
        after=_snapshot(milestone),
    )
    logger.info(
        "payment_milestone_updated",
        milestone_id=str(milestone.id),
        actor_id=str(user.id),
    )
    return milestone


def change_milestone_status(
    db: Session,
    user: User,
    milestone_id: uuid.UUID,
    payload: PaymentMilestoneStatusChange,
) -> PaymentMilestone:
    """Drive one lifecycle transition (§1.7). Illegal transition → 409."""
    milestone = _get_milestone_or_404(db, milestone_id)
    current = milestone.status
    target = payload.status

    # Terminal states first, so we can surface the precise operator message.
    if current == "paid":
        raise errors.conflict(
            "Marco pago não pode ser alterado. Contacte um Administrador para "
            "correções.",
            code="MILESTONE_PAID_TERMINAL",
        )
    if current == "cancelled":
        raise errors.conflict(
            "Marco cancelado. Crie um novo marco se necessário.",
            code="MILESTONE_CANCELLED_TERMINAL",
        )
    if target == current or target not in _ALLOWED_TRANSITIONS.get(current, set()):
        raise errors.conflict(
            f"Transição inválida de '{current}' para '{target}'.",
            code="MILESTONE_ILLEGAL_TRANSITION",
        )

    before = _snapshot(milestone)
    today = app_today()

    if target == "invoiced":
        _apply_invoiced(milestone, payload, today)
    elif target == "partially_paid":
        _apply_partially_paid(milestone, user, payload, today)
    elif target == "paid":
        _apply_paid(milestone, user, payload, today)
    elif target == "overdue":
        _apply_overdue(milestone, today)
    elif target == "cancelled":
        _apply_cancelled(milestone, payload)

    milestone.status = target
    db.flush()
    activity_service.record(
        db,
        entity_type=MILESTONE_ENTITY,
        entity_id=milestone.id,
        action=f"payment_milestone.{target}",
        actor_id=user.id,
        before=before,
        after=_snapshot(milestone),
    )
    # Event notification (F15 'payment confirmed'): tell the project manager when
    # money is received (partial or full).
    if target in ("paid", "partially_paid"):
        project = db.get(Project, milestone.project_id)
        if (
            project is not None
            and project.manager_id is not None
            and project.manager_id != user.id
        ):
            amount = (milestone.received_amount or milestone.amount or 0) / 100
            notification_service.create_notification(
                db,
                user_id=project.manager_id,
                type="payment_confirmed",
                body=(
                    f"Pagamento registado no projeto «{project.name}» "
                    f"({amount:.2f}€)."
                ),
                entity_type=MILESTONE_ENTITY,
                entity_id=milestone.id,
            )
    logger.info(
        "payment_milestone_status_changed",
        milestone_id=str(milestone.id),
        from_status=current,
        to_status=target,
        actor_id=str(user.id),
    )
    return milestone


# --------------------------------------------------------------------------- #
# Transition guards (§1.7)
# --------------------------------------------------------------------------- #
def _apply_invoiced(
    milestone: PaymentMilestone,
    payload: PaymentMilestoneStatusChange,
    today: date,
) -> None:
    ref = payload.external_invoice_ref or milestone.external_invoice_ref
    if not ref:
        raise errors.bad_request(
            "É necessária uma referência externa da fatura para marcar como "
            "faturado.",
            code="EXTERNAL_REF_REQUIRED",
        )
    milestone.external_invoice_ref = ref
    milestone.invoiced_date = today


def _apply_partially_paid(
    milestone: PaymentMilestone,
    user: User,
    payload: PaymentMilestoneStatusChange,
    today: date,
) -> None:
    received = payload.received_amount
    if received is None:
        raise errors.bad_request(
            "É necessário indicar o valor recebido.",
            code="RECEIVED_AMOUNT_REQUIRED",
        )
    if not (0 < received < milestone.amount):
        raise errors.conflict(
            "O valor de pagamento parcial deve ser superior a zero e inferior ao "
            "valor do marco.",
            code="MILESTONE_AMOUNT_MISMATCH",
        )
    milestone.received_amount = received
    milestone.confirmer_id = user.id
    milestone.paid_date = payload.paid_date or today


def _apply_paid(
    milestone: PaymentMilestone,
    user: User,
    payload: PaymentMilestoneStatusChange,
    today: date,
) -> None:
    received = (
        payload.received_amount
        if payload.received_amount is not None
        else milestone.amount
    )
    if received < milestone.amount:
        raise errors.conflict(
            "O valor recebido não corresponde ao valor contratado.",
            code="MILESTONE_AMOUNT_MISMATCH",
        )
    milestone.received_amount = received
    milestone.confirmer_id = user.id
    milestone.paid_date = payload.paid_date or today


def _apply_overdue(milestone: PaymentMilestone, today: date) -> None:
    if milestone.expected_date is None or milestone.expected_date >= today:
        raise errors.conflict(
            "Um marco só fica vencido após a data prevista.",
            code="MILESTONE_NOT_YET_OVERDUE",
        )


def _apply_cancelled(
    milestone: PaymentMilestone, payload: PaymentMilestoneStatusChange
) -> None:
    if not payload.reason or not payload.reason.strip():
        raise errors.bad_request(
            "É necessário indicar o motivo do cancelamento.",
            code="CANCEL_REASON_REQUIRED",
        )
    reason = payload.reason.strip()
    milestone.notes = (
        f"{milestone.notes}\n[cancelado] {reason}"
        if milestone.notes
        else f"[cancelado] {reason}"
    )


# --------------------------------------------------------------------------- #
# Project costs (BR-069 / H8)
# --------------------------------------------------------------------------- #
def list_costs(
    db: Session, *, project_id: uuid.UUID | None, page: int, page_size: int
) -> tuple[list[ProjectCost], int]:
    if project_id is not None:
        _get_project_or_404(db, project_id)
    return finance_repo.list_costs(
        db, project_id=project_id, page=page, page_size=page_size
    )


def get_cost(db: Session, cost_id: uuid.UUID) -> ProjectCost:
    return _get_cost_or_404(db, cost_id)


def create_cost(db: Session, user: User, payload: ProjectCostCreate) -> ProjectCost:
    _get_project_or_404(db, payload.project_id)
    cost = ProjectCost(
        project_id=payload.project_id,
        description=payload.description,
        amount=payload.amount,
        date=payload.date,
        created_by=user.id,
    )
    db.add(cost)
    db.flush()
    activity_service.record(
        db,
        entity_type=COST_ENTITY,
        entity_id=cost.id,
        action="project_cost.created",
        actor_id=user.id,
        after={"project_id": str(cost.project_id), "amount": cost.amount},
    )
    logger.info(
        "project_cost_created",
        cost_id=str(cost.id),
        project_id=str(cost.project_id),
        actor_id=str(user.id),
    )
    return cost


def update_cost(
    db: Session, user: User, cost_id: uuid.UUID, payload: ProjectCostUpdate
) -> ProjectCost:
    cost = _get_cost_or_404(db, cost_id)
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(cost, field, value)
    db.flush()
    activity_service.record(
        db,
        entity_type=COST_ENTITY,
        entity_id=cost.id,
        action="project_cost.updated",
        actor_id=user.id,
        after={"amount": cost.amount},
    )
    logger.info("project_cost_updated", cost_id=str(cost.id), actor_id=str(user.id))
    return cost


def delete_cost(db: Session, user: User, cost_id: uuid.UUID) -> None:
    cost = _get_cost_or_404(db, cost_id)
    activity_service.record(
        db,
        entity_type=COST_ENTITY,
        entity_id=cost.id,
        action="project_cost.deleted",
        actor_id=user.id,
        before={"project_id": str(cost.project_id), "amount": cost.amount},
    )
    db.delete(cost)
    db.flush()
    logger.info("project_cost_deleted", cost_id=str(cost.id), actor_id=str(user.id))


# --------------------------------------------------------------------------- #
# Live margin + financial summary (BR-065)
# --------------------------------------------------------------------------- #
def financial_summary(
    db: Session, project_id: uuid.UUID
) -> ProjectFinancialSummary:
    """Live per-project rollup (BR-065). Computed on every read, never cached.

    margin = contracted − labour_cost − costs_total, where
    labour_cost = Σ logged hours × internal_cost_rate.
    """
    project = _get_project_or_404(db, project_id)

    contracted = project.contracted_value or 0
    rate = project.internal_cost_rate or 0  # cents/hour

    logged_hours = finance_repo.logged_seconds(db, project_id) / 3600.0
    labor_cost = round(logged_hours * rate)
    costs = finance_repo.costs_total(db, project_id)
    active_amount, received, milestone_count = finance_repo.milestone_totals(
        db, project_id
    )
    pending = max(active_amount - received, 0)
    margin = contracted - labor_cost - costs

    return ProjectFinancialSummary(
        project_id=project.id,
        contracted=contracted,
        received=received,
        pending=pending,
        internal_cost_rate=rate,
        logged_hours=round(logged_hours, 2),
        labor_cost=labor_cost,
        costs_total=costs,
        margin=margin,
        milestone_count=milestone_count,
    )


# --------------------------------------------------------------------------- #
# Auto-overdue (AUTO-02 / BR-068) — callable from the cron entrypoint
# --------------------------------------------------------------------------- #
def expire_overdue_milestones(
    db: Session, *, today: date | None = None
) -> list[PaymentMilestone]:
    """Transition every open payment milestone past its ``expected_date`` to
    ``overdue`` (AUTO-02 / BR-068). Runs regardless of project state.

    Returns the milestones transitioned by THIS run (used by the automation to
    notify exactly once, at transition). Idempotent by state: a milestone already
    ``overdue`` is not re-selected. Does NOT commit — the caller owns the
    transaction. Notification is the automation layer's job, not this function's.
    """
    today = today or app_today()
    overdue = finance_repo.overdue_open_milestones(db, today=today)
    for milestone in overdue:
        before = _snapshot(milestone)
        milestone.status = "overdue"
        db.flush()
        activity_service.record(
            db,
            entity_type=MILESTONE_ENTITY,
            entity_id=milestone.id,
            action="payment_milestone.overdue",
            actor_id=None,  # system action (AUTO-02)
            before=before,
            after=_snapshot(milestone),
        )
        logger.info(
            "payment_milestone_auto_overdue",
            milestone_id=str(milestone.id),
            expected_date=str(milestone.expected_date),
        )
    logger.info(
        "payment_milestone_overdue_run",
        overdue_count=len(overdue),
        run_date=str(today),
    )
    return overdue
