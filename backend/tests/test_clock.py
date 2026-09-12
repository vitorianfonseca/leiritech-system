"""Regression tests for the application clock (``app.core.clock``).

These pin the bug that made AUTO-02/AUTO-04 skip a day and bucketed a
task due *hoje* into *esta semana*: "today" was resolved as
``datetime.now(tz=UTC).date()`` while the application serves Portugal, so for
every instant between local midnight and UTC midnight the app believed it was
still yesterday.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

import pytest

from app.automations import _helpers
from app.core import clock

LISBON = ZoneInfo("Europe/Lisbon")


def test_app_timezone_is_portugal_by_default() -> None:
    assert str(clock.app_timezone()) == "Europe/Lisbon"


@pytest.mark.parametrize(
    ("instant_utc", "expected"),
    [
        # WEST (UTC+1). 23:30Z is already 00:30 of the NEXT day in Lisbon —
        # this is the window the old UTC-based code got wrong.
        (datetime(2026, 9, 11, 23, 30, tzinfo=UTC), date(2026, 9, 12)),
        # Same summer day, comfortably mid-afternoon: both agree.
        (datetime(2026, 9, 11, 14, 0, tzinfo=UTC), date(2026, 9, 11)),
        # WET (UTC+0) in winter: Lisbon and UTC coincide.
        (datetime(2026, 1, 15, 23, 30, tzinfo=UTC), date(2026, 1, 15)),
    ],
)
def test_today_follows_the_portuguese_civil_calendar(
    instant_utc: datetime, expected: date
) -> None:
    assert clock.today(instant_utc) == expected


def test_today_disagrees_with_naive_utc_in_the_late_evening() -> None:
    """The precise regression: UTC would say the 11th, Lisbon says the 12th."""
    instant = datetime(2026, 9, 11, 23, 30, tzinfo=UTC)
    assert instant.date() == date(2026, 9, 11)
    assert clock.today(instant) == date(2026, 9, 12)


def test_naive_reference_is_treated_as_utc() -> None:
    assert clock.today(datetime(2026, 9, 11, 23, 30)) == date(2026, 9, 12)


def test_automation_run_date_uses_the_app_clock() -> None:
    """A cron firing just after local midnight must operate on the new day.

    AUTO-02 (payment overdue) and AUTO-04 (proposal expiry) flip state off this
    date; resolving it in UTC made them a full day late.
    """
    just_after_local_midnight = datetime(2026, 9, 11, 23, 5, tzinfo=UTC)
    assert _helpers.resolve_today(just_after_local_midnight) == date(2026, 9, 12)


def test_unknown_timezone_falls_back_to_utc_instead_of_crashing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("APP_TIMEZONE", "Mars/Olympus_Mons")
    clock.app_timezone.cache_clear()
    try:
        assert str(clock.app_timezone()) == "UTC"
    finally:
        monkeypatch.delenv("APP_TIMEZONE", raising=False)
        clock.app_timezone.cache_clear()
