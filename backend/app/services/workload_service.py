"""Workload / capacity business logic (F13, BR-080..084).

The AUTHORITATIVE source of every capacity figure the product shows — the
dashboard team-load chart consumes ``allocation_pct`` per member from here, and
the "Atenção necessária" panel reads ``over_allocated``. Nothing is stored:
each read recomputes from live inputs so rebalancing an assignment is reflected
immediately.

Formula (per member)
--------------------
* ``net_capacity_hours``   = ``weekly_capacity_hours`` × role utilization target
  (BR-080/081). "Known non-project hours" (BR-080) are not tracked in the MVP,
  so the subtrahend is 0 and net capacity collapses to capacity × target — the
  target itself already discounts non-delivery time. Flagged as a seam.
* ``allocated_hours``      = Σ ``estimate_hours`` of the member's OPEN tasks
  (not ``done``, not archived), attributed to the primary assignee.
* ``available_hours``      = ``net_capacity_hours`` − ``allocated_hours`` (BR-082;
  may be negative when over-allocated).
* ``allocation_pct``       = ``allocated_hours`` / ``net_capacity_hours`` × 100.
* ``utilization_pct``      = billable hours logged this ISO week / net capacity
  × 100 (BR-083 — actuals vs available, compared against the role target).
* ``availability_state``   (BR-082, DERIVED not toggled):
      < BALANCED_MIN_PCT              → ``disponivel``
      BALANCED_MIN_PCT..OVERALLOCATED → ``equilibrado``
      > OVERALLOCATED_PCT             → ``sobrecarregado``
  A non-empty ``availability_override`` (manual PTO/away) forces ``ausente``.
* ``over_allocated``       = ``allocation_pct`` > OVERALLOCATED_PCT (BR-084).

Access (BR-002)
---------------
Team reads are Admin/Gestor only. A Membro sees their OWN row only — enforced
here, never trusted from the client (BR-001). A Membro requesting another
member's detail gets 404 (enumeration-safe), consistent with ``scoped_or_404``.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import structlog
from sqlalchemy.orm import Session

from app.core import errors, permissions
from app.core.config import settings
from app.core.permissions import Role
from app.models.user import User
from app.repositories import workload as workload_repo
from app.schemas.workload import AvailabilityState, TeamWorkload, WorkloadEntry

logger = structlog.get_logger("aurea.workload")

# BR-081 — role-dependent utilization targets (Admin-configurable via settings).
_ROLE_TARGETS: dict[str, float] = {
    Role.MEMBRO: settings.WORKLOAD_TARGET_MEMBRO,
    Role.GESTOR: settings.WORKLOAD_TARGET_GESTOR,
    Role.ADMIN: settings.WORKLOAD_TARGET_ADMIN,
}


def role_target(role: str) -> float:
    """Utilization target fraction for a role (BR-081). Unknown role → membro."""
    return _ROLE_TARGETS.get(role, settings.WORKLOAD_TARGET_MEMBRO)


def _week_start(now: datetime) -> datetime:
    """00:00 UTC on Monday of ``now``'s ISO week — the utilization window."""
    midnight = now.astimezone(UTC).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return midnight - timedelta(days=midnight.weekday())


def _pct(numerator: float, denominator: float) -> float:
    """numerator/denominator as a rounded percentage; safe when capacity is 0.

    Zero net capacity with any load is treated as fully over-allocated (100%+),
    surfaced as 999.0 so the state derivation flags ``sobrecarregado``.
    """
    if denominator <= 0:
        return 0.0 if numerator <= 0 else 999.0
    return round(numerator / denominator * 100.0, 1)


def _derive_state(
    allocation_pct: float, override: str | None
) -> AvailabilityState:
    if override is not None and override.strip():
        return "ausente"
    if allocation_pct < settings.WORKLOAD_BALANCED_MIN_PCT:
        return "disponivel"
    if allocation_pct <= settings.WORKLOAD_OVERALLOCATED_PCT:
        return "equilibrado"
    return "sobrecarregado"


def compute_entry(
    user: User, allocated_hours: float, billable_hours_week: float
) -> WorkloadEntry:
    """Pure per-member derivation (BR-080..084). No DB access — unit-testable."""
    target = role_target(user.role)
    capacity = float(user.weekly_capacity_hours or 0.0)
    net_capacity = round(capacity * target, 2)
    allocated = round(allocated_hours, 2)
    available = round(net_capacity - allocated, 2)
    allocation_pct = _pct(allocated, net_capacity)
    utilization_pct = _pct(billable_hours_week, net_capacity)
    state = _derive_state(allocation_pct, user.availability_override)

    return WorkloadEntry(
        user_id=user.id,
        name=user.name,
        role=user.role,
        weekly_capacity_hours=round(capacity, 2),
        role_utilization_target=target,
        net_capacity_hours=net_capacity,
        allocated_hours=allocated,
        available_hours=available,
        allocation_pct=allocation_pct,
        billable_hours_week=round(billable_hours_week, 2),
        utilization_pct=utilization_pct,
        availability_state=state,
        over_allocated=allocation_pct > settings.WORKLOAD_OVERALLOCATED_PCT,
        availability_override=user.availability_override,
    )


def _get_user_or_404(db: Session, user_id: uuid.UUID) -> User:
    user = workload_repo.get_user(db, user_id)
    if user is None:
        raise errors.not_found("Utilizador não encontrado.", code="USER_NOT_FOUND")
    return user


def team_workload(db: Session, requester: User) -> TeamWorkload:
    """Workload rollup. Admin/Gestor → whole team; Membro → own row only (BR-002)."""
    now = datetime.now(tz=UTC)
    since = _week_start(now)

    if not permissions.role_at_least(requester.role, Role.GESTOR):
        # BR-002 — a Membro never sees the team; scope to themselves.
        entry = compute_entry(
            requester,
            workload_repo.allocated_hours_for_user(db, requester.id),
            workload_repo.billable_hours_for_user(db, requester.id, since),
        )
        return _rollup([entry], now)

    users = workload_repo.active_users(db)
    allocated = workload_repo.allocated_hours_by_user(db)
    billable = workload_repo.billable_hours_by_user(db, since)
    entries = [
        compute_entry(u, allocated.get(u.id, 0.0), billable.get(u.id, 0.0))
        for u in users
    ]
    return _rollup(entries, now)


def user_workload(
    db: Session, requester: User, user_id: uuid.UUID
) -> WorkloadEntry:
    """Single member's workload. Membro may only read their own (else 404)."""
    if (
        not permissions.role_at_least(requester.role, Role.GESTOR)
        and requester.id != user_id
    ):
        # Enumeration-safe: hide existence of others from a Membro (BR-002).
        raise errors.not_found("Utilizador não encontrado.", code="USER_NOT_FOUND")

    target_user = _get_user_or_404(db, user_id)
    since = _week_start(datetime.now(tz=UTC))
    return compute_entry(
        target_user,
        workload_repo.allocated_hours_for_user(db, target_user.id),
        workload_repo.billable_hours_for_user(db, target_user.id, since),
    )


def _rollup(entries: list[WorkloadEntry], generated_at: datetime) -> TeamWorkload:
    over = sum(1 for e in entries if e.over_allocated)
    return TeamWorkload(
        items=entries,
        total=len(entries),
        over_allocated_count=over,
        generated_at=generated_at,
    )
