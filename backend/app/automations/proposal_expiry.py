"""AUTO-04 — proposal auto-expiry job (BR-027).

A daily job that transitions every ``sent``/``viewed`` proposal past its
``valid_until`` to ``expired`` and notifies the owner. The business logic lives
in ``proposal_service.expire_overdue_proposals``; this module is only the
invokable entrypoint — a scheduler (e.g. Railway Cron) runs::

    python -m app.automations.proposal_expiry

Kept intentionally minimal; issue #22 expands the automations layer.
"""

from __future__ import annotations

import structlog

from app.database.session import SessionLocal
from app.services import proposal_service

logger = structlog.get_logger("aurea.automation.proposal_expiry")


def run() -> int:
    """Execute the expiry sweep in its own transaction. Returns the number of
    proposals expired (useful for the CLI exit banner and monitoring)."""
    db = SessionLocal()
    try:
        expired = proposal_service.expire_overdue_proposals(db)
        db.commit()
        return len(expired)
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
