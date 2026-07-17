"""Unified automation dispatcher — the cron entrypoint (F15 §6.1).

Usage::

    python -m app.automations.run all          # run every automation, in order
    python -m app.automations.run AUTO-01      # run a single automation

Each automation runs in its OWN session and transaction, so a failure in one job
neither rolls back nor aborts the others (a failing job is logged and the run
continues, exiting non-zero if any job failed). Suitable to schedule directly
from a cron scheduler (e.g. one daily cron invoking ``... run all``).
"""

from __future__ import annotations

import sys

import structlog

from app.automations.registry import ORDER, REGISTRY, run_job
from app.database.session import SessionLocal

logger = structlog.get_logger("aurea.automation.run")


def _run_one(name: str) -> int:
    """Run one job in its own committed transaction. Returns notifications made."""
    db = SessionLocal()
    try:
        count = run_job(db, name)
        db.commit()
        logger.info("automation_completed", automation=name, notifications=count)
        return count
    except Exception:
        db.rollback()
        logger.exception("automation_failed", automation=name)
        raise
    finally:
        db.close()


def run_all() -> tuple[int, int]:
    """Run every automation in order. Returns ``(total_notifications, failures)``.
    Failures are isolated — one bad job does not stop the rest."""
    total = 0
    failures = 0
    for name in ORDER:
        try:
            total += _run_one(name)
        except Exception:  # noqa: BLE001 — already logged; keep the run going
            failures += 1
    return total, failures


def main(argv: list[str] | None = None) -> int:
    args = argv if argv is not None else sys.argv[1:]
    if not args:
        print("usage: python -m app.automations.run <all|AUTO-01..AUTO-12>")
        return 2

    target = args[0]
    if target == "all":
        total, failures = run_all()
        print(f"automations: {total} notification(s) created, {failures} failure(s)")
        return 1 if failures else 0

    if target not in REGISTRY:
        print(f"unknown automation '{target}'. Known: all, {', '.join(ORDER)}.")
        return 2

    try:
        count = _run_one(target)
    except Exception as exc:  # noqa: BLE001 — surface as a non-zero exit for cron
        print(f"automation {target} failed: {exc}")
        return 1
    print(f"automation {target}: {count} notification(s) created")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
