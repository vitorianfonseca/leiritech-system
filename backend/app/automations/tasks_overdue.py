"""AUTO-01 — overdue-task flagging (BR-048).

Daily. A task whose ``due_date`` is before today and is not ``done`` (and not
archived) is flagged, but ONLY when it lives in a live project (BR-054). The
primary assignee and the project owner/manager are notified.

Idempotent via a per-task-per-day ``group_key`` — a second run on the same day
notifies no one twice.
"""

from __future__ import annotations

from datetime import datetime

import structlog
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.automations._helpers import (
    LIVE_PROJECT_STATUSES,
    group_key,
    resolve_today,
)
from app.models.project import Project
from app.models.task import Task
from app.services import notification_service

logger = structlog.get_logger("leiritech.automation.tasks_overdue")

CODE = "AUTO-01"


def execute(db: Session, *, now: datetime | None = None) -> int:
    today = resolve_today(now)
    rows = db.execute(
        select(Task, Project)
        .join(Project, Task.project_id == Project.id)
        .where(
            Task.archived_at.is_(None),
            Task.status != "done",
            Task.due_date.is_not(None),
            Task.due_date < today,
            Project.status.in_(LIVE_PROJECT_STATUSES),
        )
    ).all()

    created = 0
    for task, project in rows:
        recipients = [task.primary_assignee_id, project.manager_id]
        created += notification_service.notify_many(
            db,
            user_ids=recipients,
            type="task_overdue",
            body=f"Tarefa «{task.title}» está em atraso desde {task.due_date}.",
            entity_type="task",
            entity_id=task.id,
            group_key=group_key(CODE, task.id, today),
        )
    logger.info("auto01_tasks_overdue", flagged=len(rows), notified=created)
    return created
