"""Schema-integrity tests against Base.metadata (no DB connection required)."""

from __future__ import annotations

from app.database.base import Base
from app.models.time_entry import TimeEntry

EXPECTED_TABLES = {
    "users", "user_sessions", "user_preferences", "invitations",
    "companies", "contacts", "pipeline_stages", "opportunities", "proposals",
    "interactions", "meetings",
    "projects", "project_members", "project_phases", "project_templates",
    "template_phases", "template_tasks",
    "tasks", "task_assignees", "task_checklist_items", "task_dependencies",
    "comments", "mentions", "attachments", "time_entries",
    "milestones", "payment_milestones", "project_costs",
    "notifications", "activity_logs",
}


def test_all_entities_registered() -> None:
    tables = set(Base.metadata.tables.keys())
    missing = EXPECTED_TABLES - tables
    assert not missing, f"Missing tables: {missing}"


def test_single_active_timer_partial_unique_index() -> None:
    """BR-040 (#9): partial unique index on time_entries(user_id) WHERE ended_at IS NULL."""
    idx = next(
        i for i in TimeEntry.__table__.indexes
        if i.name == "uq_time_entries_active_per_user"
    )
    assert idx.unique is True
    assert idx.dialect_options["postgresql"]["where"] is not None


def test_trigram_search_indexes_present() -> None:
    """#10: GIN trigram indexes back global search."""
    expected = {
        ("companies", "ix_companies_name_trgm"),
        ("contacts", "ix_contacts_name_trgm"),
        ("opportunities", "ix_opportunities_title_trgm"),
        ("projects", "ix_projects_name_trgm"),
        ("tasks", "ix_tasks_title_trgm"),
    }
    found = {
        (t.name, i.name)
        for t in Base.metadata.tables.values()
        for i in t.indexes
        if i.name and i.name.endswith("_trgm")
    }
    assert expected <= found, f"Missing trigram indexes: {expected - found}"
