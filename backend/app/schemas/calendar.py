"""Aggregate calendar (F12) response models — the `/calendar` contract.

These mirror ``frontend/src/lib/api/calendar-types.ts`` field-for-field so the
integration phase swaps the frontend mock for a real fetch with ZERO shape
changes. The wire format is camelCase (the TS contract); every model therefore
serializes by a camelCase alias. Money is integer EUR cents (payment events
only); enum/state values are stable English keys.

The calendar is a READ-ONLY projection: it aggregates dated items produced by
other domains (task due dates, phase deadlines, project deadlines, proposal
expiries, commercial next-actions, meetings, and — for finance-gated callers —
payment-milestone dates) into a single timeline. Role scoping (BR-002) and the
financial gate (BR-008) are applied in ``calendar_service`` before serialization.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

CalendarEventType = Literal[
    "task",
    "meeting",
    "milestone",
    "delivery",
    "next_action",
    "proposal_expiry",
    "payment",
]
CalendarUrgency = Literal["overdue", "due", "upcoming", "done"]


class _CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, from_attributes=True
    )


class CalendarEvent(_CamelModel):
    id: str
    type: CalendarEventType
    title: str
    # ISO-8601 datetime (start). All-day events use local midnight (UTC here).
    start: str
    # ISO-8601 datetime (end) or null when the event has no duration.
    end: str | None = None
    all_day: bool
    project_id: str | None = None
    project_name: str | None = None
    # Route to the source record (read-only projection → open the record).
    source_href: str
    urgency: CalendarUrgency | None = None
    location: str | None = None
    description: str | None = None
    # EUR amount in cents for payment events (withheld from Membro — BR-008).
    amount_cents: int | None = None
