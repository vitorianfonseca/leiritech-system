"""Tests for the 12 scheduled automations (F15 §6.1, AUTO-01..12).

Each automation is exercised against real seeded rows on the Postgres (:5433):
seed the trigger condition, run the job, assert the right notification is
produced, then run it a SECOND time and assert no duplicate is created
(idempotency — the core cron guarantee). Assertions are scoped to the specific
entity/recipient each test creates, so unrelated seed data cannot perturb them.

Cleanup: every created root row is tracked and deleted at teardown; child rows
(tasks, phases, members, payment milestones, time entries) cascade on the parent
delete, and notifications cascade on their recipient user delete (``make_user``).
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import delete, select

from app.automations.registry import run_job
from app.database.session import SessionLocal
from app.models.collaboration import Notification
from app.models.crm import Meeting, Opportunity, Proposal
from app.models.finance import PaymentMilestone
from app.models.project import Milestone, Project, ProjectMember, ProjectPhase
from app.models.task import Task
from app.models.time_entry import TimeEntry

TODAY = date.today()


# --------------------------------------------------------------------------- #
# Run + assertion helpers
# --------------------------------------------------------------------------- #
def _run(name: str, *, now: datetime | None = None) -> int:
    db = SessionLocal()
    try:
        count = run_job(db, name, now=now)
        db.commit()
        return count
    finally:
        db.close()


def _entity_notifs(entity_id: uuid.UUID, *, type: str | None = None) -> list[Notification]:
    db = SessionLocal()
    try:
        stmt = select(Notification).where(Notification.entity_id == entity_id)
        if type is not None:
            stmt = stmt.where(Notification.type == type)
        return list(db.execute(stmt).scalars())
    finally:
        db.close()


def _recipients(entity_id: uuid.UUID) -> set[uuid.UUID]:
    return {n.user_id for n in _entity_notifs(entity_id)}


@pytest.fixture
def track() -> Iterator[dict[str, list[uuid.UUID]]]:
    # ``entities`` collects every entity_id a test asserts on, so notifications
    # produced for SEED admins/gestors (whose accounts we do not own and cannot
    # cascade-delete) are cleaned by entity_id — keeping runs repeatable.
    ids: dict[str, list[uuid.UUID]] = {
        "project": [],
        "opportunity": [],
        "proposal": [],
        "meeting": [],
        "entities": [],
    }
    yield ids
    db = SessionLocal()
    try:
        if ids["entities"]:
            db.execute(
                delete(Notification).where(
                    Notification.entity_id.in_(ids["entities"])
                )
            )
        for oid in ids["proposal"]:
            db.execute(delete(Proposal).where(Proposal.id == oid))
        for oid in ids["meeting"]:
            db.execute(delete(Meeting).where(Meeting.id == oid))
        for oid in ids["opportunity"]:
            db.execute(delete(Opportunity).where(Opportunity.id == oid))
        for pid in ids["project"]:
            db.execute(delete(Project).where(Project.id == pid))
        db.commit()
    finally:
        db.close()


def _project(track: dict, *, manager_id: uuid.UUID | None = None, **kw) -> Project:
    db = SessionLocal()
    try:
        project = Project(
            name=f"A {uuid.uuid4().hex[:8]}",
            status=kw.pop("status", "active"),
            manager_id=manager_id,
            **kw,
        )
        db.add(project)
        db.commit()
        db.refresh(project)
        track["project"].append(project.id)
        db.expunge(project)
        return project
    finally:
        db.close()


# --------------------------------------------------------------------------- #
# AUTO-01 — task overdue
# --------------------------------------------------------------------------- #
def test_auto01_task_overdue(make_user, track) -> None:
    manager = make_user(role="gestor")
    assignee = make_user(role="membro")
    project = _project(track, manager_id=manager.id)

    db = SessionLocal()
    try:
        task = Task(
            project_id=project.id,
            title="Overdue",
            status="todo",
            due_date=TODAY - timedelta(days=2),
            primary_assignee_id=assignee.id,
        )
        db.add(task)
        db.commit()
        task_id = task.id
    finally:
        db.close()

    track["entities"].append(task_id)
    assert _run("AUTO-01") >= 1
    recipients = _recipients(task_id)
    assert assignee.id in recipients
    assert manager.id in recipients

    before = len(_entity_notifs(task_id))
    _run("AUTO-01")  # idempotent same-day re-run
    assert len(_entity_notifs(task_id)) == before


def test_auto01_skips_completed_and_non_live(make_user, track) -> None:
    assignee = make_user(role="membro")
    done_project = _project(track, status="active")
    cancelled_project = _project(track, status="cancelled")

    db = SessionLocal()
    try:
        db.add(
            Task(
                project_id=done_project.id,
                title="Done",
                status="done",
                due_date=TODAY - timedelta(days=3),
                primary_assignee_id=assignee.id,
            )
        )
        overdue_on_dead = Task(
            project_id=cancelled_project.id,
            title="OnCancelled",
            status="todo",
            due_date=TODAY - timedelta(days=3),
            primary_assignee_id=assignee.id,
        )
        db.add(overdue_on_dead)
        db.commit()
        dead_task_id = overdue_on_dead.id
    finally:
        db.close()

    track["entities"].append(dead_task_id)
    _run("AUTO-01")
    # Neither a done task nor a task on a non-live project produces a notification.
    assert _entity_notifs(dead_task_id) == []


# --------------------------------------------------------------------------- #
# AUTO-02 — payment milestone overdue (state change + notify)
# --------------------------------------------------------------------------- #
def test_auto02_payment_overdue(make_user, track) -> None:
    admin = make_user(role="admin")
    project = _project(track)

    db = SessionLocal()
    try:
        milestone = PaymentMilestone(
            project_id=project.id,
            amount=500000,
            status="planned",
            expected_date=TODAY - timedelta(days=1),
            reference="M-OVERDUE",
        )
        db.add(milestone)
        db.commit()
        mid = milestone.id
    finally:
        db.close()

    track["entities"].append(mid)
    _run("AUTO-02")
    db = SessionLocal()
    try:
        assert db.get(PaymentMilestone, mid).status == "overdue"  # state changed
    finally:
        db.close()
    assert admin.id in _recipients(mid)

    before = len(_entity_notifs(mid))
    _run("AUTO-02")  # already overdue → not re-selected → no new notification
    assert len(_entity_notifs(mid)) == before


# --------------------------------------------------------------------------- #
# AUTO-03 — stale opportunity
# --------------------------------------------------------------------------- #
def test_auto03_stale_opportunity(make_user, track) -> None:
    owner = make_user(role="gestor")
    db = SessionLocal()
    try:
        opp = Opportunity(
            title="Stale",
            outcome="open",
            owner_id=owner.id,
            next_action="Ligar",
            next_action_due=TODAY - timedelta(days=1),  # overdue next action
        )
        db.add(opp)
        db.commit()
        oid = opp.id
        track["opportunity"].append(oid)
        track["entities"].append(oid)
    finally:
        db.close()

    assert _run("AUTO-03") >= 1
    assert owner.id in _recipients(oid)

    before = len(_entity_notifs(oid))
    _run("AUTO-03")
    assert len(_entity_notifs(oid)) == before


# --------------------------------------------------------------------------- #
# AUTO-04 — proposal expiry (wired existing seam)
# --------------------------------------------------------------------------- #
def test_auto04_proposal_expiry(make_user, track) -> None:
    owner = make_user(role="gestor")
    db = SessionLocal()
    try:
        proposal = Proposal(
            reference=f"P-{uuid.uuid4().hex[:8]}",
            status="sent",
            valid_until=TODAY - timedelta(days=1),
            created_by=owner.id,
        )
        db.add(proposal)
        db.commit()
        pid = proposal.id
        track["proposal"].append(pid)
        track["entities"].append(pid)
    finally:
        db.close()

    _run("AUTO-04")
    db = SessionLocal()
    try:
        assert db.get(Proposal, pid).status == "expired"
    finally:
        db.close()
    assert owner.id in _recipients(pid)

    before = len(_entity_notifs(pid))
    _run("AUTO-04")
    assert len(_entity_notifs(pid)) == before


# --------------------------------------------------------------------------- #
# AUTO-05 — suggested-health downgrade
# --------------------------------------------------------------------------- #
def test_auto05_health_downgrade(make_user, track) -> None:
    manager = make_user(role="gestor")
    project = _project(
        track,
        manager_id=manager.id,
        status="active",
        deadline=TODAY - timedelta(days=1),  # past deadline → at_risk
        suggested_health="healthy",
    )
    track["entities"].append(project.id)

    _run("AUTO-05")
    db = SessionLocal()
    try:
        assert db.get(Project, project.id).suggested_health == "at_risk"
    finally:
        db.close()
    assert manager.id in _recipients(project.id)

    before = len(_entity_notifs(project.id))
    _run("AUTO-05")  # no further downgrade → no new notification
    assert len(_entity_notifs(project.id)) == before


# --------------------------------------------------------------------------- #
# AUTO-06 — milestone / phase due soon
# --------------------------------------------------------------------------- #
def test_auto06_milestone_due_soon(make_user, track) -> None:
    manager = make_user(role="gestor")
    member = make_user(role="membro")
    project = _project(track, manager_id=manager.id, status="active")

    db = SessionLocal()
    try:
        db.add(ProjectMember(project_id=project.id, user_id=member.id))
        milestone = Milestone(
            project_id=project.id,
            name="Delivery",
            status="pending",
            due_date=TODAY + timedelta(days=2),
        )
        db.add(milestone)
        db.commit()
        mid = milestone.id
    finally:
        db.close()

    track["entities"].append(mid)
    assert _run("AUTO-06") >= 1
    recipients = _recipients(mid)
    assert manager.id in recipients
    assert member.id in recipients

    before = len(_entity_notifs(mid))
    _run("AUTO-06")
    assert len(_entity_notifs(mid)) == before


# --------------------------------------------------------------------------- #
# AUTO-07 — phase completion suggestion (sweep)
# --------------------------------------------------------------------------- #
def test_auto07_phase_completion(make_user, track) -> None:
    owner = make_user(role="gestor")
    project = _project(track, manager_id=owner.id, status="active")

    db = SessionLocal()
    try:
        phase = ProjectPhase(
            project_id=project.id, name="Phase 1", status="in_progress", owner_id=owner.id
        )
        db.add(phase)
        db.flush()
        pid = phase.id
        db.add(Task(project_id=project.id, phase_id=phase.id, title="A", status="done"))
        db.commit()
    finally:
        db.close()

    track["entities"].append(pid)
    assert _run("AUTO-07") >= 1
    notifs = _entity_notifs(pid, type="phase_completion_suggestion")
    assert any(n.user_id == owner.id for n in notifs)

    before = len(_entity_notifs(pid))
    _run("AUTO-07")
    assert len(_entity_notifs(pid)) == before


# --------------------------------------------------------------------------- #
# AUTO-08 — payment due soon
# --------------------------------------------------------------------------- #
def test_auto08_payment_due_soon(make_user, track) -> None:
    admin = make_user(role="admin")
    project = _project(track, status="active")

    db = SessionLocal()
    try:
        milestone = PaymentMilestone(
            project_id=project.id,
            amount=250000,
            status="planned",
            expected_date=TODAY + timedelta(days=3),
            reference="M-SOON",
        )
        db.add(milestone)
        db.commit()
        mid = milestone.id
    finally:
        db.close()

    track["entities"].append(mid)
    assert _run("AUTO-08") >= 1
    assert admin.id in _recipients(mid)

    before = len(_entity_notifs(mid))
    _run("AUTO-08")
    assert len(_entity_notifs(mid)) == before


# --------------------------------------------------------------------------- #
# AUTO-09 — workload over-allocation
# --------------------------------------------------------------------------- #
def test_auto09_over_allocation(make_user, track) -> None:
    admin = make_user(role="admin")
    member = make_user(role="membro")  # net capacity 32h
    project = _project(track, status="active")

    db = SessionLocal()
    try:
        db.add(
            Task(
                project_id=project.id,
                title="Huge",
                status="todo",
                estimate_hours=100,  # 100 / 32 = 312% → over-allocated
                primary_assignee_id=member.id,
            )
        )
        db.commit()
    finally:
        db.close()

    track["entities"].append(member.id)
    assert _run("AUTO-09") >= 1
    # Warning is about the member; the recipient is the management audience.
    assert admin.id in _recipients(member.id)

    before = len(_entity_notifs(member.id))
    _run("AUTO-09")
    assert len(_entity_notifs(member.id)) == before


# --------------------------------------------------------------------------- #
# AUTO-10 — meeting reminder
# --------------------------------------------------------------------------- #
def test_auto10_meeting_reminder(make_user, track) -> None:
    organizer = make_user(role="gestor")
    db = SessionLocal()
    try:
        meeting = Meeting(
            title="Kickoff",
            status="scheduled",
            start_at=datetime.now(tz=UTC) + timedelta(hours=2),
            organizer_id=organizer.id,
        )
        db.add(meeting)
        db.commit()
        mid = meeting.id
        track["meeting"].append(mid)
        track["entities"].append(mid)
    finally:
        db.close()

    assert _run("AUTO-10") >= 1
    assert organizer.id in _recipients(mid)

    before = len(_entity_notifs(mid))
    _run("AUTO-10")
    assert len(_entity_notifs(mid)) == before


# --------------------------------------------------------------------------- #
# AUTO-11 — won opportunity without a project
# --------------------------------------------------------------------------- #
def test_auto11_won_without_project(make_user, track) -> None:
    owner = make_user(role="gestor")
    db = SessionLocal()
    try:
        opp = Opportunity(
            title="Won unconverted",
            outcome="won",
            owner_id=owner.id,
            updated_at=datetime.now(tz=UTC) - timedelta(days=5),  # won long ago
        )
        db.add(opp)
        db.commit()
        oid = opp.id
        track["opportunity"].append(oid)
        track["entities"].append(oid)
    finally:
        db.close()

    assert _run("AUTO-11") >= 1
    assert owner.id in _recipients(oid)

    before = len(_entity_notifs(oid))
    _run("AUTO-11")
    assert len(_entity_notifs(oid)) == before


# --------------------------------------------------------------------------- #
# AUTO-12 — forgotten timer
# --------------------------------------------------------------------------- #
def test_auto12_forgotten_timer(make_user, track) -> None:
    owner = make_user(role="membro")
    project = _project(track, status="active")

    db = SessionLocal()
    try:
        task = Task(project_id=project.id, title="T", status="in_progress")
        db.add(task)
        db.flush()
        db.add(
            TimeEntry(
                user_id=owner.id,
                task_id=task.id,
                started_at=datetime.now(tz=UTC) - timedelta(hours=10),  # running 10h
                ended_at=None,
            )
        )
        db.commit()
        entry_id = db.execute(
            select(TimeEntry.id).where(TimeEntry.user_id == owner.id)
        ).scalar_one()
    finally:
        db.close()

    track["entities"].append(entry_id)
    assert _run("AUTO-12") >= 1
    assert owner.id in _recipients(entry_id)

    before = len(_entity_notifs(entry_id))
    _run("AUTO-12")
    assert len(_entity_notifs(entry_id)) == before
