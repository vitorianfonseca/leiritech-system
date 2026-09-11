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
    # Overrides GITHUB_DEFAULT_REPO for this one issue, e.g. to file a client
    # project's bug against that client's own repo instead of the app repo.
    repo: str | None = Field(default=None, max_length=255)


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
    created_at: datetime
