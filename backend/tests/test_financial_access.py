"""BR-008 / BR-069 — financial-data access restriction, verified at the HTTP edge.

``test_permissions.py`` already proves the *pure predicates*
(``can_access_financials`` / ``can_manage_financials``). This module proves the
thing those predicates are only useful for: that the real FastAPI application,
driven through ``TestClient`` by a really-authenticated caller, actually behaves
the way BR-008 says. Two distinct failure modes, because passing (a) tells you
nothing about (b):

(a) **Endpoint enforcement** — every route in ``app/api/routes/finance.py``
    (payment milestones, project costs, live margin)
    returns 403 for a Membro and for a Gestor *without* the payments grant. The
    ids used are REAL (a milestone and a cost created by an Admin first), so a
    green test cannot be an accidental 404.

(b) **Field-level leakage** — BR-008 says financial data is *invisible*, not
    merely that ``/finance`` 403s. A Membro browsing ordinary, legitimately
    visible surfaces (project detail/list, dashboard, calendar, search,
    my-work, workload, notifications, activity feed) must not receive
    ``contracted_value`` / ``hours_budget`` / ``internal_cost_rate``, milestone
    amounts, cost lines or margin embedded in those responses.

Mode (b) is the one that actually leaks, and is checked two ways: by field name,
and — the stronger assertion — by seeding unmistakable **sentinel amounts** and
asserting those exact numbers appear nowhere in the raw response bytes of any
Membro-readable endpoint. A field renamed, nested, aliased to camelCase or
embedded in an audit-log JSONB snapshot still gets caught.

Every test carries a **positive control**: an Admin (and a Gestor *with* the
grant) must still see the data. Without that, a suite where everything 403s
would pass while proving nothing.

Scope note: BR-002 horizontal access and user enumeration are deliberately NOT
tested here (they belong to ``test_horizontal_access.py``). Where the two
overlap — a Membro reaching a financial surface on a project they are not a
member of — this module keeps the Membro a *legitimate project member*, so that
what is under test is unambiguously the financial dimension and never a
membership 404 masquerading as enforcement.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import date, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.database.session import SessionLocal
from app.models.collaboration import ActivityLog
from app.models.crm import Company
from app.models.project import Project, ProjectMember

API = "/api/v1"
PASSWORD = "correct-horse-battery"

# --------------------------------------------------------------------------- #
# Sentinel amounts. Deliberately large, odd and unlike any real seed/fixture
# value in the suite, so that finding one of these digit strings anywhere in a
# Membro's response body is conclusive evidence of a leak rather than a
# coincidental collision with an id, a count or a timestamp.
# --------------------------------------------------------------------------- #
SENTINEL_CONTRACTED = 918_273_645  # project.contracted_value (EUR cents)
SENTINEL_CONTRACTED_2 = 918_273_699  # value after an update (audit-log snapshot)
SENTINEL_COST_RATE = 13_579  # project.internal_cost_rate (cents/hour)
SENTINEL_HOURS_BUDGET = 4242.5  # project.hours_budget
SENTINEL_MILESTONE = 192_837_465  # payment_milestone.amount
SENTINEL_COST = 864_209_753  # project_cost.amount

ALL_SENTINELS: tuple[float, ...] = (
    SENTINEL_CONTRACTED,
    SENTINEL_CONTRACTED_2,
    SENTINEL_COST_RATE,
    SENTINEL_HOURS_BUDGET,
    SENTINEL_MILESTONE,
    SENTINEL_COST,
)

# Response keys that carry BR-008 financial data, in both the snake_case the
# project/finance schemas use and the camelCase aliases the dashboard emits.
FINANCIAL_KEYS: frozenset[str] = frozenset(
    {
        "contracted_value",
        "contractedValue",
        "internal_cost_rate",
        "internalCostRate",
        "internal_cost_rate_cents",
        "internalCostRateCents",
        "hours_budget",
        "hoursBudget",
        "received_amount",
        "receivedAmount",
        "costs_total",
        "costsTotal",
        "labor_cost",
        "laborCost",
        "contracted_cents",
        "contractedCents",
        "received_cents",
        "receivedCents",
        "margin",
    }
)


# --------------------------------------------------------------------------- #
# Auth + fixtures (all local to this module — conftest.py is intentionally
# untouched so this file cannot collide with concurrent work on other issues).
# --------------------------------------------------------------------------- #
def _token(client: TestClient, email: str) -> str:
    resp = client.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def track() -> Iterator[dict[str, list[uuid.UUID]]]:
    """Track project ids for teardown.

    Milestones, costs, members and tasks all cascade on project delete; activity
    rows do not (the audit trail is append-only and has no FK), so they are
    removed explicitly by entity id.
    """
    ids: dict[str, list[uuid.UUID]] = {"project": [], "audit": []}
    yield ids
    db = SessionLocal()
    try:
        entity_ids = ids["project"] + ids["audit"]
        if entity_ids:
            db.execute(delete(ActivityLog).where(ActivityLog.entity_id.in_(entity_ids)))
        if ids["project"]:
            db.execute(delete(Project).where(Project.id.in_(ids["project"])))
        db.commit()
    finally:
        db.close()


def _make_project(
    track: dict,
    *,
    status: str = "active",
    contracted_value: int | None = SENTINEL_CONTRACTED,
    internal_cost_rate: int | None = SENTINEL_COST_RATE,
    hours_budget: float | None = SENTINEL_HOURS_BUDGET,
) -> Project:
    """Insert a project carrying the sentinel financial values directly."""
    db = SessionLocal()
    try:
        project = Project(
            name=f"FinAccess {uuid.uuid4().hex[:8]}",
            status=status,
            contracted_value=contracted_value,
            internal_cost_rate=internal_cost_rate,
            hours_budget=hours_budget,
        )
        db.add(project)
        db.commit()
        db.refresh(project)
        track["project"].append(project.id)
        db.expunge(project)
        return project
    finally:
        db.close()


def _add_member(project_id: uuid.UUID, user_id: uuid.UUID) -> None:
    """Make ``user_id`` a real project member.

    This is what keeps BR-002 out of the way: the Membro is legitimately inside
    the project's visibility scope, so any 403/absent field observed afterwards
    is attributable to BR-008 and not to a membership 404.
    """
    db = SessionLocal()
    try:
        db.add(ProjectMember(project_id=project_id, user_id=user_id))
        db.commit()
    finally:
        db.close()


# --------------------------------------------------------------------------- #
# Deep response scanning
# --------------------------------------------------------------------------- #
def _walk(node: Any, path: str = "$") -> Iterator[tuple[str, str | None, Any]]:
    """Yield ``(path, key, value)`` for every node in a decoded JSON document."""
    if isinstance(node, dict):
        for key, value in node.items():
            child = f"{path}.{key}"
            yield child, key, value
            yield from _walk(value, child)
    elif isinstance(node, list):
        for index, value in enumerate(node):
            child = f"{path}[{index}]"
            yield child, None, value
            yield from _walk(value, child)


def _financial_key_hits(payload: Any) -> list[str]:
    """Paths where a BR-008 financial key carries a non-null value.

    A key present but ``null`` is the redaction contract used by
    ``projects.py::_project_response`` and is therefore accepted.
    """
    return [
        path
        for path, key, value in _walk(payload)
        if key in FINANCIAL_KEYS and value is not None
    ]


def _sentinel_hits(raw: str, sentinels: tuple[float, ...] = ALL_SENTINELS) -> list[str]:
    """Sentinel amounts appearing anywhere in the raw response body."""
    return [str(s) for s in sentinels if str(s) in raw]


def _assert_no_financial_leak(
    resp: Any,
    label: str,
    *,
    sentinels: tuple[float, ...] = ALL_SENTINELS,
) -> None:
    """Assert a response carries no BR-008 financial data, by key and by value."""
    assert resp.status_code == 200, f"{label}: {resp.status_code} {resp.text}"
    key_hits = _financial_key_hits(resp.json())
    value_hits = _sentinel_hits(resp.text, sentinels)
    assert not key_hits, f"{label} leaked financial field(s) at: {key_hits}"
    assert not value_hits, (
        f"{label} leaked sentinel amount(s) {value_hits} in the response body"
    )


# --------------------------------------------------------------------------- #
# The finance surface: every route in app/api/routes/finance.py, with REAL ids.
# --------------------------------------------------------------------------- #
def _finance_surface(
    client: TestClient, admin_token: str, project: Project, track: dict
) -> list[tuple[str, str, str, dict | None]]:
    """Create a real milestone + cost, then enumerate every finance endpoint.

    Returns ``(label, method, url, json_body)`` tuples. Bodies are *valid* so a
    403 can never be confused with a 422, and the ids are real so a 403 can
    never be confused with a 404.
    """
    milestone = client.post(
        f"{API}/finance/payment-milestones",
        headers=_auth(admin_token),
        json={
            "project_id": str(project.id),
            "amount": SENTINEL_MILESTONE,
            "expected_date": str(date.today() + timedelta(days=30)),
            "completion_criteria": "Kickoff signed",
        },
    )
    assert milestone.status_code == 201, milestone.text
    mid = milestone.json()["id"]
    track["audit"].append(uuid.UUID(mid))

    cost = client.post(
        f"{API}/finance/project-costs",
        headers=_auth(admin_token),
        json={
            "project_id": str(project.id),
            "description": "Cloud hosting",
            "amount": SENTINEL_COST,
        },
    )
    assert cost.status_code == 201, cost.text
    cid = cost.json()["id"]
    track["audit"].append(uuid.UUID(cid))

    base = f"{API}/finance"
    return [
        # Payment milestones
        ("GET /finance/payment-milestones", "GET", f"{base}/payment-milestones", None),
        (
            "POST /finance/payment-milestones",
            "POST",
            f"{base}/payment-milestones",
            {
                "project_id": str(project.id),
                "amount": 1000,
                "expected_date": str(date.today() + timedelta(days=15)),
                "completion_criteria": "Phase 2 delivered",
            },
        ),
        (
            "GET /finance/payment-milestones/{id}",
            "GET",
            f"{base}/payment-milestones/{mid}",
            None,
        ),
        (
            "PATCH /finance/payment-milestones/{id}",
            "PATCH",
            f"{base}/payment-milestones/{mid}",
            {"amount": 2000},
        ),
        (
            "POST /finance/payment-milestones/{id}/status",
            "POST",
            f"{base}/payment-milestones/{mid}/status",
            {"status": "invoiced", "external_invoice_ref": "EXT-1"},
        ),
        # Project costs (BR-069 / H8)
        (
            "GET /finance/project-costs",
            "GET",
            f"{base}/project-costs?project_id={project.id}",
            None,
        ),
        (
            "POST /finance/project-costs",
            "POST",
            f"{base}/project-costs",
            {"project_id": str(project.id), "description": "x", "amount": 1},
        ),
        ("GET /finance/project-costs/{id}", "GET", f"{base}/project-costs/{cid}", None),
        (
            "PATCH /finance/project-costs/{id}",
            "PATCH",
            f"{base}/project-costs/{cid}",
            {"amount": 9000},
        ),
        (
            "DELETE /finance/project-costs/{id}",
            "DELETE",
            f"{base}/project-costs/{cid}",
            None,
        ),
        # Live margin (BR-065)
        (
            "GET /finance/projects/{id}/summary",
            "GET",
            f"{base}/projects/{project.id}/summary",
            None,
        ),
        # Financial report group (BR-008 gated at the route layer)
    ]


def _call(client: TestClient, method: str, url: str, token: str, body: dict | None):
    return client.request(method, url, headers=_auth(token), json=body)


# =========================================================================== #
# (a) Endpoint enforcement — 403 on every financial route
# =========================================================================== #
def test_membro_gets_403_on_every_finance_endpoint(client, make_user, track) -> None:
    """BR-008/BR-069: a Membro is refused by every financial route.

    The Membro is a *real member* of the project, so this isolates the financial
    dimension from the BR-002 membership dimension.
    """
    admin = make_user(role="admin")
    membro = make_user(role="membro")
    project = _make_project(track)
    _add_member(project.id, membro.id)

    admin_token = _token(client, admin.email)
    membro_token = _token(client, membro.email)
    surface = _finance_surface(client, admin_token, project, track)

    failures = []
    for label, method, url, body in surface:
        resp = _call(client, method, url, membro_token, body)
        if resp.status_code != 403:
            failures.append(f"{label} -> {resp.status_code} (expected 403)")

    assert not failures, "Membro was not refused on: " + "; ".join(failures)


def test_gestor_without_grant_gets_403_on_every_finance_endpoint(
    client, make_user, track
) -> None:
    """A Gestor lacking ``payments_grant`` is treated exactly like a Membro here
    (permission matrix §3: financial access is grant-gated, not role-implied)."""
    admin = make_user(role="admin")
    gestor = make_user(role="gestor", payments_grant=False)
    project = _make_project(track)

    admin_token = _token(client, admin.email)
    gestor_token = _token(client, gestor.email)
    surface = _finance_surface(client, admin_token, project, track)

    failures = []
    for label, method, url, body in surface:
        resp = _call(client, method, url, gestor_token, body)
        if resp.status_code != 403:
            failures.append(f"{label} -> {resp.status_code} (expected 403)")

    assert not failures, "Ungranted Gestor was not refused on: " + "; ".join(failures)


def test_membro_403_uses_the_finance_error_code(client, make_user, track) -> None:
    """The refusal is the BR-008 gate specifically, not an incidental role check."""
    membro = make_user(role="membro")
    project = _make_project(track)
    _add_member(project.id, membro.id)

    resp = client.get(
        f"{API}/finance/projects/{project.id}/summary",
        headers=_auth(_token(client, membro.email)),
    )
    assert resp.status_code == 403, resp.text
    assert "FINANCE_NOT_PERMITTED" in resp.text


@pytest.mark.parametrize("grant_holder", ["admin", "gestor_with_grant"])
def test_finance_endpoints_reachable_for_grant_holders(
    client, make_user, track, grant_holder: str
) -> None:
    """POSITIVE CONTROL. Without this, a suite where *everything* 403s would go
    green while proving nothing. Admin and Gestor+grant must never be refused;
    any non-403 status (200/201/204/409/422) counts as "the gate let them in"."""
    admin = make_user(role="admin")
    caller = (
        admin
        if grant_holder == "admin"
        else make_user(role="gestor", payments_grant=True)
    )
    project = _make_project(track)

    admin_token = _token(client, admin.email)
    caller_token = (
        admin_token if grant_holder == "admin" else _token(client, caller.email)
    )
    surface = _finance_surface(client, admin_token, project, track)

    failures = []
    for label, method, url, body in surface:
        resp = _call(client, method, url, caller_token, body)
        if resp.status_code == 403:
            failures.append(f"{label} -> 403 (should be permitted)")

    assert not failures, f"{grant_holder} was wrongly refused on: " + "; ".join(failures)


def test_grant_holder_actually_sees_the_sentinel_amounts(
    client, make_user, track
) -> None:
    """POSITIVE CONTROL for the sentinel technique itself: the amounts the Membro
    tests assert are *absent* really are present and findable for a grant holder.
    A silent change to the seeding helpers would otherwise make every
    leak assertion vacuously true."""
    admin = make_user(role="admin")
    project = _make_project(track)
    admin_token = _token(client, admin.email)
    _finance_surface(client, admin_token, project, track)

    summary = client.get(
        f"{API}/finance/projects/{project.id}/summary", headers=_auth(admin_token)
    )
    assert summary.status_code == 200, summary.text
    body = summary.json()
    assert body["contracted"] == SENTINEL_CONTRACTED
    assert body["costs_total"] == SENTINEL_COST
    assert body["internal_cost_rate"] == SENTINEL_COST_RATE

    detail = client.get(f"{API}/projects/{project.id}", headers=_auth(admin_token))
    assert detail.status_code == 200, detail.text
    assert detail.json()["contracted_value"] == SENTINEL_CONTRACTED
    assert detail.json()["internal_cost_rate"] == SENTINEL_COST_RATE
    assert detail.json()["hours_budget"] == SENTINEL_HOURS_BUDGET


# =========================================================================== #
# (b) Field-level leakage — the subtle failure mode
# =========================================================================== #
def test_project_detail_hides_financials_from_membro(client, make_user, track) -> None:
    """BR-008 is "invisible", not just "/finance 403s": the project a Membro can
    legitimately open must not carry contracted value, budget or cost rate."""
    membro = make_user(role="membro")
    project = _make_project(track)
    _add_member(project.id, membro.id)

    resp = client.get(
        f"{API}/projects/{project.id}", headers=_auth(_token(client, membro.email))
    )
    _assert_no_financial_leak(resp, "GET /projects/{id} as Membro")
    # Redaction must null the fields rather than drop them, so the response still
    # validates against ProjectResponse for the frontend.
    body = resp.json()
    assert body["contracted_value"] is None
    assert body["hours_budget"] is None
    assert body["internal_cost_rate"] is None


def test_project_list_hides_financials_from_membro(client, make_user, track) -> None:
    """The list endpoint redacts too — a per-item path is easy to forget when
    only the detail handler is patched."""
    membro = make_user(role="membro")
    project = _make_project(track)
    _add_member(project.id, membro.id)

    resp = client.get(
        f"{API}/projects?page_size=100", headers=_auth(_token(client, membro.email))
    )
    _assert_no_financial_leak(resp, "GET /projects as Membro")
    ours = [p for p in resp.json()["items"] if p["id"] == str(project.id)]
    assert ours, "the Membro should still see the project itself (BR-002 scope)"
    assert ours[0]["contracted_value"] is None


def test_project_detail_hides_financials_from_ungranted_gestor(
    client, make_user, track
) -> None:
    """Same redaction for a Gestor without the grant, plus the positive control
    that a *granted* Gestor does receive the values."""
    plain = make_user(role="gestor", payments_grant=False)
    granted = make_user(role="gestor", payments_grant=True)
    project = _make_project(track)

    url = f"{API}/projects/{project.id}"
    _assert_no_financial_leak(
        client.get(url, headers=_auth(_token(client, plain.email))),
        "GET /projects/{id} as ungranted Gestor",
    )

    ok = client.get(url, headers=_auth(_token(client, granted.email)))
    assert ok.status_code == 200, ok.text
    assert ok.json()["contracted_value"] == SENTINEL_CONTRACTED


def test_activity_feed_hides_financial_snapshots_from_membro(
    client, make_user, track
) -> None:
    """REGRESSION (issue #50): the audit trail leaked ``contracted_value``.

    ``GET /activity`` is reachable by any caller inside the entity's BR-002
    scope, and it emits the producers' raw ``before``/``after`` JSONB snapshots.
    ``project_service._SNAPSHOT_FIELDS`` includes ``contracted_value``, so every
    project create/update wrote the contracted amount into a document a Membro
    project-member could read verbatim — bypassing the ``_project_response``
    redaction entirely. Both the pre- and post-update values must be gone.
    """
    admin = make_user(role="admin")
    membro = make_user(role="membro")
    admin_token = _token(client, admin.email)

    created = client.post(
        f"{API}/projects",
        headers=_auth(admin_token),
        json={
            "name": f"Audit {uuid.uuid4().hex[:8]}",
            "contracted_value": SENTINEL_CONTRACTED,
            "internal_cost_rate": SENTINEL_COST_RATE,
            "hours_budget": SENTINEL_HOURS_BUDGET,
        },
    )
    assert created.status_code == 201, created.text
    pid = uuid.UUID(created.json()["id"])
    track["project"].append(pid)

    # An update records before/after snapshots carrying BOTH amounts.
    updated = client.patch(
        f"{API}/projects/{pid}",
        headers=_auth(admin_token),
        json={"contracted_value": SENTINEL_CONTRACTED_2},
    )
    assert updated.status_code == 200, updated.text

    _add_member(pid, membro.id)
    feed_url = f"{API}/activity?entity_type=project&entity_id={pid}"

    resp = client.get(feed_url, headers=_auth(_token(client, membro.email)))
    _assert_no_financial_leak(resp, "GET /activity (project) as Membro")

    # POSITIVE CONTROL: the snapshots still exist and the Admin still sees them,
    # so the audit trail stayed complete (BR-064) rather than being gutted.
    admin_feed = client.get(feed_url, headers=_auth(admin_token))
    assert admin_feed.status_code == 200, admin_feed.text
    assert str(SENTINEL_CONTRACTED_2) in admin_feed.text, (
        "Admin must still see financial audit snapshots — redaction must be "
        "per-caller, not a destructive change to what is recorded."
    )


def test_activity_feed_hides_financial_snapshots_from_ungranted_gestor(
    client, make_user, track
) -> None:
    """The same audit-trail redaction applies to a Gestor without the grant."""
    admin = make_user(role="admin")
    plain = make_user(role="gestor", payments_grant=False)
    admin_token = _token(client, admin.email)

    created = client.post(
        f"{API}/projects",
        headers=_auth(admin_token),
        json={
            "name": f"Audit {uuid.uuid4().hex[:8]}",
            "contracted_value": SENTINEL_CONTRACTED,
        },
    )
    assert created.status_code == 201, created.text
    pid = uuid.UUID(created.json()["id"])
    track["project"].append(pid)

    resp = client.get(
        f"{API}/activity?entity_type=project&entity_id={pid}",
        headers=_auth(_token(client, plain.email)),
    )
    _assert_no_financial_leak(resp, "GET /activity (project) as ungranted Gestor")


def test_dashboard_hides_financials_from_membro(client, make_user, track) -> None:
    """The Membro dashboard declares ``can_see_financials: false`` and carries no
    financial metric, chart or attention group (BR-002/BR-008)."""
    membro = make_user(role="membro")
    project = _make_project(track)
    _add_member(project.id, membro.id)

    resp = client.get(f"{API}/dashboard", headers=_auth(_token(client, membro.email)))
    _assert_no_financial_leak(resp, "GET /dashboard as Membro")

    body = resp.json()
    flag = body.get("canSeeFinancials", body.get("can_see_financials"))
    assert flag is False, f"dashboard must declare no financial visibility: {flag}"
    financial_metrics = [
        path for path, key, value in _walk(body) if key == "financial" and value is True
    ]
    assert not financial_metrics, (
        f"Membro dashboard carried financial-flagged entries at {financial_metrics}"
    )


def test_dashboard_shows_financials_to_admin(client, make_user, track) -> None:
    """POSITIVE CONTROL for the dashboard gate."""
    admin = make_user(role="admin")
    resp = client.get(f"{API}/dashboard", headers=_auth(_token(client, admin.email)))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    flag = body.get("canSeeFinancials", body.get("can_see_financials"))
    assert flag is True


def test_calendar_hides_payment_events_from_membro(client, make_user, track) -> None:
    """BR-008 names payment milestones explicitly: they must not surface as
    calendar events for a Membro, even on a project they belong to."""
    admin = make_user(role="admin")
    membro = make_user(role="membro")
    project = _make_project(track)
    _add_member(project.id, membro.id)

    admin_token = _token(client, admin.email)
    expected = date.today() + timedelta(days=10)
    created = client.post(
        f"{API}/finance/payment-milestones",
        headers=_auth(admin_token),
        json={
            "project_id": str(project.id),
            "amount": SENTINEL_MILESTONE,
            "expected_date": str(expected),
            "completion_criteria": "Delivery accepted",
        },
    )
    assert created.status_code == 201, created.text
    track["audit"].append(uuid.UUID(created.json()["id"]))

    window = f"from={date.today() - timedelta(days=1)}&to={expected + timedelta(days=1)}"
    resp = client.get(
        f"{API}/calendar?{window}", headers=_auth(_token(client, membro.email))
    )
    _assert_no_financial_leak(resp, "GET /calendar as Membro")
    types = {event.get("type") for event in resp.json()}
    assert "payment" not in types, f"Membro calendar exposed payment events: {types}"

    # POSITIVE CONTROL: the milestone really is inside the queried window.
    admin_cal = client.get(f"{API}/calendar?{window}", headers=_auth(admin_token))
    assert admin_cal.status_code == 200, admin_cal.text
    assert "payment" in {event.get("type") for event in admin_cal.json()}, (
        "the payment event must be visible to an Admin, otherwise the Membro "
        "assertion above is vacuous"
    )



def test_no_sentinel_leaks_across_membro_readable_surface(
    client, make_user, track
) -> None:
    """Sweep: seed every financial value on one project the Membro belongs to,
    then assert the raw bytes of every Membro-readable surface contain none of
    them. This is the catch-all for a financial field that gets embedded
    somewhere nobody thought to gate — a new nested schema, a serializer alias,
    a search snippet, an audit snapshot, a notification payload."""
    admin = make_user(role="admin")
    membro = make_user(role="membro")
    project = _make_project(track)
    _add_member(project.id, membro.id)

    admin_token = _token(client, admin.email)
    _finance_surface(client, admin_token, project, track)
    # Also drive a project update so audit snapshots exist for this project.
    client.patch(
        f"{API}/projects/{project.id}",
        headers=_auth(admin_token),
        json={"contracted_value": SENTINEL_CONTRACTED_2},
    )

    token = _token(client, membro.email)
    today = date.today()
    surfaces = [
        f"/projects/{project.id}",
        "/projects?page_size=100",
        f"/projects/{project.id}/health",
        f"/projects/{project.id}/members",
        f"/activity?entity_type=project&entity_id={project.id}",
        "/dashboard",
        "/my-work",
        "/workload",
        "/notifications",
        f"/calendar?from={today - timedelta(days=30)}&to={today + timedelta(days=90)}",
        f"/search?q={project.name.split()[1]}",
        f"/tasks?project_id={project.id}",
        "/time",
    ]

    leaks: list[str] = []
    readable = 0
    for path in surfaces:
        resp = client.get(f"{API}{path}", headers=_auth(token))
        if resp.status_code != 200:
            # A refusal is a *stronger* outcome than redaction; this sweep only
            # claims that nothing the Membro can actually read leaks.
            continue
        readable += 1
        hits = _sentinel_hits(resp.text)
        key_hits = _financial_key_hits(resp.json())
        if hits:
            leaks.append(f"{path}: sentinel amounts {hits}")
        if key_hits:
            leaks.append(f"{path}: financial keys at {key_hits}")

    assert not leaks, "BR-008 leak on Membro-readable surface(s):\n  " + "\n  ".join(
        leaks
    )
    # Guard against the sweep quietly becoming vacuous if paths are renamed:
    # a Membro really can read most of this surface, so it must be exercised.
    assert readable >= len(surfaces) - 2, (
        f"only {readable}/{len(surfaces)} surfaces returned 200 — the sweep is "
        "no longer covering what it claims to cover"
    )


# =========================================================================== #
# Write protection — BR-008 "non-writable", BR-069 create/edit is Admin-only
# =========================================================================== #
def test_membro_cannot_write_financial_fields_on_projects(
    client, make_user, track
) -> None:
    """A Membro cannot set contracted value / cost rate / budget through the
    project endpoints either, and the stored values are unchanged afterwards."""
    membro = make_user(role="membro")
    project = _make_project(track)
    _add_member(project.id, membro.id)
    token = _token(client, membro.email)

    create = client.post(
        f"{API}/projects",
        headers=_auth(token),
        json={"name": "Should not exist", "contracted_value": 1},
    )
    assert create.status_code == 403, create.text

    patch = client.patch(
        f"{API}/projects/{project.id}",
        headers=_auth(token),
        json={"contracted_value": 1, "internal_cost_rate": 1, "hours_budget": 1.0},
    )
    assert patch.status_code == 403, patch.text

    db = SessionLocal()
    try:
        fresh = db.get(Project, project.id)
        assert fresh is not None
        assert fresh.contracted_value == SENTINEL_CONTRACTED
        assert fresh.internal_cost_rate == SENTINEL_COST_RATE
    finally:
        db.close()


def test_membro_cannot_create_project_costs(client, make_user, track) -> None:
    """BR-069 explicitly: project_costs create/edit is Admin (or Gestor with the
    financial grant) only; a Membro gets 403 and nothing is persisted."""
    admin = make_user(role="admin")
    membro = make_user(role="membro")
    project = _make_project(track)
    _add_member(project.id, membro.id)

    resp = client.post(
        f"{API}/finance/project-costs",
        headers=_auth(_token(client, membro.email)),
        json={
            "project_id": str(project.id),
            "description": "Membro cost",
            "amount": SENTINEL_COST,
        },
    )
    assert resp.status_code == 403, resp.text

    listing = client.get(
        f"{API}/finance/project-costs?project_id={project.id}",
        headers=_auth(_token(client, admin.email)),
    )
    assert listing.status_code == 200, listing.text
    assert listing.json()["total"] == 0, "the refused cost must not have been written"


# --------------------------------------------------------------------------- #
# (c) Write-side enforcement — BR-008 says financial data is invisible AND
# non-writable. Reads were redacted in the response layer from the start, but
# PATCH/POST /projects sat behind RequireGestor with no financial gate, so a
# Gestor without the grant could SET a contracted value, an internal cost rate
# or an hours budget — numbers they are not permitted to read back.
# --------------------------------------------------------------------------- #
_FINANCIAL_WRITES = [
    ("contracted_value", 4_242_00),
    ("internal_cost_rate", 77_00),
    ("hours_budget", 321.0),
]


def test_gestor_without_grant_cannot_write_project_financials(
    client, make_user, track
) -> None:
    """Each financial field is refused individually, so one field silently
    slipping through cannot hide behind another being blocked."""
    admin = make_user(role="admin")
    gestor = make_user(role="gestor", payments_grant=False)
    project = _make_project(track)
    gestor_token = _token(client, gestor.email)

    failures = []
    for field, value in _FINANCIAL_WRITES:
        resp = client.patch(
            f"{API}/projects/{project.id}",
            json={field: value},
            headers=_auth(gestor_token),
        )
        if resp.status_code != 403:
            failures.append(f"PATCH {field} -> {resp.status_code} (expected 403)")

    assert not failures, "Ungranted Gestor was allowed to write: " + "; ".join(failures)

    # The stored values must be untouched — a 403 that still wrote would be worse
    # than no gate at all.
    db = SessionLocal()
    try:
        fresh = db.get(Project, project.id)
        assert fresh.contracted_value == SENTINEL_CONTRACTED
        assert fresh.internal_cost_rate == SENTINEL_COST_RATE
    finally:
        db.close()

    # Positive control: an Admin performs the same writes successfully.
    admin_token = _token(client, admin.email)
    for field, value in _FINANCIAL_WRITES:
        resp = client.patch(
            f"{API}/projects/{project.id}",
            json={field: value},
            headers=_auth(admin_token),
        )
        assert resp.status_code == 200, f"admin PATCH {field}: {resp.text}"


def test_gestor_without_grant_cannot_create_project_with_financials(
    client, make_user, track
) -> None:
    gestor = make_user(role="gestor", payments_grant=False)
    gestor_token = _token(client, gestor.email)

    db = SessionLocal()
    try:
        company = Company(name=f"FinAccess Co {uuid.uuid4().hex[:8]}")
        db.add(company)
        db.commit()
        db.refresh(company)
        company_id = company.id
    finally:
        db.close()

    try:
        resp = client.post(
            f"{API}/projects",
            json={
                "name": "Projeto com valor contratado",
                "company_id": str(company_id),
                "contracted_value": 9_999_00,
            },
            headers=_auth(gestor_token),
        )
        assert resp.status_code == 403, resp.text

        # Without the financial field the same Gestor may still create a project,
        # so the gate is proven to be about the field and not about the role.
        ok = client.post(
            f"{API}/projects",
            json={
                "name": "Projeto sem valor contratado",
                "company_id": str(company_id),
            },
            headers=_auth(gestor_token),
        )
        assert ok.status_code in (200, 201), ok.text
        track["project"].append(uuid.UUID(ok.json()["id"]))
    finally:
        db = SessionLocal()
        try:
            db.execute(delete(Company).where(Company.id == company_id))
            db.commit()
        finally:
            db.close()
