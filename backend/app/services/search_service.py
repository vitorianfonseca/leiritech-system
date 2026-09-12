"""Global search business logic (F18, BR-002).

Orchestrates the per-entity trigram searches into one grouped, role-scoped
response. Query hygiene (trim, minimum length, per-group cap) and the role/scope
decision live here so the route handler stays thin and the repository stays a
pure query builder.

Role scoping (BR-002): Admin and Gestor see the whole operation, so their
searches run unscoped. A Membro's searches are restricted to what they may see
by reusing each domain's existing ``membro_*_filter`` predicate — the exact same
horizontal-access boundary the list endpoints enforce — so search never surfaces
an entity the caller could not open directly.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable

import structlog
from sqlalchemy import ColumnElement
from sqlalchemy.orm import Session

from app.core.permissions import Role, role_at_least
from app.models.user import User
from app.repositories import crm as crm_repo
from app.repositories import pipeline as pipeline_repo
from app.repositories import projects as project_repo
from app.repositories import proposals as proposal_repo
from app.repositories import search as search_repo
from app.repositories import tasks as task_repo
from app.schemas.search import SearchGroup, SearchHit, SearchResponse

logger = structlog.get_logger("leiritech.search")

# Query hygiene knobs.
MIN_QUERY_LEN = 2
DEFAULT_LIMIT = 5
MAX_LIMIT = 20

# All searchable group keys (plural), in the order they appear in the response.
GROUP_KEYS: tuple[str, ...] = (
    "companies",
    "contacts",
    "opportunities",
    "projects",
    "tasks",
    "proposals",
    "interactions",
)


def _snippet(text: str | None, *, length: int = 80) -> str:
    value = (text or "").strip()
    return value if len(value) <= length else value[: length - 1] + "…"


# Per-group config: the repo search fn, the scope-filter builder (None → no
# Membro filter needed for that entity), and the ORM→SearchHit mapper.
_ScopeBuilder = Callable[[uuid.UUID], ColumnElement[bool]]
_SearchFn = Callable[..., list]
_HitMapper = Callable[[object], SearchHit]


def _group_config() -> dict[str, tuple[_SearchFn, _ScopeBuilder, _HitMapper]]:
    return {
        "companies": (
            search_repo.search_companies,
            crm_repo.membro_company_filter,
            lambda c: SearchHit(
                type="company", id=c.id, label=c.name, sublabel=c.status
            ),
        ),
        "contacts": (
            search_repo.search_contacts,
            crm_repo.membro_contact_filter,
            lambda c: SearchHit(
                type="contact", id=c.id, label=c.name, sublabel=c.role_title
            ),
        ),
        "opportunities": (
            search_repo.search_opportunities,
            pipeline_repo.membro_opportunity_filter,
            lambda o: SearchHit(
                type="opportunity", id=o.id, label=o.title, sublabel=o.outcome
            ),
        ),
        "projects": (
            search_repo.search_projects,
            project_repo.membro_project_filter,
            lambda p: SearchHit(
                type="project", id=p.id, label=p.name, sublabel=p.status
            ),
        ),
        "tasks": (
            search_repo.search_tasks,
            task_repo.membro_task_filter,
            lambda t: SearchHit(
                type="task", id=t.id, label=t.title, sublabel=t.status
            ),
        ),
        "proposals": (
            search_repo.search_proposals,
            proposal_repo.membro_proposal_filter,
            lambda p: SearchHit(
                type="proposal", id=p.id, label=p.reference, sublabel=p.status
            ),
        ),
        "interactions": (
            search_repo.search_interactions,
            crm_repo.membro_interaction_filter,
            lambda i: SearchHit(
                type="interaction",
                id=i.id,
                label=_snippet(i.body),
                sublabel=i.type,
            ),
        ),
    }


def _resolve_types(types: str | None) -> list[str]:
    """Parse the optional ``types`` CSV into a validated, ordered group list.

    Unknown tokens are ignored. When nothing valid is requested, all groups are
    searched (the default global-search behaviour)."""
    if not types:
        return list(GROUP_KEYS)
    requested = {t.strip().lower() for t in types.split(",") if t.strip()}
    selected = [g for g in GROUP_KEYS if g in requested]
    return selected or list(GROUP_KEYS)


def search(
    db: Session,
    user: User,
    *,
    q: str,
    limit: int = DEFAULT_LIMIT,
    types: str | None = None,
) -> SearchResponse:
    """Grouped, role-scoped global search (F18)."""
    term = (q or "").strip()
    limit = max(1, min(limit, MAX_LIMIT))

    # Minimum-length guard: too-short queries return an empty (but well-formed)
    # envelope rather than scanning every table for a single trigram.
    if len(term) < MIN_QUERY_LEN:
        return SearchResponse(query=term, groups=[])

    is_membro = not role_at_least(user.role, Role.GESTOR)
    selected = _resolve_types(types)
    config = _group_config()

    groups: list[SearchGroup] = []
    for key in selected:
        search_fn, scope_builder, to_hit = config[key]
        scope_filter = scope_builder(user.id) if is_membro else None
        rows = search_fn(db, term=term, scope_filter=scope_filter, limit=limit)
        if not rows:
            continue
        items = [to_hit(row) for row in rows]
        groups.append(SearchGroup(type=key, count=len(items), items=items))

    logger.debug(
        "search.performed",
        user_id=str(user.id),
        role=user.role,
        scoped=is_membro,
        query_len=len(term),
        groups=len(groups),
    )
    return SearchResponse(query=term, groups=groups)
