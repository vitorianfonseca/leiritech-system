"""Import all models so ``Base.metadata`` is fully populated for Alembic."""

from __future__ import annotations

from app.database.base import Base
from app.models.catalog import CatalogItem
from app.models.collaboration import (
    ActivityLog,
    Attachment,
    Comment,
    EntityTag,
    Mention,
    Notification,
    Tag,
)
from app.models.crm import (
    Company,
    Contact,
    Interaction,
    Meeting,
    Opportunity,
    PipelineStage,
    Proposal,
)
from app.models.finance import PaymentMilestone, ProjectCost
from app.models.project import (
    Milestone,
    Project,
    ProjectMember,
    ProjectPhase,
    ProjectTemplate,
    TemplatePhase,
    TemplateTask,
)
from app.models.task import Task, TaskAssignee, TaskChecklistItem, TaskDependency
from app.models.time_entry import TimeEntry
from app.models.user import Invitation, User, UserPreference, UserSession

__all__ = [
    "Base",
    "CatalogItem",
    "ActivityLog",
    "Attachment",
    "Comment",
    "EntityTag",
    "Mention",
    "Notification",
    "Tag",
    "Company",
    "Contact",
    "Interaction",
    "Meeting",
    "Opportunity",
    "PipelineStage",
    "Proposal",
    "PaymentMilestone",
    "ProjectCost",
    "Milestone",
    "Project",
    "ProjectMember",
    "ProjectPhase",
    "ProjectTemplate",
    "TemplatePhase",
    "TemplateTask",
    "Task",
    "TaskAssignee",
    "TaskChecklistItem",
    "TaskDependency",
    "TimeEntry",
    "Invitation",
    "User",
    "UserPreference",
    "UserSession",
]
