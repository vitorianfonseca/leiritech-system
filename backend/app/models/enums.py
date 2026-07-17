"""Enumerated string keys used by model state fields.

Values are STABLE ENGLISH KEYS persisted to the database. Human-facing pt-PT
labels are rendered client-side. Columns use ``sa.Enum(..., native_enum=False)``
which stores the value as VARCHAR with a CHECK constraint (no native PG enum
type to migrate).
"""

from __future__ import annotations

# --- Users / auth ---
USER_ROLES = ("admin", "gestor", "membro")
USER_STATUSES = ("active", "deactivated")
INVITATION_STATUSES = ("pending", "accepted", "expired", "revoked")

# --- CRM ---
COMPANY_STATUSES = ("potential", "active", "inactive", "partner")
CONTACT_STATUSES = ("active", "inactive")
OPPORTUNITY_OUTCOMES = ("open", "won", "lost")
PROPOSAL_STATUSES = ("draft", "sent", "viewed", "accepted", "rejected", "expired")
INTERACTION_TYPES = ("call", "meeting", "email", "message", "note", "followup")
MEETING_STATUSES = ("scheduled", "held", "cancelled", "no_show")

# --- Catalog / proposal content ---
CATALOG_UNITS = ("unit", "hour", "day", "month", "m2", "license", "fixed")
BILLING_TYPES = ("one_time", "monthly", "annual")

# --- Projects / tasks ---
PROJECT_STATUSES = ("planning", "active", "on_hold", "completed", "cancelled", "archived")
PROJECT_HEALTH = ("healthy", "attention", "at_risk")
PHASE_STATUSES = ("not_started", "in_progress", "blocked", "completed")
TASK_STATUSES = ("todo", "in_progress", "in_review", "blocked", "done")
TASK_PRIORITIES = ("low", "normal", "high", "urgent")
MILESTONE_STATUSES = ("pending", "achieved", "missed", "cancelled")

# --- Finance ---
PAYMENT_MILESTONE_STATUSES = (
    "planned",
    "invoiced",
    "partially_paid",
    "paid",
    "overdue",
    "cancelled",
)
