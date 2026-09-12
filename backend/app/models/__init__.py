"""Import all models so ``Base.metadata`` is fully populated for Alembic."""

from __future__ import annotations

from app.database.base import Base
from app.models.catalog import CatalogItem
from app.models.collaboration import (
    ActivityLog,
    Attachment,
    Comment,
    GithubIssueLink,
    Mention,
    Notification,
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
from app.models.proposal_content import (
    ProposalItem,
    ProposalSection,
    ProposalTemplate,
    ProposalTemplateItem,
    ProposalTemplateSection,
)
from app.models.task import Task, TaskAssignee, TaskChecklistItem, TaskDependency
from app.models.time_entry import TimeEntry
from app.models.user import (
    Invitation,
    RoleCapacityConfig,
    User,
    UserPreference,
    UserSession,
)

__all__ = [
    "Base",
    "CatalogItem",
    "ActivityLog",
    "Attachment",
    "Comment",
    "GithubIssueLink",
    "Mention",
    "Notification",
    "Company",
    "Contact",
    "Interaction",
    "Meeting",
    "Opportunity",
    "PipelineStage",
    "Proposal",
    "PaymentMilestone",
    "ProjectCost",
    "ProposalItem",
    "ProposalSection",
    "ProposalTemplate",
    "ProposalTemplateItem",
    "ProposalTemplateSection",
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
    "RoleCapacityConfig",
    "User",
    "UserPreference",
    "UserSession",
]
