"""Pydantic v2 schemas for the GitHub issue integration."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class GithubIssueCreate(BaseModel):
    entity_type: str = Field(min_length=1, max_length=64)
    entity_id: str = Field(min_length=1, max_length=255)
    title: str = Field(min_length=1, max_length=255)
    body: str = Field(default="", max_length=10000)
    labels: list[str] = Field(default_factory=list)
    assignees: list[str] = Field(default_factory=list)
    # Overrides GITHUB_DEFAULT_REPO for this one issue, e.g. to file a client
    # project's bug against that client's own repo instead of the app repo.
    repo: str | None = Field(default=None, max_length=255)


class GithubLabelInfo(BaseModel):
    name: str
    color: str
    description: str | None = None


class GithubAssigneeInfo(BaseModel):
    login: str
    avatar_url: str | None = None


class GithubIssueLinkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entity_type: str
    entity_id: str
    repo: str
    issue_number: int
    issue_url: str
    title: str
    state: str
    labels: list[GithubLabelInfo]
    assignees: list[GithubAssigneeInfo]
    created_at: datetime


class GithubIssueUpdate(BaseModel):
    """Every field is optional — only the provided ones are changed. ``labels``/
    ``assignees`` REPLACE the current set (matching GitHub's own PATCH
    semantics), not merge."""

    state: str | None = Field(default=None, pattern="^(open|closed)$")
    labels: list[str] | None = None
    assignees: list[str] | None = None


class GithubCommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=10000)


class GithubCommentResponse(BaseModel):
    id: int
    author: str
    author_avatar_url: str | None = None
    body: str
    created_at: datetime
    url: str
