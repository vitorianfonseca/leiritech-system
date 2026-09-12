"""Endpoint-level horizontal-access and user-enumeration tests (BR-002, issue #49).

``tests/test_permissions.py`` already proves the *pure predicates* in
``app.core.permissions`` are correct over booleans. That proves nothing about
enforcement: a helper that is right in isolation is worthless if a route forgot
to call it. This module therefore drives the real FastAPI app, as a real
authenticated Membro, against real DB rows owned by somebody else, and asserts
the real HTTP status on every reachable surface.

What the spec actually says (it is NOT "always 404"):

* BR-002 (WORKFLOW_SPEC §2) — "Membro sees only projects/clients they are a
  member of (project_members) or own", violation: "403 / filtered-out (404 for
  non-owned)".
* §4.3 edge cases — "Tries to open a project they're not a member of (e.g. via
  search) → 404/filtered" and "Tries to create/edit a task on a project they're
  not a member of → 403 (H7/BR-002)".

Those two lines only look contradictory. The distinction the backend actually
implements — and the one this file pins — is **visibility first, rights second**:

1. The record is not visible to the caller at all → **404**, never 403, on read
   *and* on write. A 403 on a write would confirm the row exists and hand an
   attacker an enumeration oracle, which is exactly what BR-002's "404 for
   non-owned" exists to prevent (see ``task_service.create_task``, which 404s a
   Membro probing a project they cannot see *before* the edit check runs).
2. The record IS visible to the caller, but they lack the rights to change it →
   **403**. For tasks this is the H7 case and it is genuinely reachable two ways:
   a Membro who *manages* a project without being in ``project_members``
   (``test_membro_project_manager_not_member_gets_403_creating_task``), and a
   Membro who is the task's *assignee* in a project they do not belong to
   (``test_membro_assignee_outside_project_gets_403_editing_task``).

Plus the enumeration half of the issue: login, password forgot/reset and the
public invitation endpoints must not reveal whether an account exists — same
status, same body, and the same amount of work done either way.

Scope note: BR-008 (financial-data restriction) is issue #50's lane and is
deliberately not touched here.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.core import security
from app.database.session import SessionLocal
from app.models.collaboration import ActivityLog, Comment, GithubIssueLink
from app.models.crm import Company, Contact, Interaction, Meeting, Opportunity, Proposal
from app.models.project import Milestone, Project, ProjectMember, ProjectPhase
from app.models.task import Task
from app.models.time_entry import TimeEntry
from app.models.user import User

API = "/api/v1"
PASSWORD = "correct-horse-battery"


def _token(client: TestClient, email: str) -> str:
    resp = client.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _code(resp) -> str | None:
    try:
        return resp.json()["error"]["code"]
    except Exception:  # noqa: BLE001 — only used to enrich assertion messages
        return None


# --------------------------------------------------------------------------- #
# The fixture: one complete universe owned by somebody else
# --------------------------------------------------------------------------- #
@dataclass
class World:
    """A full set of records owned by ``gestor``, none of which ``outsider``
    (a Membro with no relationship to any of them) may see.

    ``insider`` is a Membro who IS in ``project_members``; every negative
    assertion below is paired with a positive one for them, so a green test can
    never be an artifact of "the endpoint 404s for everybody".
    """

    gestor: User
    outsider: User
    insider: User
    marker: str
    company_id: uuid.UUID
    contact_id: uuid.UUID
    project_id: uuid.UUID
    phase_id: uuid.UUID
    milestone_id: uuid.UUID
    task_id: uuid.UUID
    opportunity_id: uuid.UUID
    proposal_id: uuid.UUID
    meeting_id: uuid.UUID
    interaction_id: uuid.UUID
    comment_id: uuid.UUID
    gh_link_id: uuid.UUID
    time_entry_id: uuid.UUID


@pytest.fixture
def world(make_user) -> Iterator[World]:
    gestor = make_user(role="gestor")
    outsider = make_user(role="membro")
    insider = make_user(role="membro")
    marker = f"zqx{uuid.uuid4().hex[:9]}"
    now = datetime.now(UTC)

    db = SessionLocal()
    try:
        company = Company(name=f"Company {marker}", owner_id=gestor.id)
        db.add(company)
        db.flush()

        contact = Contact(
            name=f"Contact {marker}", company_id=company.id, owner_id=gestor.id
        )
        project = Project(
            name=f"Project {marker}",
            company_id=company.id,
            manager_id=gestor.id,
            status="active",
        )
        opportunity = Opportunity(
            title=f"Opportunity {marker}", company_id=company.id, owner_id=gestor.id
        )
        db.add_all([contact, project, opportunity])
        db.flush()

        # The insider is a project member — the positive control.
        db.add(ProjectMember(project_id=project.id, user_id=insider.id))

        phase = ProjectPhase(project_id=project.id, name=f"Phase {marker}")
        milestone = Milestone(project_id=project.id, name=f"Milestone {marker}")
        task = Task(
            project_id=project.id,
            title=f"Task {marker}",
            primary_assignee_id=gestor.id,
        )
        proposal = Proposal(
            reference=f"PROP-{marker}",
            company_id=company.id,
            opportunity_id=opportunity.id,
        )
        meeting = Meeting(
            title=f"Meeting {marker}",
            start_at=now + timedelta(days=1),
            organizer_id=gestor.id,
            company_id=company.id,
            project_id=project.id,
        )
        interaction = Interaction(
            type="note",
            body=f"Interaction {marker}",
            company_id=company.id,
            project_id=project.id,
            occurred_at=now,
            user_id=gestor.id,
        )
        gh_link = GithubIssueLink(
            entity_type="project",
            entity_id=str(project.id),
            repo="acme/example",
            issue_number=9001,
            issue_url="https://github.com/acme/example/issues/9001",
            title=f"Issue {marker}",
            state="open",
            created_by=gestor.id,
        )
        db.add_all(
            [phase, milestone, task, proposal, meeting, interaction, gh_link]
        )
        db.flush()

        comment = Comment(
            entity_type="project",
            entity_id=project.id,
            body=f"Comment {marker}",
            author_id=gestor.id,
        )
        entry = TimeEntry(
            user_id=gestor.id,
            task_id=task.id,
            started_at=now - timedelta(hours=2),
            ended_at=now - timedelta(hours=1),
        )
        db.add_all([comment, entry])
        db.flush()

        built = World(
            gestor=gestor,
            outsider=outsider,
            insider=insider,
            marker=marker,
            company_id=company.id,
            contact_id=contact.id,
            project_id=project.id,
            phase_id=phase.id,
            milestone_id=milestone.id,
            task_id=task.id,
            opportunity_id=opportunity.id,
            proposal_id=proposal.id,
            meeting_id=meeting.id,
            interaction_id=interaction.id,
            comment_id=comment.id,
            gh_link_id=gh_link.id,
            time_entry_id=entry.id,
        )
        db.commit()
    finally:
        db.close()

    yield built

    db = SessionLocal()
    try:
        db.execute(delete(Comment).where(Comment.id == built.comment_id))
        db.execute(
            delete(GithubIssueLink).where(GithubIssueLink.id == built.gh_link_id)
        )
        db.execute(delete(Meeting).where(Meeting.id == built.meeting_id))
        db.execute(delete(Interaction).where(Interaction.id == built.interaction_id))
        db.execute(delete(Proposal).where(Proposal.id == built.proposal_id))
        db.execute(delete(Opportunity).where(Opportunity.id == built.opportunity_id))
        # members / phases / milestones / tasks / time entries cascade off project
        db.execute(delete(Project).where(Project.id == built.project_id))
        db.execute(delete(Contact).where(Contact.id == built.contact_id))
        db.execute(delete(Company).where(Company.id == built.company_id))
        db.execute(
            delete(ActivityLog).where(
                ActivityLog.entity_id.in_(
                    [
                        built.project_id,
                        built.task_id,
                        built.company_id,
                        built.contact_id,
                        built.opportunity_id,
                        built.proposal_id,
                        built.time_entry_id,
                    ]
                )
            )
        )
        db.commit()
    finally:
        db.close()


@pytest.fixture
def outsider_auth(client, world) -> dict[str, str]:
    return _auth(_token(client, world.outsider.email))


@pytest.fixture
def insider_auth(client, world) -> dict[str, str]:
    return _auth(_token(client, world.insider.email))


# --------------------------------------------------------------------------- #
# 1. READS of a non-owned record → 404 (never 403: existence must not leak)
# --------------------------------------------------------------------------- #
def _read_paths(w: World) -> list[tuple[str, dict]]:
    """(path, query params) for every scoped single-record / entity-scoped read."""
    pid = str(w.project_id)
    return [
        (f"{API}/projects/{w.project_id}", {}),
        (f"{API}/projects/{w.project_id}/health", {}),
        (f"{API}/projects/{w.project_id}/members", {}),
        (f"{API}/tasks/{w.task_id}", {}),
        (f"{API}/tasks/{w.task_id}/checklist", {}),
        (f"{API}/tasks/{w.task_id}/dependencies", {}),
        (f"{API}/companies/{w.company_id}", {}),
        (f"{API}/contacts/{w.contact_id}", {}),
        (f"{API}/opportunities/{w.opportunity_id}", {}),
        (f"{API}/proposals/{w.proposal_id}", {}),
        (f"{API}/proposals/{w.proposal_id}/content", {}),
        (f"{API}/phases/{w.phase_id}", {}),
        (f"{API}/phases", {"project_id": pid}),
        (f"{API}/milestones/{w.milestone_id}", {}),
        (f"{API}/milestones", {"project_id": pid}),
        (f"{API}/meetings/{w.meeting_id}", {}),
        (f"{API}/comments", {"entity_type": "project", "entity_id": pid}),
        (f"{API}/attachments", {"entity_type": "project", "entity_id": pid}),
        (f"{API}/activity", {"entity_type": "project", "entity_id": pid}),
        (f"{API}/github/issues", {"entity_type": "project", "entity_id": pid}),
        (f"{API}/workload/{w.gestor.id}", {}),
    ]


def test_membro_reads_of_non_owned_records_all_404(client, world, outsider_auth):
    """Every scoped read of somebody else's record returns 404 — not 403, not 200.

    A 403 here would still confirm the row exists; BR-002's "404 for non-owned"
    is specifically an anti-enumeration requirement, so the assertion is exact.
    """
    failures = []
    for path, params in _read_paths(world):
        resp = client.get(path, params=params, headers=outsider_auth)
        if resp.status_code != 404:
            failures.append(f"{path} {params} -> {resp.status_code} ({_code(resp)})")
    assert not failures, "reads that leaked a non-owned record:\n" + "\n".join(failures)


def test_same_reads_succeed_for_a_project_member(client, world, insider_auth):
    """Positive control: the identical reads that 404 for the outsider must 200
    for a Membro who IS in project_members, otherwise the test above proves
    nothing (an endpoint that 404s for everyone would pass it)."""
    w = world
    pid = str(w.project_id)
    allowed = [
        (f"{API}/projects/{w.project_id}", {}),
        (f"{API}/projects/{w.project_id}/members", {}),
        (f"{API}/tasks/{w.task_id}", {}),
        (f"{API}/companies/{w.company_id}", {}),
        (f"{API}/contacts/{w.contact_id}", {}),
        (f"{API}/phases", {"project_id": pid}),
        (f"{API}/milestones", {"project_id": pid}),
        (f"{API}/meetings/{w.meeting_id}", {}),
        (f"{API}/comments", {"entity_type": "project", "entity_id": pid}),
        (f"{API}/activity", {"entity_type": "project", "entity_id": pid}),
        (f"{API}/github/issues", {"entity_type": "project", "entity_id": pid}),
    ]
    failures = []
    for path, params in allowed:
        resp = client.get(path, params=params, headers=insider_auth)
        if resp.status_code != 200:
            failures.append(f"{path} {params} -> {resp.status_code} ({_code(resp)})")
    assert not failures, "project member wrongly denied:\n" + "\n".join(failures)


def test_non_owned_and_nonexistent_ids_are_indistinguishable(
    client, world, outsider_auth
):
    """The whole point of 404-on-non-owned: a real-but-unreachable id and a
    made-up id must produce the SAME status and the same error code, so the
    response cannot be used as an existence oracle."""
    ghost = uuid.uuid4()
    pairs = [
        (f"{API}/projects/{world.project_id}", f"{API}/projects/{ghost}"),
        (f"{API}/tasks/{world.task_id}", f"{API}/tasks/{ghost}"),
        (f"{API}/companies/{world.company_id}", f"{API}/companies/{ghost}"),
        (f"{API}/contacts/{world.contact_id}", f"{API}/contacts/{ghost}"),
        (
            f"{API}/opportunities/{world.opportunity_id}",
            f"{API}/opportunities/{ghost}",
        ),
        (f"{API}/proposals/{world.proposal_id}", f"{API}/proposals/{ghost}"),
        (f"{API}/meetings/{world.meeting_id}", f"{API}/meetings/{ghost}"),
        (f"{API}/phases/{world.phase_id}", f"{API}/phases/{ghost}"),
        (f"{API}/milestones/{world.milestone_id}", f"{API}/milestones/{ghost}"),
    ]
    for real, fake in pairs:
        a = client.get(real, headers=outsider_auth)
        b = client.get(fake, headers=outsider_auth)
        assert a.status_code == b.status_code == 404, f"{real} vs {fake}"
        assert _code(a) == _code(b), (
            f"error code leaks existence: {real} -> {_code(a)} "
            f"but {fake} -> {_code(b)}"
        )


# --------------------------------------------------------------------------- #
# 2. LIST endpoints filter the record out entirely
# --------------------------------------------------------------------------- #
def _ids(resp) -> set[str]:
    body = resp.json()
    items = body["items"] if isinstance(body, dict) and "items" in body else body
    return {str(i["id"]) for i in items}


def test_membro_list_endpoints_filter_out_non_owned_records(
    client, world, outsider_auth
):
    w = world
    cases = [
        (f"{API}/projects", {"page_size": 100}, str(w.project_id)),
        (f"{API}/tasks", {"page_size": 100}, str(w.task_id)),
        (f"{API}/companies", {"page_size": 100}, str(w.company_id)),
        (f"{API}/contacts", {"page_size": 100}, str(w.contact_id)),
        (f"{API}/opportunities", {"page_size": 100}, str(w.opportunity_id)),
        (f"{API}/proposals", {"page_size": 100}, str(w.proposal_id)),
        (f"{API}/interactions", {"page_size": 100}, str(w.interaction_id)),
        (f"{API}/meetings", {}, str(w.meeting_id)),
    ]
    failures = []
    for path, params, forbidden_id in cases:
        resp = client.get(path, params=params, headers=outsider_auth)
        if resp.status_code != 200:
            failures.append(f"{path} -> {resp.status_code}")
            continue
        if forbidden_id in _ids(resp):
            failures.append(f"{path} leaked {forbidden_id}")
    assert not failures, "list endpoints leaked non-owned rows:\n" + "\n".join(failures)


def test_membro_list_filter_by_id_does_not_bypass_scope(client, world, outsider_auth):
    """Passing the out-of-scope parent id as a query filter must not widen scope
    — the classic "filter as an ACL bypass" bug."""
    w = world
    scoped = [
        (f"{API}/tasks", {"project_id": str(w.project_id), "page_size": 100}),
        (f"{API}/projects", {"company_id": str(w.company_id), "page_size": 100}),
        (f"{API}/contacts", {"company_id": str(w.company_id), "page_size": 100}),
        (
            f"{API}/opportunities",
            {"company_id": str(w.company_id), "page_size": 100},
        ),
        (
            f"{API}/interactions",
            {"project_id": str(w.project_id), "page_size": 100},
        ),
    ]
    for path, params in scoped:
        resp = client.get(path, params=params, headers=outsider_auth)
        assert resp.status_code == 200, resp.text
        assert _ids(resp) == set(), f"{path} {params} leaked {_ids(resp)}"


def test_search_does_not_surface_non_owned_records(client, world, outsider_auth):
    """§4.3: "tries to open a project they're not a member of (e.g. via search)".
    Search is the most common accidental leak — it must be scoped at the query."""
    resp = client.get(
        f"{API}/search", params={"q": world.marker, "limit": 20}, headers=outsider_auth
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["groups"] == [], resp.text

    # Positive control: the marker IS findable by someone allowed to see it, so
    # the empty result above is real scoping and not a broken search term.
    gestor_resp = client.get(
        f"{API}/search",
        params={"q": world.marker, "limit": 20},
        headers=_auth(_token(client, world.gestor.email)),
    )
    assert gestor_resp.status_code == 200, gestor_resp.text
    assert gestor_resp.json()["groups"], "search marker matched nothing at all"


# --------------------------------------------------------------------------- #
# 3. WRITES against an invisible record → 404 (no 403 existence oracle)
# --------------------------------------------------------------------------- #
def test_membro_writes_against_invisible_records_404(client, world, outsider_auth):
    """A write to a record the caller cannot even see must 404, exactly like a
    read. Answering 403 would confirm the row exists.

    Note the §4.3 line "create/edit a task on a project they're not a member of
    → 403": that 403 is the *visible-but-not-permitted* case, pinned in the two
    tests below. When the project is not visible at all, BR-002's "404 for
    non-owned" wins — ``task_service.create_task`` 404s before the edit check.
    """
    w = world
    pid = str(w.project_id)
    cases = [
        ("post", f"{API}/tasks", {"project_id": pid, "title": "x"}),
        ("patch", f"{API}/tasks/{w.task_id}", {"title": "x"}),
        ("post", f"{API}/tasks/{w.task_id}/transition", {"status": "in_progress"}),
        ("post", f"{API}/tasks/{w.task_id}/assign", {"user_ids": []}),
        ("post", f"{API}/tasks/{w.task_id}/archive", None),
        ("post", f"{API}/tasks/{w.task_id}/duplicate", None),
        ("post", f"{API}/tasks/{w.task_id}/checklist", {"text": "x"}),
        ("post", f"{API}/time/start", {"task_id": str(w.task_id)}),
        (
            "post",
            f"{API}/comments",
            {"entity_type": "project", "entity_id": pid, "body": "x"},
        ),
        (
            "post",
            f"{API}/attachments/upload-url",
            {
                "entity_type": "project",
                "entity_id": pid,
                "filename": "a.pdf",
                "content_type": "application/pdf",
                "size_bytes": 1024,
            },
        ),
        (
            "post",
            f"{API}/interactions",
            {
                "type": "note",
                "body": "x",
                "project_id": pid,
                "occurred_at": datetime.now(UTC).isoformat(),
            },
        ),
        (
            "post",
            f"{API}/meetings",
            {
                "title": "x",
                "start_at": (datetime.now(UTC) + timedelta(days=2)).isoformat(),
                "project_id": pid,
            },
        ),
        ("post", f"{API}/github/issues/{w.gh_link_id}/refresh", None),
    ]
    failures = []
    for method, path, body in cases:
        resp = getattr(client, method)(path, json=body, headers=outsider_auth)
        if resp.status_code != 404:
            failures.append(
                f"{method.upper()} {path} -> {resp.status_code} ({_code(resp)})"
            )
    assert not failures, (
        "writes that leaked a non-owned record (expected 404):\n" + "\n".join(failures)
    )


def test_membro_cannot_edit_or_delete_another_users_time_entry(
    client, world, outsider_auth
):
    """Time entries are owned per user, not per project (BR-002 §Time)."""
    for method in ("patch", "delete"):
        resp = getattr(client, method)(
            f"{API}/time/{world.time_entry_id}",
            **({"json": {"notes": "x"}} if method == "patch" else {}),
            headers=outsider_auth,
        )
        assert resp.status_code == 404, f"{method}: {resp.status_code} {resp.text}"


def test_membro_cannot_edit_or_delete_another_users_comment(
    client, world, outsider_auth
):
    for method in ("patch", "delete"):
        resp = getattr(client, method)(
            f"{API}/comments/{world.comment_id}",
            **({"json": {"body": "x"}} if method == "patch" else {}),
            headers=outsider_auth,
        )
        assert resp.status_code == 404, f"{method}: {resp.status_code} {resp.text}"


# --------------------------------------------------------------------------- #
# 4. WRITES against a VISIBLE record without the rights → 403 (H7/BR-002)
# --------------------------------------------------------------------------- #
def test_membro_project_manager_not_member_gets_403_creating_task(
    client, make_user, world
):
    """§4.3 "create a task on a project they're not a member of → 403 (H7)".

    Reachable without leaking anything: the Membro *manages* the project (so it
    is legitimately visible to them — no enumeration concern) but is absent from
    ``project_members``, and ``can_edit_task`` requires membership for a Membro.
    """
    membro = make_user(role="membro")
    db = SessionLocal()
    try:
        project = db.get(Project, world.project_id)
        project.manager_id = membro.id
        db.commit()
    finally:
        db.close()

    headers = _auth(_token(client, membro.email))
    # The project is visible to them (they manage it) …
    assert client.get(f"{API}/projects/{world.project_id}", headers=headers).status_code == 200
    # … but writing a task into it is refused with 403, not 404.
    resp = client.post(
        f"{API}/tasks",
        json={"project_id": str(world.project_id), "title": "nope"},
        headers=headers,
    )
    assert resp.status_code == 403, resp.text
    assert _code(resp) == "TASK_CREATE_FORBIDDEN", resp.text


def test_membro_assignee_outside_project_gets_403_editing_task(
    client, make_user, world
):
    """The edit half of the same rule: a Membro assigned a task in a project they
    do not belong to may READ it (it is theirs to work on) but may not EDIT it —
    403, because the task's existence is already legitimately known to them."""
    membro = make_user(role="membro")
    db = SessionLocal()
    try:
        task = db.get(Task, world.task_id)
        task.primary_assignee_id = membro.id
        db.commit()
    finally:
        db.close()

    headers = _auth(_token(client, membro.email))
    assert client.get(f"{API}/tasks/{world.task_id}", headers=headers).status_code == 200

    resp = client.patch(
        f"{API}/tasks/{world.task_id}", json={"title": "hijacked"}, headers=headers
    )
    assert resp.status_code == 403, resp.text
    assert _code(resp) == "TASK_EDIT_FORBIDDEN", resp.text

    # And the parent project stays invisible — visibility of the task must not
    # transitively grant visibility of the project it lives in.
    assert (
        client.get(f"{API}/projects/{world.project_id}", headers=headers).status_code
        == 404
    )


def test_role_gate_fires_before_scoping_and_leaks_nothing(client, world, outsider_auth):
    """Gestor-only writes (BR-001) reject a Membro on role alone. That is fine —
    but it must answer identically for a real id and a made-up one, or the role
    gate itself becomes the enumeration oracle."""
    ghost = uuid.uuid4()
    pairs = [
        (f"{API}/projects/{world.project_id}", f"{API}/projects/{ghost}"),
        (f"{API}/companies/{world.company_id}", f"{API}/companies/{ghost}"),
        (
            f"{API}/opportunities/{world.opportunity_id}",
            f"{API}/opportunities/{ghost}",
        ),
        (f"{API}/proposals/{world.proposal_id}", f"{API}/proposals/{ghost}"),
    ]
    for real, fake in pairs:
        a = client.patch(real, json={"name": "x"}, headers=outsider_auth)
        b = client.patch(fake, json={"name": "x"}, headers=outsider_auth)
        assert a.status_code == b.status_code == 403, f"{real}: {a.status_code}"
        assert _code(a) == _code(b) == "GESTOR_REQUIRED", f"{real}: {_code(a)}"


# --------------------------------------------------------------------------- #
# 5. Workload / team reads
# --------------------------------------------------------------------------- #
def test_membro_team_workload_is_scoped_to_self_only(client, world, outsider_auth):
    resp = client.get(f"{API}/workload", headers=outsider_auth)
    assert resp.status_code == 200, resp.text
    user_ids = {str(e["user_id"]) for e in resp.json()["items"]}
    assert user_ids <= {str(world.outsider.id)}, user_ids


# --------------------------------------------------------------------------- #
# 6. USER ENUMERATION — login
# --------------------------------------------------------------------------- #
def test_login_response_identical_for_known_and_unknown_email(client, make_user):
    """Same status, same code, same message whether or not the account exists.

    Stays well inside the limiter budgets (#48: login is 5/min per (ip,email)
    and 20/min per ip) — two requests with different emails is 1 hit each.
    """
    user = make_user(role="membro")
    known = client.post(
        f"{API}/auth/login", json={"email": user.email, "password": "wrong-password"}
    )
    unknown = client.post(
        f"{API}/auth/login",
        json={"email": f"nobody-{uuid.uuid4().hex}@example.com", "password": "wrong-password"},
    )
    assert known.status_code == unknown.status_code == 401
    assert known.json() == unknown.json(), (
        f"login leaks account existence: {known.json()} vs {unknown.json()}"
    )
    assert known.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_login_hashes_a_password_even_for_an_unknown_email(
    client, make_user, monkeypatch
):
    """The anti-timing measure, asserted deterministically instead of by wall
    clock: the unknown-email path must still run one password verification, so
    the two branches do the same amount of (dominant) work. A wall-clock
    assertion would be flaky in CI; counting the verify call is not.
    """
    calls: list[str] = []
    real_verify = security.verify_password

    def _counting_verify(password: str, hashed: str) -> bool:
        calls.append(hashed)
        return real_verify(password, hashed)

    monkeypatch.setattr(security, "verify_password", _counting_verify)

    user = make_user(role="membro")
    calls.clear()
    client.post(
        f"{API}/auth/login", json={"email": user.email, "password": "wrong-password"}
    )
    known_calls = len(calls)

    calls.clear()
    client.post(
        f"{API}/auth/login",
        json={"email": f"nobody-{uuid.uuid4().hex}@example.com", "password": "wrong-password"},
    )
    unknown_calls = len(calls)

    assert known_calls == unknown_calls == 1, (
        f"timing oracle: known-email path did {known_calls} hash verifications, "
        f"unknown-email path did {unknown_calls}"
    )


def test_login_does_not_leak_existence_through_a_deactivated_account(
    client, make_user
):
    """A deactivated account answers ACCOUNT_DEACTIVATED — but only *after* the
    password verifies, so it is never reachable by guessing an email alone."""
    inactive = make_user(role="membro", status="deactivated")
    wrong_pw = client.post(
        f"{API}/auth/login", json={"email": inactive.email, "password": "not-the-password"}
    )
    assert wrong_pw.status_code == 401
    assert wrong_pw.json()["error"]["code"] == "INVALID_CREDENTIALS"


# --------------------------------------------------------------------------- #
# 7. USER ENUMERATION — password reset
# --------------------------------------------------------------------------- #
def test_forgot_password_identical_for_known_and_unknown_email(
    client, make_user, monkeypatch
):
    """§9: always 200 with the same body. Also asserts the *side effect* is the
    only difference — a reset mail goes out for the real account and not for the
    unknown one, while the HTTP response is byte-identical.

    Budget check (#48): forgot is 3/min per (ip,email) and 20/min per ip; this
    test sends 2 requests with different emails.
    """
    from app.services.email_service import email_service

    sent: list[str] = []
    monkeypatch.setattr(
        email_service,
        "send_password_reset",
        lambda *, to, reset_link: sent.append(to),
    )

    user = make_user(role="membro")
    known = client.post(f"{API}/auth/password/forgot", json={"email": user.email})
    unknown = client.post(
        f"{API}/auth/password/forgot",
        json={"email": f"nobody-{uuid.uuid4().hex}@example.com"},
    )

    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json(), (
        f"forgot-password leaks existence: {known.json()} vs {unknown.json()}"
    )
    assert sent == [user.email], sent


def test_reset_password_identical_for_bad_token_shapes(client, make_user):
    """The reset endpoint must not distinguish "token for an account that does
    not exist" from "garbage token" — both are the same generic 400.

    Budget check: /password/reset is 10/min per ip; this sends 3.
    """
    user = make_user(role="membro")
    ghost_token = security.create_password_reset_token(str(uuid.uuid4()), "deadbeef")
    real_user_bad_fingerprint = security.create_password_reset_token(
        str(user.id), "not-the-fingerprint"
    )

    responses = [
        client.post(
            f"{API}/auth/password/reset",
            json={"token": tok, "new_password": "a-brand-new-passphrase"},
        )
        for tok in ("total-garbage", ghost_token, real_user_bad_fingerprint)
    ]
    for resp in responses:
        assert resp.status_code == 400, resp.text
        assert resp.json()["error"]["code"] == "INVALID_RESET_TOKEN", resp.text
    assert len({r.json()["error"]["message"] for r in responses}) == 1, (
        "reset-password message differs between token failure modes"
    )


# --------------------------------------------------------------------------- #
# 8. USER ENUMERATION — invitations
# --------------------------------------------------------------------------- #
def test_public_invitation_lookup_does_not_confirm_accounts(client, make_user):
    """GET /invitations/{token} is public. An unknown token must 404 regardless
    of whether the string resembles a real user's email or id.

    Budget check: 10/min per ip; this sends 3.
    """
    user = make_user(role="membro")
    for token in ("not-a-token", user.email, str(user.id)):
        resp = client.get(f"{API}/invitations/{token}")
        assert resp.status_code == 404, f"{token}: {resp.status_code} {resp.text}"


def test_invitation_accept_does_not_confirm_accounts(client, make_user):
    """POST /invitations/accept with a forged token must fail identically
    whether or not the email in play belongs to a real account."""
    user = make_user(role="membro")
    bodies = [
        {"token": "garbage", "name": "X", "password": "a-brand-new-passphrase"},
        {"token": str(user.id), "name": "X", "password": "a-brand-new-passphrase"},
    ]
    responses = [client.post(f"{API}/invitations/accept", json=b) for b in bodies]
    statuses = {r.status_code for r in responses}
    assert statuses == {responses[0].status_code}, (
        f"accept leaks account existence through status: {statuses}"
    )
    assert len({r.json()["error"]["code"] for r in responses}) == 1, (
        "accept leaks account existence through error code"
    )


def test_membro_cannot_invite_at_all(client, make_user):
    """A Membro has no invite capability (BR-003), so the invitation surface is
    not an enumeration tool for them in the first place."""
    membro = make_user(role="membro")
    resp = client.post(
        f"{API}/invitations",
        json={"email": f"new-{uuid.uuid4().hex}@example.com", "role": "membro"},
        headers=_auth(_token(client, membro.email)),
    )
    assert resp.status_code == 403, resp.text
    assert _code(resp) == "INVITE_NOT_PERMITTED", resp.text


# --------------------------------------------------------------------------- #
# 9. Users directory — a Membro must not read arbitrary user records
# --------------------------------------------------------------------------- #
def test_membro_user_lookup_does_not_expose_password_material(
    client, world, outsider_auth
):
    """Whatever the directory policy is, no user-shaped response may ever carry
    password material (hard rule)."""
    resp = client.get(f"{API}/users/{world.gestor.id}", headers=outsider_auth)
    assert resp.status_code in (200, 403, 404), resp.text
    if resp.status_code == 200:
        body = resp.json()
        leaked = [k for k in body if "password" in k.lower() or k == "password_hash"]
        assert not leaked, f"user payload leaked {leaked}"


def test_no_endpoint_returns_a_password_hash(client, world, insider_auth):
    """Belt-and-braces sweep across the in-scope reads a Membro CAN make."""
    db = SessionLocal()
    try:
        hashed = db.get(User, world.gestor.id).password_hash
    finally:
        db.close()

    for path, params in [
        (f"{API}/projects/{world.project_id}/members", {}),
        (f"{API}/tasks/{world.task_id}", {}),
        (f"{API}/comments", {"entity_type": "project", "entity_id": str(world.project_id)}),
        (f"{API}/my-work", {}),
        (f"{API}/auth/me", {}),
    ]:
        resp = client.get(path, params=params, headers=insider_auth)
        assert resp.status_code == 200, f"{path}: {resp.text}"
        assert hashed not in resp.text, f"{path} returned a password hash"
