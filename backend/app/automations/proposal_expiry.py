"""AUTO-04 — proposal auto-expiry job (BR-027).

Transitions every ``sent``/``viewed`` proposal past its ``valid_until`` to
``expired`` and notifies the owner. The business logic lives in
``proposal_service.expire_overdue_proposals`` (which also inserts the owner
notification); this module is only the invokable entrypoint.

Idempotent by state: once a proposal is ``expired`` the source query no longer
selects it, so a re-run does nothing. Runnable standalone::

    python -m app.automations.proposal_expiry

or through the unified dispatcher (``python -m app.automations.run AUTO-04``).
"""

from __future__ import annotations

from datetime import datetime

import structlog
from sqlalchemy.orm import Session

from app.automations._helpers import resolve_today
from app.database.session import SessionLocal
from app.services import proposal_service

logger = structlog.get_logger("aurea.automation.proposal_expiry")

CODE = "AUTO-04"


def execute(db: Session, *, now: datetime | None = None) -> int:
    """Expire overdue proposals in the caller's transaction. Returns the count."""
    expired = proposal_service.expire_overdue_proposals(db, today=resolve_today(now))
    return len(expired)


def run() -> int:
    """Session-managed entrypoint (opens, commits, closes its own session)."""
    db = SessionLocal()
    try:
        count = execute(db)
        db.commit()
        return count
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> int:
    count = run()
    logger.info("proposal_expiry_completed", expired_count=count)
    print(f"proposal expiry: {count} proposal(s) expired")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
