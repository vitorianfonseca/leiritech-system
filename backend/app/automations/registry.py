"""Automation registry (F15 §6.1).

Maps each automation code (AUTO-01..12) to its pure ``execute(db, *, now)``
callable and defines the canonical run order. The dispatcher (``run.py``) is the
only caller; it owns the session/transaction per job so one failing automation
never rolls back the others.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime

from sqlalchemy.orm import Session

from app.automations import (
    forgotten_timer,
    health_recompute,
    meeting_reminder,
    milestone_due_soon,
    opportunity_stale,
    payment_due_soon,
    payment_overdue,
    phase_completion,
    proposal_expiry,
    tasks_overdue,
    won_without_project,
    workload_recompute,
)

Job = Callable[..., int]

# Ordered AUTO-01..12 so ``run all`` executes them predictably.
REGISTRY: dict[str, Job] = {
    "AUTO-01": tasks_overdue.execute,
    "AUTO-02": payment_overdue.execute,
    "AUTO-03": opportunity_stale.execute,
    "AUTO-04": proposal_expiry.execute,
    "AUTO-05": health_recompute.execute,
    "AUTO-06": milestone_due_soon.execute,
    "AUTO-07": phase_completion.execute,
    "AUTO-08": payment_due_soon.execute,
    "AUTO-09": workload_recompute.execute,
    "AUTO-10": meeting_reminder.execute,
    "AUTO-11": won_without_project.execute,
    "AUTO-12": forgotten_timer.execute,
}

ORDER: tuple[str, ...] = tuple(REGISTRY.keys())


def run_job(
    db: Session, name: str, *, now: datetime | None = None
) -> int:
    """Execute a single automation by code within the given session (no commit)."""
    try:
        job = REGISTRY[name]
    except KeyError as exc:
        raise KeyError(
            f"Unknown automation '{name}'. Known: {', '.join(ORDER)}."
        ) from exc
    return job(db, now=now)
