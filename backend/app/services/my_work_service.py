"""My Work daily hub (F3/F17) — the `/my-work` payload.

Produces the exact ``MyWork`` contract the frontend consumes
(``frontend/src/lib/api/my-work-types.ts``). Everything is scoped to the
authenticated caller (BR-002 — own work only): assigned tasks bucketed into
today / overdue / this-week / no-date, the caller's upcoming meetings and
@mentions, their project cards and recent time entries, plus the running timer.
The review queue is gated to Gestor+/Admin (BR C3); a Membro always gets an
empty ``reviewRequests``.

The task vocabularies differ from the DB: the ``blocked`` status is projected to
the orthogonal ``blocked`` flag (status → ``in_progress``), and priority
``normal`` maps to the contract's ``medium``.
"""

from __future__ import annotations

from datetime import datetime

import structlog
from sqlalchemy.orm import Session

from app.core.clock import today as app_today
from app.core.permissions import Role
from app.models.user import User
from app.repositories import my_work as repo
from app.schemas.my_work import (
    MyActiveTimer,
    MyMeeting,
    MyMention,
    MyProject,
    MyReviewRequest,
    MyTask,
    MyTimeEntry,
    MyWork,
)

logger = structlog.get_logger("leiritech.my_work")

_PRIORITY_MAP = {"low": "low", "normal": "medium", "high": "high", "urgent": "urgent"}
_STATUS_MAP = {
    "todo": "todo",
    "in_progress": "in_progress",
    "in_review": "in_review",
    "blocked": "in_progress",
    "done": "done",
}
_PRIORITY_RANK = {"low": 0, "medium": 1, "high": 2, "urgent": 3}
_MENTION_TYPES = frozenset(("company", "opportunity", "project", "task"))
_EXCERPT_LEN = 140


def _to_my_task(task, project_name: str | None, comment_count: int) -> MyTask:
    blocked = task.status == "blocked"
    return MyTask(
        id=str(task.id),
        title=task.title,
        project_id=str(task.project_id),
        project_name=project_name or "",
        status=_STATUS_MAP.get(task.status, "todo"),  # type: ignore[arg-type]
        priority=_PRIORITY_MAP.get(task.priority, "medium"),  # type: ignore[arg-type]
        due_date=task.due_date.isoformat() if task.due_date else None,
        blocked=blocked,
        blocked_reason=task.block_reason if blocked else None,
        comment_count=comment_count,
    )


def _bucket_tasks(
    tasks: list[MyTask], today
) -> tuple[list[MyTask], list[MyTask], list[MyTask], list[MyTask]]:
    today_b: list[MyTask] = []
    overdue: list[MyTask] = []
    this_week: list[MyTask] = []
    no_date: list[MyTask] = []
    for task in tasks:
        if task.due_date is None:
            no_date.append(task)
            continue
        due = datetime.fromisoformat(task.due_date).date()
        diff = (due - today).days
        if diff < 0:
            overdue.append(task)
        elif diff == 0:
            today_b.append(task)
        elif diff <= 7:
            this_week.append(task)
        # further than a week out is not part of the daily hub
    by_priority = lambda t: _PRIORITY_RANK.get(t.priority, 1)  # noqa: E731
    today_b.sort(key=by_priority, reverse=True)
    overdue.sort(key=by_priority, reverse=True)
    this_week.sort(key=lambda t: t.due_date or "")
    return today_b, overdue, this_week, no_date


def _meetings(db: Session, user: User, today) -> list[MyMeeting]:
    out: list[MyMeeting] = []
    for m in repo.upcoming_meetings(db, user.id, today):
        out.append(
            MyMeeting(
                id=str(m.id),
                title=m.title,
                starts_at=m.start_at.isoformat(),
                # Seam: Meeting has no explicit end → fall back to the start.
                ends_at=(m.end_at or m.start_at).isoformat(),
                # Seam: Meeting model carries no location / attendee list.
                location=None,
                attendees=0,
            )
        )
    return out


def _mentions(db: Session, user: User) -> list[MyMention]:
    rows = repo.recent_mentions(db, user.id)
    # Batch-resolve entity labels per type.
    ids_by_type: dict[str, list] = {}
    for _mention, comment, _author in rows:
        if comment.entity_type in _MENTION_TYPES:
            ids_by_type.setdefault(comment.entity_type, []).append(comment.entity_id)
    labels: dict[str, dict] = {
        etype: repo.entity_labels(db, etype, ids)
        for etype, ids in ids_by_type.items()
    }
    out: list[MyMention] = []
    for mention, comment, author in rows:
        if comment.entity_type not in _MENTION_TYPES:
            continue
        label = labels.get(comment.entity_type, {}).get(comment.entity_id)
        body = comment.body or ""
        excerpt = body if len(body) <= _EXCERPT_LEN else body[:_EXCERPT_LEN] + "…"
        out.append(
            MyMention(
                id=str(mention.id),
                comment_id=str(comment.id),
                entity_type=comment.entity_type,  # type: ignore[arg-type]
                entity_id=str(comment.entity_id),
                entity_label=label or "",
                author_name=author or "",
                excerpt=excerpt,
                created_at=comment.created_at.isoformat(),
            )
        )
    return out


def _review_requests(db: Session, user: User) -> list[MyReviewRequest]:
    # Only Gestor/Admin can approve — a Membro never sees a review queue (C3).
    if user.role == Role.MEMBRO:
        return []
    scope = None if user.role == Role.ADMIN else repo._scoped_project_ids(user.id)
    out: list[MyReviewRequest] = []
    for task, project_name, assignee_name in repo.review_tasks(
        db, scope_project_ids=scope
    ):
        out.append(
            MyReviewRequest(
                id=str(task.id),
                task_id=str(task.id),
                task_title=task.title,
                project_name=project_name or "",
                # Seam: no "submitted for review by" column → the assignee whose
                # work is under review is the closest available attribution.
                requested_by_name=assignee_name or "",
                requested_at=task.updated_at.isoformat(),
            )
        )
    return out


def _projects(db: Session, user: User) -> list[MyProject]:
    rows = repo.my_projects(db, user.id)
    project_ids = [p.id for p, _ in rows]
    open_counts = repo.open_task_counts(db, project_ids)
    progress = repo.avg_phase_progress(db, project_ids)
    out: list[MyProject] = []
    for project, client_name in rows:
        health = project.published_health or project.suggested_health or "healthy"
        out.append(
            MyProject(
                id=str(project.id),
                name=project.name,
                client_name=client_name or "",
                health=health,  # type: ignore[arg-type]
                progress=progress.get(project.id, 0),
                open_tasks=open_counts.get(project.id, 0),
            )
        )
    return out


def _time_entries(db: Session, user: User) -> list[MyTimeEntry]:
    out: list[MyTimeEntry] = []
    for entry, task_title, project_name in repo.recent_time_entries(db, user.id):
        duration_ms = 0
        if entry.ended_at is not None:
            duration_ms = int(
                (entry.ended_at - entry.started_at).total_seconds() * 1000
            )
        out.append(
            MyTimeEntry(
                id=str(entry.id),
                task_id=str(entry.task_id),
                task_title=task_title or "",
                project_name=project_name or "",
                date=entry.started_at.date().isoformat(),
                duration_ms=duration_ms,
            )
        )
    return out


def _active_timer(db: Session, user: User) -> MyActiveTimer | None:
    found = repo.active_timer(db, user.id)
    if found is None:
        return None
    entry, task_title, project_name = found
    return MyActiveTimer(
        id=str(entry.id),
        task_id=str(entry.task_id),
        task_title=task_title or "",
        project_name=project_name or "",
        started_at=entry.started_at.isoformat(),
    )


def get_my_work(db: Session, user: User) -> MyWork:
    """Assemble the caller's personal daily hub (F3/F17), scoped to own work."""
    today = app_today()

    raw_tasks = repo.assigned_open_tasks(db, user.id)
    counts = repo.comment_counts(db, [t.id for t, _ in raw_tasks])
    my_tasks = [
        _to_my_task(task, project_name, counts.get(task.id, 0))
        for task, project_name in raw_tasks
    ]
    today_b, overdue, this_week, no_date = _bucket_tasks(my_tasks, today)

    logger.info(
        "my_work_built",
        actor_id=str(user.id),
        role=user.role,
        task_count=len(my_tasks),
    )
    return MyWork(
        today=today_b,
        overdue=overdue,
        this_week=this_week,
        no_date=no_date,
        meetings=_meetings(db, user, today),
        mentions=_mentions(db, user),
        review_requests=_review_requests(db, user),
        projects=_projects(db, user),
        recent_time_entries=_time_entries(db, user),
        active_timer=_active_timer(db, user),
    )
