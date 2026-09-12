"""The application clock — a single source of truth for "now" and "today".

LeiriTech is a Portuguese business application: a task due *hoje*, a payment
milestone that fell due *ontem*, and a proposal that expired overnight are all
judged against the **civil calendar in Portugal**, not against UTC.

Computing ``datetime.now(tz=UTC).date()`` silently produced the wrong day for
every local instant that falls before UTC midnight — the 00:00–01:00 window
under WEST (UTC+1), and the whole 23:00–00:00 hour shifts again under DST. In
that window "today" resolved to yesterday, so:

* AUTO-02 did not flag payment milestones that had just become overdue,
* AUTO-04 did not expire proposals whose ``valid_until`` had just passed,
* "O meu trabalho" bucketed a task due today into *esta semana*,
* the calendar rendered a due item as ``upcoming`` instead of ``due``.

Daily automations are exactly the workload most likely to be scheduled just
after midnight, which is precisely when the bug bit. Everything that needs a
calendar date now goes through :func:`today`.

``APP_TIMEZONE`` overrides the zone (any IANA name) for deployments outside
mainland Portugal.
"""

from __future__ import annotations

import os
from datetime import UTC, date, datetime
from functools import lru_cache
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DEFAULT_APP_TIMEZONE = "Europe/Lisbon"


@lru_cache(maxsize=1)
def app_timezone() -> ZoneInfo:
    """The business timezone. Falls back to UTC if the name is unresolvable."""
    name = os.getenv("APP_TIMEZONE", DEFAULT_APP_TIMEZONE).strip() or DEFAULT_APP_TIMEZONE
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        # A bad tz name must never take the app down; UTC keeps it running and
        # the misconfiguration surfaces as dates that look an hour off.
        return ZoneInfo("UTC")


def now(reference: datetime | None = None) -> datetime:
    """The current instant as an aware UTC datetime (injectable for tests)."""
    if reference is None:
        return datetime.now(tz=UTC)
    if reference.tzinfo is None:
        return reference.replace(tzinfo=UTC)
    return reference.astimezone(UTC)


def today(reference: datetime | None = None) -> date:
    """The current **civil** date in the application timezone.

    Use this — never ``date.today()`` (server-local, which is UTC in
    production) nor ``datetime.now(tz=UTC).date()`` — whenever a calendar day
    is compared against a user-facing due date.
    """
    return now(reference).astimezone(app_timezone()).date()
