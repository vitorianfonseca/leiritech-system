# Proposal Templates + Product Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users build client proposals from reusable, well-configured templates that assemble text sections + priced line items (from a product/service catalog) + terms + tax/totals, instantiate them into a proposal with one action, and preview the result as a branded, printable page inside the app.

**Architecture:** Three cohesive units built in dependency order — Catalog (master data) → Proposal Templates (blueprints) → Proposal structured content + preview. A proposal **deep-copies (snapshots)** template sections/items and catalog prices at instantiation, so later edits to templates/catalog never mutate existing proposals. Money is integer EUR cents; totals are computed by a pure function module and grouped by billing type (one-time / monthly / annual). `proposals.value` is recomputed as the one-time net total (excl. IVA) so the existing lifecycle (BR-025..028) and dashboard stay intact.

**Tech Stack:** Backend — Python 3.12, FastAPI, SQLAlchemy 2.0 (sync `Session`), Alembic, Pydantic v2, pytest. Frontend — Next.js 16 App Router, TypeScript, shadcn/ui, Tailwind, TanStack Query, next-intl.

## Global Constraints

- Money is **integer EUR cents** everywhere (`BigInteger` columns, `int` in Pydantic/TS). Tax rate is `numeric(5,2)` percent.
- Enum values are **stable English keys** persisted via `sa.Enum(..., native_enum=False)`; pt-PT labels render client-side only.
- Mutations require `RequireGestor`; reads use `CurrentUser`. Follow the `models → repositories → services → api/routes` layering; route handlers never touch the ORM.
- All new models extend `AuditBase` (UUID PK + timestamps + `created_by`); soft-deletable ones add `ArchiveMixin` (`archived_at`).
- Frontend: **locale is NEVER in the URL** (`localePrefix: "never"`); canonical locale `pt-PT` (EUR, dd/mm/yyyy) with `en` mirror. No hardcoded UI strings — dot-notation i18n keys in `messages/pt-PT.json` + `messages/en.json`.
- Frontend API clients call the typed `http` wrapper (`frontend/src/lib/api/http.ts`), define `Backend*` (snake) shapes and map to camelCase domain types, and expose a typed interface consumed via TanStack Query. Mirror `frontend/src/lib/api/proposals.ts`.
- **Naming collision guard:** `templates.ts` / `TemplatesApi` already means *project* templates (F9). Proposal templates use `proposal-templates` routes, `proposalTemplatesApi`, `proposal_templates` tables, `proposalTemplates.*` i18n keys.
- Light mode default. lucide-react icons, stroke 1.5–1.8, `aria-hidden` on decorative icons.
- Final UI gate: Playwright **CLI** visual readback (never MCP Playwright).

---

## File Structure

**Backend (new):**
- `backend/app/models/catalog.py` — `CatalogItem`.
- `backend/app/models/proposal_content.py` — `ProposalTemplate`, `ProposalTemplateSection`, `ProposalTemplateItem`, `ProposalSection`, `ProposalItem`.
- `backend/app/schemas/catalog.py`, `backend/app/schemas/proposal_templates.py`, `backend/app/schemas/proposal_content.py`.
- `backend/app/repositories/catalog.py`, `backend/app/repositories/proposal_templates.py`.
- `backend/app/services/proposal_totals.py` (pure), `backend/app/services/proposal_placeholders.py` (pure), `backend/app/services/catalog_service.py`, `backend/app/services/proposal_template_service.py`.
- `backend/app/api/routes/catalog.py`, `backend/app/api/routes/proposal_templates.py`.
- `backend/alembic/versions/*` — three migrations (catalog; templates; proposal content columns + tables).
- Tests: `backend/tests/test_catalog.py`, `test_proposal_totals.py`, `test_proposal_placeholders.py`, `test_proposal_templates.py`, `test_proposal_content.py`.

**Backend (modified):**
- `backend/app/models/enums.py` — add `CATALOG_UNITS`, `BILLING_TYPES`.
- `backend/app/models/crm.py` — add `template_id`, `discount_bps`, `terms` to `Proposal`; add relationships to sections/items.
- `backend/app/api/router.py` — register catalog + proposal-templates routers.
- `backend/app/schemas/proposals.py` — add content sub-schemas + apply-template payload.
- `backend/app/api/routes/proposals.py` + `backend/app/services/proposal_service.py` — content endpoints, instantiation, `value` recompute.

**Frontend (new):**
- `frontend/src/lib/api/catalog-types.ts`, `catalog.ts`.
- `frontend/src/lib/api/proposal-templates-types.ts`, `proposal-templates.ts`.
- `frontend/src/lib/api/proposal-content-types.ts` (shared line-item/section/totals types) — used by proposals + templates.
- `frontend/src/components/catalog/*`, `frontend/src/components/proposal-templates/*`.
- `frontend/src/components/proposals/proposal-content-editor.tsx`, `proposal-preview.tsx`, `line-items-table.tsx`, `totals-panel.tsx`.
- Pages: `crm/catalog/{page,new/page,[id]/page,[id]/edit/page}.tsx`, `crm/proposal-templates/{page,new/page,[id]/page}.tsx`, `crm/proposals/[id]/preview/page.tsx`.

**Frontend (modified):**
- Nav config (locate in Task 15), `messages/pt-PT.json`, `messages/en.json`.
- `frontend/src/components/proposals/proposal-detail-view.tsx` — mount content editor + preview link.
- `frontend/src/lib/api/proposals.ts` + `proposals-types.ts` — content methods + apply-template.

---

# MILESTONE 1 — Product/Service Catalog

## Task 1: Catalog enums

**Files:**
- Modify: `backend/app/models/enums.py`
- Test: `backend/tests/test_catalog.py`

**Interfaces:**
- Produces: `enums.CATALOG_UNITS: tuple[str,...]`, `enums.BILLING_TYPES: tuple[str,...]`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_catalog.py
from app.models import enums


def test_catalog_enums_exist():
    assert enums.CATALOG_UNITS == ("unit", "hour", "day", "month", "m2", "license", "fixed")
    assert enums.BILLING_TYPES == ("one_time", "monthly", "annual")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_catalog.py::test_catalog_enums_exist -v`
Expected: FAIL (`AttributeError: module 'app.models.enums' has no attribute 'CATALOG_UNITS'`)

- [ ] **Step 3: Add the enums**

In `backend/app/models/enums.py`, after the `# --- CRM ---` block add:

```python
# --- Catalog / proposal content ---
CATALOG_UNITS = ("unit", "hour", "day", "month", "m2", "license", "fixed")
BILLING_TYPES = ("one_time", "monthly", "annual")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_catalog.py::test_catalog_enums_exist -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/enums.py backend/tests/test_catalog.py
git commit -m "feat(catalog): add catalog unit and billing-type enums"
```

## Task 2: CatalogItem model + migration

**Files:**
- Create: `backend/app/models/catalog.py`
- Modify: `backend/app/models/__init__.py` (import so Alembic sees the table)
- Create: `backend/alembic/versions/<rev>_add_catalog_items.py`
- Test: `backend/tests/test_catalog.py`

**Interfaces:**
- Produces: `app.models.catalog.CatalogItem` (table `catalog_items`) with columns `id, name, description, category, unit, unit_price, tax_rate, billing_type, archived_at, created_at, updated_at, created_by`.

- [ ] **Step 1: Write the failing test**

```python
# append to backend/tests/test_catalog.py
from decimal import Decimal

from app.models.catalog import CatalogItem


def test_catalog_item_persists(db_session):
    item = CatalogItem(
        name="Licença anual",
        unit="license",
        unit_price=120000,  # €1200.00
        tax_rate=Decimal("23.00"),
        billing_type="annual",
    )
    db_session.add(item)
    db_session.flush()
    assert item.id is not None
    assert item.archived_at is None
    assert item.unit_price == 120000
```

> `db_session` fixture: reuse the one in `backend/tests/conftest.py` (same fixture `test_proposals.py` uses). If its name differs, match it.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_catalog.py::test_catalog_item_persists -v`
Expected: FAIL (`ModuleNotFoundError: No module named 'app.models.catalog'`)

- [ ] **Step 3: Create the model**

```python
# backend/app/models/catalog.py
"""Product/service catalog (reusable priced master data for proposals)."""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import BigInteger, Enum, Index, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import ArchiveMixin, AuditBase
from app.models import enums


class CatalogItem(AuditBase, ArchiveMixin):
    __tablename__ = "catalog_items"
    __table_args__ = (
        Index(
            "ix_catalog_items_name_trgm",
            "name",
            postgresql_using="gin",
            postgresql_ops={"name": "gin_trgm_ops"},
        ),
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    unit: Mapped[str] = mapped_column(
        Enum(*enums.CATALOG_UNITS, name="catalog_unit", native_enum=False),
        nullable=False,
        default="unit",
    )
    unit_price: Mapped[int] = mapped_column(BigInteger, nullable=False)  # EUR cents
    tax_rate: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("23.00")
    )
    billing_type: Mapped[str] = mapped_column(
        Enum(*enums.BILLING_TYPES, name="billing_type", native_enum=False),
        nullable=False,
        default="one_time",
    )
```

In `backend/app/models/__init__.py` add the import next to the others:

```python
from app.models.catalog import CatalogItem  # noqa: F401
```

- [ ] **Step 4: Generate + edit the migration**

Run: `cd backend && uv run alembic revision --autogenerate -m "add catalog_items"`
Open the new file. Verify it creates `catalog_items` with a CHECK constraint for each enum and the trigram index. Ensure the file has `op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")` **only if** earlier migrations didn't already (grep `pg_trgm` under `backend/alembic/versions/`; the F18 proposals-search migration already enables it, so you likely don't need it again).

- [ ] **Step 5: Apply + run tests**

Run: `cd backend && uv run alembic upgrade head && uv run pytest tests/test_catalog.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/catalog.py backend/app/models/__init__.py backend/alembic/versions/ backend/tests/test_catalog.py
git commit -m "feat(catalog): add CatalogItem model and migration"
```

## Task 3: Catalog schemas

**Files:**
- Create: `backend/app/schemas/catalog.py`
- Test: `backend/tests/test_catalog.py`

**Interfaces:**
- Produces: `CatalogItemCreate`, `CatalogItemUpdate`, `CatalogItemResponse`, and `CatalogUnit`/`BillingType` `Literal` aliases.

- [ ] **Step 1: Write the failing test**

```python
# append to backend/tests/test_catalog.py
import pytest
from pydantic import ValidationError

from app.schemas.catalog import CatalogItemCreate


def test_catalog_create_rejects_negative_price():
    with pytest.raises(ValidationError):
        CatalogItemCreate(name="x", unit="unit", unit_price=-1, billing_type="one_time")


def test_catalog_create_defaults_tax_23():
    payload = CatalogItemCreate(name="x", unit="unit", unit_price=1000, billing_type="one_time")
    assert str(payload.tax_rate) == "23.00"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_catalog.py -k catalog_create -v`
Expected: FAIL (`ModuleNotFoundError: No module named 'app.schemas.catalog'`)

- [ ] **Step 3: Create the schemas**

```python
# backend/app/schemas/catalog.py
"""Pydantic v2 schemas for the product/service catalog. Money is EUR cents."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

CatalogUnit = Literal["unit", "hour", "day", "month", "m2", "license", "fixed"]
BillingType = Literal["one_time", "monthly", "annual"]


class CatalogItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    category: str | None = Field(default=None, max_length=100)
    unit: CatalogUnit = "unit"
    unit_price: int = Field(ge=0)  # EUR cents
    tax_rate: Decimal = Field(default=Decimal("23.00"), ge=0, le=100)
    billing_type: BillingType = "one_time"


class CatalogItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    category: str | None = Field(default=None, max_length=100)
    unit: CatalogUnit | None = None
    unit_price: int | None = Field(default=None, ge=0)
    tax_rate: Decimal | None = Field(default=None, ge=0, le=100)
    billing_type: BillingType | None = None


class CatalogItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    category: str | None
    unit: str
    unit_price: int
    tax_rate: Decimal
    billing_type: str
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_catalog.py -k catalog_create -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/catalog.py backend/tests/test_catalog.py
git commit -m "feat(catalog): add catalog schemas"
```

## Task 4: Catalog repository

**Files:**
- Create: `backend/app/repositories/catalog.py`
- Test: `backend/tests/test_catalog.py`

**Interfaces:**
- Consumes: `CatalogItem`.
- Produces: `list_items(db, *, q, category, billing_type, include_archived, sort, page, page_size) -> tuple[list[CatalogItem], int]`, `get(db, item_id) -> CatalogItem | None`.

- [ ] **Step 1: Write the failing test**

```python
# append to backend/tests/test_catalog.py
from app.repositories import catalog as catalog_repo


def test_list_items_filters_and_search(db_session):
    db_session.add_all([
        CatalogItem(name="Website institucional", unit="fixed", unit_price=500000, billing_type="one_time", category="web"),
        CatalogItem(name="Manutenção mensal", unit="month", unit_price=20000, billing_type="monthly", category="ops"),
    ])
    db_session.flush()
    rows, total = catalog_repo.list_items(
        db_session, q="website", category=None, billing_type=None,
        include_archived=False, sort="name", page=1, page_size=20,
    )
    assert total == 1 and rows[0].name.startswith("Website")

    rows, total = catalog_repo.list_items(
        db_session, q=None, category=None, billing_type="monthly",
        include_archived=False, sort="name", page=1, page_size=20,
    )
    assert total == 1 and rows[0].billing_type == "monthly"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_catalog.py -k list_items -v`
Expected: FAIL (`ModuleNotFoundError: No module named 'app.repositories.catalog'`)

- [ ] **Step 3: Create the repository**

```python
# backend/app/repositories/catalog.py
"""Catalog data-access layer. Services call these; routes never touch the ORM."""

from __future__ import annotations

import uuid

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from app.models.catalog import CatalogItem


def get(db: Session, item_id: uuid.UUID) -> CatalogItem | None:
    return db.get(CatalogItem, item_id)


def _sort(sort: str):
    mapping = {
        "name": CatalogItem.name.asc(),
        "-name": CatalogItem.name.desc(),
        "created_at": CatalogItem.created_at.asc(),
        "-created_at": CatalogItem.created_at.desc(),
        "unit_price": CatalogItem.unit_price.asc(),
        "-unit_price": CatalogItem.unit_price.desc(),
    }
    return mapping.get(sort, CatalogItem.name.asc())


def _paginate(db: Session, stmt: Select, *, page: int, page_size: int):
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(db.execute(stmt.limit(page_size).offset((page - 1) * page_size)).scalars())
    return rows, total


def list_items(
    db: Session,
    *,
    q: str | None,
    category: str | None,
    billing_type: str | None,
    include_archived: bool,
    sort: str,
    page: int,
    page_size: int,
) -> tuple[list[CatalogItem], int]:
    stmt = select(CatalogItem)
    if not include_archived:
        stmt = stmt.where(CatalogItem.archived_at.is_(None))
    if category:
        stmt = stmt.where(CatalogItem.category == category)
    if billing_type:
        stmt = stmt.where(CatalogItem.billing_type == billing_type)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(CatalogItem.name.ilike(like), CatalogItem.category.ilike(like)))
    stmt = stmt.order_by(_sort(sort))
    return _paginate(db, stmt, page=page, page_size=page_size)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_catalog.py -k list_items -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/repositories/catalog.py backend/tests/test_catalog.py
git commit -m "feat(catalog): add catalog repository"
```

## Task 5: Catalog service

**Files:**
- Create: `backend/app/services/catalog_service.py`
- Test: `backend/tests/test_catalog.py`

**Interfaces:**
- Consumes: `catalog_repo`, `CatalogItemCreate/Update`, `errors`, `User`.
- Produces: `list_items(db, user, **filters)`, `get_or_404(db, item_id) -> CatalogItem`, `create_item(db, user, payload)`, `update_item(db, user, item_id, payload)`, `archive_item(db, user, item_id)`, `restore_item(db, user, item_id)`.

- [ ] **Step 1: Write the failing test**

```python
# append to backend/tests/test_catalog.py
from app.core import errors
from app.schemas.catalog import CatalogItemCreate as _CIC
from app.services import catalog_service


def test_service_create_and_get(db_session, gestor_user):
    item = catalog_service.create_item(
        db_session, gestor_user,
        _CIC(name="Consultoria", unit="hour", unit_price=8000, billing_type="one_time"),
    )
    assert catalog_service.get_or_404(db_session, item.id).name == "Consultoria"


def test_service_get_missing_raises(db_session):
    import uuid
    with pytest.raises(errors.NotFoundError):
        catalog_service.get_or_404(db_session, uuid.uuid4())
```

> Fixtures `gestor_user` (a `User` with role gestor) — reuse whatever `test_proposals.py` uses to build an acting user; match its name. `errors.NotFoundError` — confirm the exact class name in `backend/app/core/errors.py` and use it consistently.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_catalog.py -k service_ -v`
Expected: FAIL (`ModuleNotFoundError: No module named 'app.services.catalog_service'`)

- [ ] **Step 3: Create the service**

```python
# backend/app/services/catalog_service.py
"""Catalog business logic. Writes are Gestor+ (enforced at the route)."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.core import errors
from app.models.catalog import CatalogItem
from app.models.user import User
from app.repositories import catalog as catalog_repo
from app.schemas.catalog import CatalogItemCreate, CatalogItemUpdate


def get_or_404(db: Session, item_id: uuid.UUID) -> CatalogItem:
    item = catalog_repo.get(db, item_id)
    if item is None:
        raise errors.NotFoundError("Catalog item not found")
    return item


def list_items(db: Session, user: User, **filters):
    return catalog_repo.list_items(db, **filters)


def create_item(db: Session, user: User, payload: CatalogItemCreate) -> CatalogItem:
    item = CatalogItem(created_by=user.id, **payload.model_dump())
    db.add(item)
    db.flush()
    return item


def update_item(db: Session, user: User, item_id: uuid.UUID, payload: CatalogItemUpdate) -> CatalogItem:
    item = get_or_404(db, item_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.flush()
    return item


def archive_item(db: Session, user: User, item_id: uuid.UUID) -> CatalogItem:
    from datetime import UTC, datetime

    item = get_or_404(db, item_id)
    item.archived_at = datetime.now(UTC)
    db.flush()
    return item


def restore_item(db: Session, user: User, item_id: uuid.UUID) -> CatalogItem:
    item = get_or_404(db, item_id)
    item.archived_at = None
    db.flush()
    return item
```

> Check `app/core/errors.py` for the actual not-found exception (it may be `NotFoundError`, `ResourceNotFound`, or a factory). Use the real one; update the test import to match.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_catalog.py -k service_ -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/catalog_service.py backend/tests/test_catalog.py
git commit -m "feat(catalog): add catalog service"
```

## Task 6: Catalog routes + registration

**Files:**
- Create: `backend/app/api/routes/catalog.py`
- Modify: `backend/app/api/router.py`
- Test: `backend/tests/test_catalog.py`

**Interfaces:**
- Produces HTTP: `GET/POST /catalog-items`, `GET/PATCH /catalog-items/{id}`, `POST /catalog-items/{id}/archive`, `POST /catalog-items/{id}/restore`.

- [ ] **Step 1: Write the failing test**

```python
# append to backend/tests/test_catalog.py
def test_create_and_list_via_api(gestor_client):
    r = gestor_client.post("/api/v1/catalog-items", json={
        "name": "Website", "unit": "fixed", "unit_price": 500000, "billing_type": "one_time",
    })
    assert r.status_code == 201, r.text
    r = gestor_client.get("/api/v1/catalog-items?q=web")
    assert r.status_code == 200
    assert r.json()["total"] >= 1


def test_membro_cannot_create(membro_client):
    r = membro_client.post("/api/v1/catalog-items", json={
        "name": "x", "unit": "unit", "unit_price": 1, "billing_type": "one_time",
    })
    assert r.status_code == 403
```

> `gestor_client` / `membro_client` — authenticated `TestClient` fixtures used in `test_proposals.py`. Match their exact names; if only one exists, follow its pattern to build the roles you need.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_catalog.py -k via_api -v`
Expected: FAIL (404 — route not registered)

- [ ] **Step 3: Create the routes**

```python
# backend/app/api/routes/catalog.py
"""Catalog routes. Reads: any authenticated user. Writes: Gestor+."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser, RequireGestor
from app.database.session import get_db
from app.schemas.catalog import (
    BillingType,
    CatalogItemCreate,
    CatalogItemResponse,
    CatalogItemUpdate,
)
from app.schemas.common import Page
from app.services import catalog_service

router = APIRouter()
DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=Page[CatalogItemResponse])
def list_catalog_items(
    user: CurrentUser,
    db: DbSession,
    q: Annotated[str | None, Query(min_length=1, max_length=255)] = None,
    category: str | None = None,
    billing_type: Annotated[BillingType | None, Query()] = None,
    include_archived: bool = False,
    sort: Annotated[str, Query(pattern="^-?(name|created_at|unit_price)$")] = "name",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Page[CatalogItemResponse]:
    items, total = catalog_service.list_items(
        db, user, q=q, category=category, billing_type=billing_type,
        include_archived=include_archived, sort=sort, page=page, page_size=page_size,
    )
    return Page(
        items=[CatalogItemResponse.model_validate(i) for i in items],
        total=total, page=page, page_size=page_size,
    )


@router.post("", response_model=CatalogItemResponse, status_code=status.HTTP_201_CREATED)
def create_catalog_item(payload: CatalogItemCreate, user: RequireGestor, db: DbSession) -> CatalogItemResponse:
    return CatalogItemResponse.model_validate(catalog_service.create_item(db, user, payload))


@router.get("/{item_id}", response_model=CatalogItemResponse)
def get_catalog_item(item_id: uuid.UUID, user: CurrentUser, db: DbSession) -> CatalogItemResponse:
    return CatalogItemResponse.model_validate(catalog_service.get_or_404(db, item_id))


@router.patch("/{item_id}", response_model=CatalogItemResponse)
def update_catalog_item(item_id: uuid.UUID, payload: CatalogItemUpdate, user: RequireGestor, db: DbSession) -> CatalogItemResponse:
    return CatalogItemResponse.model_validate(catalog_service.update_item(db, user, item_id, payload))


@router.post("/{item_id}/archive", response_model=CatalogItemResponse)
def archive_catalog_item(item_id: uuid.UUID, user: RequireGestor, db: DbSession) -> CatalogItemResponse:
    return CatalogItemResponse.model_validate(catalog_service.archive_item(db, user, item_id))


@router.post("/{item_id}/restore", response_model=CatalogItemResponse)
def restore_catalog_item(item_id: uuid.UUID, user: RequireGestor, db: DbSession) -> CatalogItemResponse:
    return CatalogItemResponse.model_validate(catalog_service.restore_item(db, user, item_id))
```

In `backend/app/api/router.py` import `catalog` alongside the others and register:

```python
api_router.include_router(catalog.router, prefix="/catalog-items", tags=["catalog"])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_catalog.py -v`
Expected: PASS (all catalog tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/catalog.py backend/app/api/router.py backend/tests/test_catalog.py
git commit -m "feat(catalog): add catalog routes and register router"
```

---

# MILESTONE 2 — Totals math, placeholders, and Proposal Templates

## Task 7: Pure totals module

**Files:**
- Create: `backend/app/services/proposal_totals.py`
- Test: `backend/tests/test_proposal_totals.py`

**Interfaces:**
- Produces: `LineInput` (dataclass: `quantity: Decimal`, `unit_price: int`, `tax_rate: Decimal`, `billing_type: str`), `GroupTotal` (dataclass: `net: int`, `tax: int`, `gross: int`), `Totals` (dataclass: `one_time: GroupTotal`, `monthly: GroupTotal`, `annual: GroupTotal`, `value: int`), and `compute_totals(lines: list[LineInput], *, discount_bps: int = 0) -> Totals`.
- Rule: `value = one_time.net` (one-time net after discount, excl. IVA) — the number persisted to `proposals.value`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_proposal_totals.py
from decimal import Decimal

from app.services.proposal_totals import LineInput, compute_totals


def L(qty, price, tax, billing):
    return LineInput(quantity=Decimal(str(qty)), unit_price=price, tax_rate=Decimal(str(tax)), billing_type=billing)


def test_single_one_time_line_no_discount():
    t = compute_totals([L(2, 10000, 23, "one_time")])
    assert t.one_time.net == 20000
    assert t.one_time.tax == 4600
    assert t.one_time.gross == 24600
    assert t.value == 20000  # persisted proposals.value = one-time net


def test_mixed_billing_groups_are_separate():
    t = compute_totals([
        L(1, 500000, 23, "one_time"),
        L(1, 20000, 23, "monthly"),
        L(1, 120000, 6, "annual"),
    ])
    assert t.one_time.net == 500000
    assert t.monthly.net == 20000
    assert t.annual.net == 120000
    assert t.value == 500000


def test_discount_applies_to_net_before_tax_proportionally():
    # 10% discount (1000 bps) on a single one-time line
    t = compute_totals([L(1, 100000, 23, "one_time")], discount_bps=1000)
    assert t.one_time.net == 90000
    assert t.one_time.tax == 20700  # 23% of 90000
    assert t.value == 90000


def test_rounding_is_per_line_half_up():
    # 3 units @ 333c, tax 23% -> net 999, tax round(999*0.23)=round(229.77)=230
    t = compute_totals([L(3, 333, 23, "one_time")])
    assert t.one_time.net == 999
    assert t.one_time.tax == 230
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_proposal_totals.py -v`
Expected: FAIL (`ModuleNotFoundError`)

- [ ] **Step 3: Implement the module**

```python
# backend/app/services/proposal_totals.py
"""Pure proposal totals math. No DB, no I/O — unit-tested in isolation.

Money is integer EUR cents. Lines are grouped by billing_type; each group gets
its own net/tax/gross. A proposal-level discount (basis points) reduces each
line's net proportionally BEFORE tax. `Totals.value` is the one-time net total
(excl. IVA) — the number persisted to `proposals.value` so the lifecycle and
dashboard stay intact.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal


@dataclass(frozen=True)
class LineInput:
    quantity: Decimal
    unit_price: int  # EUR cents
    tax_rate: Decimal  # percent
    billing_type: str  # one_time | monthly | annual


@dataclass(frozen=True)
class GroupTotal:
    net: int = 0
    tax: int = 0
    gross: int = 0


@dataclass(frozen=True)
class Totals:
    one_time: GroupTotal = field(default_factory=GroupTotal)
    monthly: GroupTotal = field(default_factory=GroupTotal)
    annual: GroupTotal = field(default_factory=GroupTotal)
    value: int = 0


def _round(value: Decimal) -> int:
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def compute_totals(lines: list[LineInput], *, discount_bps: int = 0) -> Totals:
    factor = (Decimal(10000) - Decimal(discount_bps)) / Decimal(10000)
    buckets: dict[str, list[int]] = {"one_time": [0, 0], "monthly": [0, 0], "annual": [0, 0]}
    for line in lines:
        raw_net = Decimal(line.quantity) * Decimal(line.unit_price)
        net = _round(raw_net * factor)
        tax = _round(Decimal(net) * line.tax_rate / Decimal(100))
        bucket = buckets.get(line.billing_type)
        if bucket is None:
            continue
        bucket[0] += net
        bucket[1] += tax

    def group(key: str) -> GroupTotal:
        net, tax = buckets[key]
        return GroupTotal(net=net, tax=tax, gross=net + tax)

    one_time, monthly, annual = group("one_time"), group("monthly"), group("annual")
    return Totals(one_time=one_time, monthly=monthly, annual=annual, value=one_time.net)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_proposal_totals.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/proposal_totals.py backend/tests/test_proposal_totals.py
git commit -m "feat(proposals): pure totals math grouped by billing type"
```

## Task 8: Pure placeholder resolver

**Files:**
- Create: `backend/app/services/proposal_placeholders.py`
- Test: `backend/tests/test_proposal_placeholders.py`

**Interfaces:**
- Produces: `resolve(text: str, context: dict[str, str | None]) -> str`. Supported keys: `cliente`, `empresa`, `data`, `validade`, `referencia`. Unknown placeholders and those with `None`/missing context values are left verbatim (`{{empresa}}`).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_proposal_placeholders.py
from app.services.proposal_placeholders import resolve


def test_resolves_known_keys():
    out = resolve("Olá {{cliente}} da {{empresa}}", {"cliente": "Ana", "empresa": "ACME"})
    assert out == "Olá Ana da ACME"


def test_missing_value_left_verbatim():
    out = resolve("Para {{empresa}}", {"empresa": None})
    assert out == "Para {{empresa}}"


def test_unknown_placeholder_left_verbatim():
    out = resolve("{{desconhecido}}", {"cliente": "Ana"})
    assert out == "{{desconhecido}}"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_proposal_placeholders.py -v`
Expected: FAIL (`ModuleNotFoundError`)

- [ ] **Step 3: Implement the resolver**

```python
# backend/app/services/proposal_placeholders.py
"""Pure placeholder resolution for proposal sections & terms.

`{{key}}` tokens are replaced from the given context. Only known keys with a
non-None value are substituted; everything else is left verbatim so a missing
company shows `{{empresa}}` rather than a blank or the string "None".
"""

from __future__ import annotations

import re

_ALLOWED = ("cliente", "empresa", "data", "validade", "referencia")
_TOKEN = re.compile(r"\{\{\s*(\w+)\s*\}\}")


def resolve(text: str, context: dict[str, str | None]) -> str:
    def replace(match: re.Match[str]) -> str:
        key = match.group(1)
        if key in _ALLOWED and context.get(key):
            return str(context[key])
        return match.group(0)

    return _TOKEN.sub(replace, text or "")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_proposal_placeholders.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/proposal_placeholders.py backend/tests/test_proposal_placeholders.py
git commit -m "feat(proposals): pure placeholder resolver"
```

## Task 9: Proposal-template models + migration

**Files:**
- Create: `backend/app/models/proposal_content.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/alembic/versions/<rev>_add_proposal_templates.py`
- Test: `backend/tests/test_proposal_templates.py`

**Interfaces:**
- Produces: `ProposalTemplate` (`proposal_templates`), `ProposalTemplateSection` (`proposal_template_sections`), `ProposalTemplateItem` (`proposal_template_items`). This task defines ONLY the template tables; proposal-side tables (`proposal_sections`, `proposal_items`) are added in Task 12 in the same module.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_proposal_templates.py
from decimal import Decimal

from app.models.proposal_content import (
    ProposalTemplate,
    ProposalTemplateItem,
    ProposalTemplateSection,
)


def test_template_with_children_persists(db_session):
    tpl = ProposalTemplate(name="Website + Manutenção", default_validity_days=30, default_discount_bps=0, terms="Pagamento a 30 dias.")
    tpl.sections = [ProposalTemplateSection(position=0, heading="Introdução", body="Olá {{cliente}}")]
    tpl.items = [ProposalTemplateItem(position=0, name="Website", unit="fixed", unit_price=500000, tax_rate=Decimal("23.00"), billing_type="one_time", quantity=Decimal("1"))]
    db_session.add(tpl)
    db_session.flush()
    assert tpl.id is not None
    assert tpl.sections[0].heading == "Introdução"
    assert tpl.items[0].unit_price == 500000
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_proposal_templates.py -k with_children -v`
Expected: FAIL (`ModuleNotFoundError: No module named 'app.models.proposal_content'`)

- [ ] **Step 3: Create the models**

```python
# backend/app/models/proposal_content.py
"""Proposal templates and proposal structured content.

Templates are editable master data. Proposals SNAPSHOT (deep-copy) template
sections/items at instantiation, so editing a template never mutates existing
proposals. Proposal-side tables (ProposalSection/ProposalItem) are added in a
later task in this same module.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import ArchiveMixin, AuditBase
from app.models import enums


class ProposalTemplate(AuditBase, ArchiveMixin):
    __tablename__ = "proposal_templates"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    default_validity_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    default_discount_bps: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    terms: Mapped[str | None] = mapped_column(Text, nullable=True)

    sections: Mapped[list[ProposalTemplateSection]] = relationship(
        back_populates="template",
        cascade="all, delete-orphan",
        order_by="ProposalTemplateSection.position",
    )
    items: Mapped[list[ProposalTemplateItem]] = relationship(
        back_populates="template",
        cascade="all, delete-orphan",
        order_by="ProposalTemplateItem.position",
    )


class ProposalTemplateSection(AuditBase):
    __tablename__ = "proposal_template_sections"

    template_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("proposal_templates.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    heading: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")

    template: Mapped[ProposalTemplate] = relationship(back_populates="sections")


class ProposalTemplateItem(AuditBase):
    __tablename__ = "proposal_template_items"

    template_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("proposal_templates.id", ondelete="CASCADE"), index=True
    )
    catalog_item_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("catalog_items.id", ondelete="SET NULL"), nullable=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    unit: Mapped[str] = mapped_column(
        Enum(*enums.CATALOG_UNITS, name="catalog_unit", native_enum=False, create_constraint=False),
        nullable=False, default="unit",
    )
    unit_price: Mapped[int] = mapped_column(BigInteger, nullable=False)
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal("23.00"))
    billing_type: Mapped[str] = mapped_column(
        Enum(*enums.BILLING_TYPES, name="billing_type", native_enum=False, create_constraint=False),
        nullable=False, default="one_time",
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("1"))

    template: Mapped[ProposalTemplate] = relationship(back_populates="items")
```

> `create_constraint=False` on the reused enum names avoids a duplicate CHECK-constraint name clash with `catalog_items`. Verify the generated migration does not try to recreate the same named CHECK; if it does, drop the duplicate from the migration.

Add to `backend/app/models/__init__.py`:

```python
from app.models.proposal_content import (  # noqa: F401
    ProposalTemplate,
    ProposalTemplateItem,
    ProposalTemplateSection,
)
```

- [ ] **Step 4: Generate + review + apply the migration**

Run: `cd backend && uv run alembic revision --autogenerate -m "add proposal_templates"`
Review: three tables, FK cascade on children, indexes on `template_id`. Then:
Run: `cd backend && uv run alembic upgrade head && uv run pytest tests/test_proposal_templates.py -k with_children -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/proposal_content.py backend/app/models/__init__.py backend/alembic/versions/ backend/tests/test_proposal_templates.py
git commit -m "feat(proposals): proposal template models and migration"
```

## Task 10: Proposal-template schemas

**Files:**
- Create: `backend/app/schemas/proposal_templates.py`
- Test: `backend/tests/test_proposal_templates.py`

**Interfaces:**
- Produces: `SectionInput` (`heading`, `body`), `ItemInput` (`catalog_item_id: uuid|None`, `name`, `unit`, `unit_price`, `tax_rate`, `billing_type`, `quantity: Decimal`), `ProposalTemplateCreate` (`name`, `description`, `default_validity_days`, `default_discount_bps`, `terms`, `sections: list[SectionInput]`, `items: list[ItemInput]`), `ProposalTemplateUpdate` (all optional; provided `sections`/`items` **replace** the collection), `ProposalTemplateResponse` (+ nested `sections`/`items` with ids + a computed `totals` block).

- [ ] **Step 1: Write the failing test**

```python
# append to backend/tests/test_proposal_templates.py
from decimal import Decimal as D

from app.schemas.proposal_templates import ItemInput, ProposalTemplateCreate


def test_template_create_schema_accepts_children():
    payload = ProposalTemplateCreate(
        name="T", default_discount_bps=0,
        sections=[{"heading": "Intro", "body": "x"}],
        items=[ItemInput(name="Website", unit="fixed", unit_price=500000, tax_rate=D("23.00"), billing_type="one_time", quantity=D("1"))],
    )
    assert payload.items[0].unit_price == 500000
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_proposal_templates.py -k create_schema -v`
Expected: FAIL (`ModuleNotFoundError`)

- [ ] **Step 3: Create the schemas**

```python
# backend/app/schemas/proposal_templates.py
"""Schemas for proposal templates. Nested sections/items are replace-on-save."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.catalog import BillingType, CatalogUnit


class SectionInput(BaseModel):
    heading: str = Field(min_length=1, max_length=200)
    body: str = ""


class ItemInput(BaseModel):
    catalog_item_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=200)
    unit: CatalogUnit = "unit"
    unit_price: int = Field(ge=0)
    tax_rate: Decimal = Field(default=Decimal("23.00"), ge=0, le=100)
    billing_type: BillingType = "one_time"
    quantity: Decimal = Field(default=Decimal("1"), gt=0)


class ProposalTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    default_validity_days: int | None = Field(default=None, ge=0)
    default_discount_bps: int = Field(default=0, ge=0, le=10000)
    terms: str | None = None
    sections: list[SectionInput] = Field(default_factory=list)
    items: list[ItemInput] = Field(default_factory=list)


class ProposalTemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    default_validity_days: int | None = Field(default=None, ge=0)
    default_discount_bps: int | None = Field(default=None, ge=0, le=10000)
    terms: str | None = None
    sections: list[SectionInput] | None = None
    items: list[ItemInput] | None = None


class SectionResponse(SectionInput):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    position: int


class ItemResponse(ItemInput):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    position: int


class GroupTotalResponse(BaseModel):
    net: int
    tax: int
    gross: int


class TotalsResponse(BaseModel):
    one_time: GroupTotalResponse
    monthly: GroupTotalResponse
    annual: GroupTotalResponse
    value: int


class ProposalTemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    description: str | None
    default_validity_days: int | None
    default_discount_bps: int
    terms: str | None
    sections: list[SectionResponse]
    items: list[ItemResponse]
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime
    totals: TotalsResponse
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_proposal_templates.py -k create_schema -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/proposal_templates.py backend/tests/test_proposal_templates.py
git commit -m "feat(proposals): proposal template schemas"
```

## Task 11: Proposal-template repository, service, routes

**Files:**
- Create: `backend/app/repositories/proposal_templates.py`, `backend/app/services/proposal_template_service.py`, `backend/app/api/routes/proposal_templates.py`
- Modify: `backend/app/api/router.py`
- Test: `backend/tests/test_proposal_templates.py`

**Interfaces:**
- Consumes: `proposal_totals.compute_totals`, `ProposalTemplate*` models/schemas.
- Produces service fns: `list_templates`, `get_or_404`, `create_template`, `update_template`, `archive_template`, `restore_template`; a helper `template_totals(tpl) -> proposal_totals.Totals`; and a **response builder** `to_response(tpl) -> ProposalTemplateResponse` that attaches computed `totals`.
- Produces HTTP: `GET/POST /proposal-templates`, `GET/PATCH /proposal-templates/{id}`, `POST /proposal-templates/{id}/archive`, `POST /proposal-templates/{id}/restore`.

- [ ] **Step 1: Write the failing test**

```python
# append to backend/tests/test_proposal_templates.py
def test_template_api_roundtrip_with_totals(gestor_client):
    body = {
        "name": "Website + Manutenção",
        "default_discount_bps": 0,
        "sections": [{"heading": "Intro", "body": "Olá {{cliente}}"}],
        "items": [
            {"name": "Website", "unit": "fixed", "unit_price": 500000, "tax_rate": "23.00", "billing_type": "one_time", "quantity": "1"},
            {"name": "Manutenção", "unit": "month", "unit_price": 20000, "tax_rate": "23.00", "billing_type": "monthly", "quantity": "1"},
        ],
    }
    r = gestor_client.post("/api/v1/proposal-templates", json=body)
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["totals"]["oneTime"]["net"] == 500000 or data["totals"]["one_time"]["net"] == 500000
    assert len(data["sections"]) == 1 and len(data["items"]) == 2


def test_template_update_replaces_items(gestor_client):
    r = gestor_client.post("/api/v1/proposal-templates", json={"name": "T", "default_discount_bps": 0, "items": [{"name": "A", "unit": "unit", "unit_price": 1000, "tax_rate": "23.00", "billing_type": "one_time", "quantity": "1"}]})
    tid = r.json()["id"]
    r = gestor_client.patch(f"/api/v1/proposal-templates/{tid}", json={"items": []})
    assert r.status_code == 200
    assert r.json()["items"] == []
```

> The API case-maps snake→camel at the client, but the backend `TestClient` sees raw JSON. Assert on the raw backend field names (`one_time`). Keep whichever branch is true; delete the other once you confirm the serialized key.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_proposal_templates.py -k api_roundtrip -v`
Expected: FAIL (404 — routes not registered)

- [ ] **Step 3: Implement repository**

```python
# backend/app/repositories/proposal_templates.py
from __future__ import annotations

import uuid

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.proposal_content import ProposalTemplate


def get(db: Session, template_id: uuid.UUID) -> ProposalTemplate | None:
    return db.scalar(
        select(ProposalTemplate)
        .where(ProposalTemplate.id == template_id)
        .options(selectinload(ProposalTemplate.sections), selectinload(ProposalTemplate.items))
    )


def _paginate(db: Session, stmt: Select, *, page: int, page_size: int):
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(db.execute(stmt.limit(page_size).offset((page - 1) * page_size)).scalars())
    return rows, total


def list_templates(db: Session, *, q, include_archived, page, page_size):
    stmt = select(ProposalTemplate).options(
        selectinload(ProposalTemplate.sections), selectinload(ProposalTemplate.items)
    )
    if not include_archived:
        stmt = stmt.where(ProposalTemplate.archived_at.is_(None))
    if q:
        stmt = stmt.where(or_(ProposalTemplate.name.ilike(f"%{q}%")))
    stmt = stmt.order_by(ProposalTemplate.name.asc())
    return _paginate(db, stmt, page=page, page_size=page_size)
```

- [ ] **Step 4: Implement service**

```python
# backend/app/services/proposal_template_service.py
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core import errors
from app.models.proposal_content import (
    ProposalTemplate,
    ProposalTemplateItem,
    ProposalTemplateSection,
)
from app.models.user import User
from app.repositories import proposal_templates as tpl_repo
from app.schemas.proposal_templates import (
    ProposalTemplateCreate,
    ProposalTemplateResponse,
    ProposalTemplateUpdate,
)
from app.services import proposal_totals


def get_or_404(db: Session, template_id: uuid.UUID) -> ProposalTemplate:
    tpl = tpl_repo.get(db, template_id)
    if tpl is None:
        raise errors.NotFoundError("Proposal template not found")
    return tpl


def template_totals(tpl: ProposalTemplate) -> proposal_totals.Totals:
    lines = [
        proposal_totals.LineInput(
            quantity=Decimal(it.quantity), unit_price=it.unit_price,
            tax_rate=Decimal(it.tax_rate), billing_type=it.billing_type,
        )
        for it in tpl.items
    ]
    return proposal_totals.compute_totals(lines, discount_bps=tpl.default_discount_bps)


def to_response(tpl: ProposalTemplate) -> ProposalTemplateResponse:
    t = template_totals(tpl)
    data = ProposalTemplateResponse.model_validate(tpl).model_copy(update={"totals": {
        "one_time": t.one_time.__dict__, "monthly": t.monthly.__dict__,
        "annual": t.annual.__dict__, "value": t.value,
    }})
    return data


def _apply_children(tpl: ProposalTemplate, payload) -> None:
    if payload.sections is not None:
        tpl.sections = [
            ProposalTemplateSection(position=i, heading=s.heading, body=s.body)
            for i, s in enumerate(payload.sections)
        ]
    if payload.items is not None:
        tpl.items = [
            ProposalTemplateItem(
                position=i, catalog_item_id=it.catalog_item_id, name=it.name,
                unit=it.unit, unit_price=it.unit_price, tax_rate=it.tax_rate,
                billing_type=it.billing_type, quantity=it.quantity,
            )
            for i, it in enumerate(payload.items)
        ]


def create_template(db: Session, user: User, payload: ProposalTemplateCreate) -> ProposalTemplate:
    tpl = ProposalTemplate(
        created_by=user.id, name=payload.name, description=payload.description,
        default_validity_days=payload.default_validity_days,
        default_discount_bps=payload.default_discount_bps, terms=payload.terms,
    )
    _apply_children(tpl, payload)
    db.add(tpl)
    db.flush()
    return get_or_404(db, tpl.id)


def update_template(db: Session, user: User, template_id: uuid.UUID, payload: ProposalTemplateUpdate) -> ProposalTemplate:
    tpl = get_or_404(db, template_id)
    for field in ("name", "description", "default_validity_days", "default_discount_bps", "terms"):
        value = getattr(payload, field)
        if value is not None:
            setattr(tpl, field, value)
    _apply_children(tpl, payload)
    db.flush()
    return get_or_404(db, template_id)


def archive_template(db: Session, user: User, template_id: uuid.UUID) -> ProposalTemplate:
    tpl = get_or_404(db, template_id)
    tpl.archived_at = datetime.now(UTC)
    db.flush()
    return tpl


def restore_template(db: Session, user: User, template_id: uuid.UUID) -> ProposalTemplate:
    tpl = get_or_404(db, template_id)
    tpl.archived_at = None
    db.flush()
    return tpl


def list_templates(db: Session, user: User, **filters):
    return tpl_repo.list_templates(db, **filters)
```

> If `ProposalTemplateResponse.model_validate(tpl)` fails because `totals` is required and absent, make `totals` optional in the schema with a default, OR construct the response dict fully here. Pick one and keep the schema/service consistent.

- [ ] **Step 5: Implement routes + register**

```python
# backend/app/api/routes/proposal_templates.py
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import CurrentUser, RequireGestor
from app.database.session import get_db
from app.schemas.common import Page
from app.schemas.proposal_templates import (
    ProposalTemplateCreate,
    ProposalTemplateResponse,
    ProposalTemplateUpdate,
)
from app.services import proposal_template_service as svc

router = APIRouter()
DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=Page[ProposalTemplateResponse])
def list_templates(
    user: CurrentUser, db: DbSession,
    q: Annotated[str | None, Query(min_length=1, max_length=255)] = None,
    include_archived: bool = False,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Page[ProposalTemplateResponse]:
    rows, total = svc.list_templates(db, user, q=q, include_archived=include_archived, page=page, page_size=page_size)
    return Page(items=[svc.to_response(t) for t in rows], total=total, page=page, page_size=page_size)


@router.post("", response_model=ProposalTemplateResponse, status_code=status.HTTP_201_CREATED)
def create_template(payload: ProposalTemplateCreate, user: RequireGestor, db: DbSession) -> ProposalTemplateResponse:
    return svc.to_response(svc.create_template(db, user, payload))


@router.get("/{template_id}", response_model=ProposalTemplateResponse)
def get_template(template_id: uuid.UUID, user: CurrentUser, db: DbSession) -> ProposalTemplateResponse:
    return svc.to_response(svc.get_or_404(db, template_id))


@router.patch("/{template_id}", response_model=ProposalTemplateResponse)
def update_template(template_id: uuid.UUID, payload: ProposalTemplateUpdate, user: RequireGestor, db: DbSession) -> ProposalTemplateResponse:
    return svc.to_response(svc.update_template(db, user, template_id, payload))


@router.post("/{template_id}/archive", response_model=ProposalTemplateResponse)
def archive_template(template_id: uuid.UUID, user: RequireGestor, db: DbSession) -> ProposalTemplateResponse:
    return svc.to_response(svc.archive_template(db, user, template_id))


@router.post("/{template_id}/restore", response_model=ProposalTemplateResponse)
def restore_template(template_id: uuid.UUID, user: RequireGestor, db: DbSession) -> ProposalTemplateResponse:
    return svc.to_response(svc.restore_template(db, user, template_id))
```

Register in `backend/app/api/router.py`:

```python
api_router.include_router(proposal_templates.router, prefix="/proposal-templates", tags=["proposals"])
```

- [ ] **Step 6: Run tests to verify pass**

Run: `cd backend && uv run pytest tests/test_proposal_templates.py -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/repositories/proposal_templates.py backend/app/services/proposal_template_service.py backend/app/api/routes/proposal_templates.py backend/app/api/router.py backend/tests/test_proposal_templates.py
git commit -m "feat(proposals): proposal template repo, service, routes"
```

---

# MILESTONE 3 — Proposal structured content, instantiation, preview

## Task 12: Proposal content tables + column additions + migration

**Files:**
- Modify: `backend/app/models/proposal_content.py` (add `ProposalSection`, `ProposalItem`)
- Modify: `backend/app/models/crm.py` (add `template_id`, `discount_bps`, `terms`, relationships to `Proposal`)
- Modify: `backend/app/models/__init__.py`
- Create: `backend/alembic/versions/<rev>_add_proposal_content.py`
- Test: `backend/tests/test_proposal_content.py`

**Interfaces:**
- Produces: `ProposalSection` (`proposal_sections`), `ProposalItem` (`proposal_items`) — same columns as the template children but FK → `proposals`, plus `catalog_item_id` (SET NULL) for traceability. `Proposal.template_id`, `Proposal.discount_bps`, `Proposal.terms`, `Proposal.sections`, `Proposal.items` relationships.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_proposal_content.py
from decimal import Decimal

from app.models.crm import Proposal
from app.models.proposal_content import ProposalItem, ProposalSection


def test_proposal_content_persists(db_session):
    p = Proposal(reference="PROP-TEST-1", status="draft", discount_bps=0)
    p.sections = [ProposalSection(position=0, heading="Intro", body="Olá Ana")]
    p.items = [ProposalItem(position=0, name="Website", unit="fixed", unit_price=500000, tax_rate=Decimal("23.00"), billing_type="one_time", quantity=Decimal("1"))]
    db_session.add(p)
    db_session.flush()
    assert p.items[0].unit_price == 500000
    assert p.sections[0].heading == "Intro"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_proposal_content.py::test_proposal_content_persists -v`
Expected: FAIL (`AttributeError`/`ImportError` — `ProposalSection` not defined / `Proposal.discount_bps` missing)

- [ ] **Step 3: Add the proposal-side models**

Append to `backend/app/models/proposal_content.py`:

```python
class ProposalSection(AuditBase):
    __tablename__ = "proposal_sections"

    proposal_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("proposals.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    heading: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")

    proposal = relationship("Proposal", back_populates="sections")


class ProposalItem(AuditBase):
    __tablename__ = "proposal_items"

    proposal_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("proposals.id", ondelete="CASCADE"), index=True
    )
    catalog_item_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("catalog_items.id", ondelete="SET NULL"), nullable=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    unit: Mapped[str] = mapped_column(
        Enum(*enums.CATALOG_UNITS, name="catalog_unit", native_enum=False, create_constraint=False),
        nullable=False, default="unit",
    )
    unit_price: Mapped[int] = mapped_column(BigInteger, nullable=False)
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal("23.00"))
    billing_type: Mapped[str] = mapped_column(
        Enum(*enums.BILLING_TYPES, name="billing_type", native_enum=False, create_constraint=False),
        nullable=False, default="one_time",
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("1"))

    proposal = relationship("Proposal", back_populates="items")
```

In `backend/app/models/crm.py`, inside `class Proposal`, add columns after `notes` and relationships at the end of the class body:

```python
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("proposal_templates.id", ondelete="SET NULL"), nullable=True
    )
    discount_bps: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    terms: Mapped[str | None] = mapped_column(Text, nullable=True)

    sections = relationship(
        "ProposalSection", back_populates="proposal",
        cascade="all, delete-orphan", order_by="ProposalSection.position",
    )
    items = relationship(
        "ProposalItem", back_populates="proposal",
        cascade="all, delete-orphan", order_by="ProposalItem.position",
    )
```

> Ensure `Integer` is imported in `crm.py` (it imports `String, Text, BigInteger, Date, ...` — add `Integer` if absent). Add the two model classes to `backend/app/models/__init__.py`.

- [ ] **Step 4: Generate + review + apply the migration**

Run: `cd backend && uv run alembic revision --autogenerate -m "add proposal_content"`
Review: new `proposal_sections`, `proposal_items` tables; three new columns on `proposals` (`template_id` FK, `discount_bps` NOT NULL default 0 → use `server_default="0"` for existing rows, then you may drop it, keeping app-level default), `terms`. Ensure the `discount_bps` add has `server_default="0"` so existing rows migrate.
Run: `cd backend && uv run alembic upgrade head && uv run pytest tests/test_proposal_content.py::test_proposal_content_persists -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/proposal_content.py backend/app/models/crm.py backend/app/models/__init__.py backend/alembic/versions/ backend/tests/test_proposal_content.py
git commit -m "feat(proposals): proposal content tables and column additions"
```

## Task 13: Content schemas + instantiation service + value recompute

**Files:**
- Modify: `backend/app/schemas/proposals.py` (add `ProposalContentInput`, `ProposalContentResponse`, `ApplyTemplateInput`)
- Modify: `backend/app/services/proposal_service.py` (add `apply_template`, `set_content`, `get_content`, `_recompute_value`)
- Test: `backend/tests/test_proposal_content.py`

**Interfaces:**
- Consumes: `proposal_totals`, `proposal_placeholders`, `proposal_template_service.get_or_404`, `ProposalTemplate*`, `ProposalSection`, `ProposalItem`.
- Produces service fns:
  - `apply_template(db, user, proposal_id, template_id) -> Proposal` — draft-only (else `errors.ConflictError`/409), deep-copies sections/items snapshotting catalog price/tax, resolves placeholders from the proposal's company/contact/dates, sets `valid_until` from `default_validity_days`, copies `terms` + `discount_bps`, records `template_id`, recomputes `value`.
  - `set_content(db, user, proposal_id, payload: ProposalContentInput) -> Proposal` — draft-only, replaces sections/items/terms/discount, recomputes `value`.
  - `get_content(db, user, proposal_id) -> ProposalContentResponse` — sections + items + computed totals.
  - `_recompute_value(proposal) -> None` — sets `proposal.value = compute_totals(...).value`.

- [ ] **Step 1: Write the failing test**

```python
# append to backend/tests/test_proposal_content.py
from datetime import date

from app.services import proposal_service
from app.services import proposal_template_service


def _make_template(db_session, user):
    from app.schemas.proposal_templates import ProposalTemplateCreate
    return proposal_template_service.create_template(db_session, user, ProposalTemplateCreate(
        name="T", default_validity_days=30, default_discount_bps=0, terms="Termos {{cliente}}",
        sections=[{"heading": "Intro", "body": "Olá {{cliente}}"}],
        items=[{"name": "Website", "unit": "fixed", "unit_price": 500000, "tax_rate": "23.00", "billing_type": "one_time", "quantity": "1"}],
    ))


def test_apply_template_snapshots_and_recomputes_value(db_session, gestor_user, company_factory):
    company = company_factory(name="ACME")
    tpl = _make_template(db_session, gestor_user)
    from app.schemas.proposals import ProposalCreate
    p = proposal_service.create_proposal(db_session, gestor_user, ProposalCreate(reference="PROP-X-1", company_id=company.id))
    p = proposal_service.apply_template(db_session, gestor_user, p.id, tpl.id)
    assert p.value == 500000                       # one-time net recomputed
    assert p.sections[0].body == "Olá ACME"        # placeholder resolved
    assert p.terms == "Termos ACME"
    assert p.valid_until is not None               # from default_validity_days

    # mutating the template afterwards does NOT change the proposal (snapshot)
    from app.schemas.proposal_templates import ProposalTemplateUpdate
    proposal_template_service.update_template(db_session, gestor_user, tpl.id, ProposalTemplateUpdate(items=[]))
    db_session.refresh(p)
    assert p.items[0].unit_price == 500000


def test_apply_template_on_non_draft_conflicts(db_session, gestor_user, sent_proposal_factory):
    tpl = _make_template(db_session, gestor_user)
    p = sent_proposal_factory()  # a proposal in 'sent' state
    import pytest
    with pytest.raises(Exception):  # replace with the concrete Conflict error class
        proposal_service.apply_template(db_session, gestor_user, p.id, tpl.id)
```

> Reuse `company_factory` / proposal factories from the existing test suite; if absent, build minimal fixtures inline (a `Company`, a draft `Proposal`). Replace the bare `Exception` with the concrete conflict error once confirmed in `errors.py` (the existing service already raises a conflict for terminal states — reuse that class).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_proposal_content.py -k apply_template -v`
Expected: FAIL (`AttributeError: module 'app.services.proposal_service' has no attribute 'apply_template'`)

- [ ] **Step 3: Add schemas**

Append to `backend/app/schemas/proposals.py`:

```python
from decimal import Decimal as _Decimal

from app.schemas.proposal_templates import (
    ItemInput as ContentItemInput,
    ItemResponse as ContentItemResponse,
    SectionInput as ContentSectionInput,
    SectionResponse as ContentSectionResponse,
    TotalsResponse as ContentTotalsResponse,
)


class ApplyTemplateInput(BaseModel):
    template_id: uuid.UUID


class ProposalContentInput(BaseModel):
    discount_bps: int = Field(default=0, ge=0, le=10000)
    terms: str | None = None
    sections: list[ContentSectionInput] = Field(default_factory=list)
    items: list[ContentItemInput] = Field(default_factory=list)


class ProposalContentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    discount_bps: int
    terms: str | None
    sections: list[ContentSectionResponse]
    items: list[ContentItemResponse]
    totals: ContentTotalsResponse
```

- [ ] **Step 4: Implement service functions**

Add to `backend/app/services/proposal_service.py` (imports at top, functions in the body). Reuse the module's existing draft/terminal guard — locate how it raises for terminal states (search `_TERMINAL_STATUSES`) and mirror it for "not draft":

```python
from decimal import Decimal

from app.models.proposal_content import ProposalItem, ProposalSection
from app.services import proposal_placeholders, proposal_totals
from app.services import proposal_template_service


def _proposal_lines(proposal) -> list[proposal_totals.LineInput]:
    return [
        proposal_totals.LineInput(
            quantity=Decimal(it.quantity), unit_price=it.unit_price,
            tax_rate=Decimal(it.tax_rate), billing_type=it.billing_type,
        )
        for it in proposal.items
    ]


def _recompute_value(proposal) -> None:
    totals = proposal_totals.compute_totals(_proposal_lines(proposal), discount_bps=proposal.discount_bps)
    proposal.value = totals.value


def _require_draft(proposal) -> None:
    if proposal.status != "draft":
        raise errors.ConflictError("Proposal content can only be edited while draft")


def _placeholder_context(db, proposal) -> dict[str, str | None]:
    company = db.get(Company, proposal.company_id) if proposal.company_id else None
    today = date.today()
    return {
        "cliente": company.name if company else None,
        "empresa": company.name if company else None,
        "data": today.strftime("%d/%m/%Y"),
        "validade": proposal.valid_until.strftime("%d/%m/%Y") if proposal.valid_until else None,
        "referencia": proposal.reference,
    }


def apply_template(db, user, proposal_id, template_id):
    proposal = get_proposal_or_404(db, user, proposal_id)
    _require_draft(proposal)
    tpl = proposal_template_service.get_or_404(db, template_id)

    proposal.template_id = tpl.id
    proposal.discount_bps = tpl.default_discount_bps
    if tpl.default_validity_days is not None:
        proposal.valid_until = date.today() + timedelta(days=tpl.default_validity_days)

    ctx = _placeholder_context(db, proposal)
    proposal.terms = proposal_placeholders.resolve(tpl.terms or "", ctx) if tpl.terms else None
    proposal.sections = [
        ProposalSection(position=s.position, heading=s.heading, body=proposal_placeholders.resolve(s.body, ctx))
        for s in tpl.sections
    ]
    proposal.items = [
        ProposalItem(
            position=it.position, catalog_item_id=it.catalog_item_id, name=it.name,
            unit=it.unit, unit_price=it.unit_price, tax_rate=it.tax_rate,
            billing_type=it.billing_type, quantity=it.quantity,
        )
        for it in tpl.items
    ]
    _recompute_value(proposal)
    db.flush()
    return get_proposal_or_404(db, user, proposal_id)


def set_content(db, user, proposal_id, payload):
    proposal = get_proposal_or_404(db, user, proposal_id)
    _require_draft(proposal)
    proposal.discount_bps = payload.discount_bps
    proposal.terms = payload.terms
    proposal.sections = [
        ProposalSection(position=i, heading=s.heading, body=s.body)
        for i, s in enumerate(payload.sections)
    ]
    proposal.items = [
        ProposalItem(
            position=i, catalog_item_id=it.catalog_item_id, name=it.name, unit=it.unit,
            unit_price=it.unit_price, tax_rate=it.tax_rate, billing_type=it.billing_type, quantity=it.quantity,
        )
        for i, it in enumerate(payload.items)
    ]
    _recompute_value(proposal)
    db.flush()
    return get_proposal_or_404(db, user, proposal_id)


def get_content(db, user, proposal_id):
    from app.schemas.proposals import ProposalContentResponse

    proposal = get_proposal_or_404(db, user, proposal_id)
    t = proposal_totals.compute_totals(_proposal_lines(proposal), discount_bps=proposal.discount_bps)
    return ProposalContentResponse.model_validate(proposal).model_copy(update={"totals": {
        "one_time": t.one_time.__dict__, "monthly": t.monthly.__dict__,
        "annual": t.annual.__dict__, "value": t.value,
    }})
```

> Confirm `timedelta` is imported (add `from datetime import timedelta`), and `errors.ConflictError` matches the real conflict class used elsewhere in this file (search the file — reuse the SAME class the terminal-state guard raises). If `ProposalContentResponse.model_validate` requires `totals`, make it optional-with-default in the schema.

- [ ] **Step 5: Run tests to verify pass**

Run: `cd backend && uv run pytest tests/test_proposal_content.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/proposals.py backend/app/services/proposal_service.py backend/tests/test_proposal_content.py
git commit -m "feat(proposals): template instantiation, content editing, value recompute"
```

## Task 14: Proposal content routes

**Files:**
- Modify: `backend/app/api/routes/proposals.py`
- Test: `backend/tests/test_proposal_content.py`

**Interfaces:**
- Produces HTTP: `POST /proposals/{id}/apply-template`, `GET /proposals/{id}/content`, `PUT /proposals/{id}/content`.

- [ ] **Step 1: Write the failing test**

```python
# append to backend/tests/test_proposal_content.py
def test_content_endpoints(gestor_client, make_template_via_api, make_company):
    company_id = make_company()
    tid = make_template_via_api()  # returns a template id via POST /proposal-templates
    r = gestor_client.post("/api/v1/proposals", json={"reference": "PROP-API-1", "company_id": company_id})
    pid = r.json()["id"]
    r = gestor_client.post(f"/api/v1/proposals/{pid}/apply-template", json={"template_id": tid})
    assert r.status_code == 200, r.text
    r = gestor_client.get(f"/api/v1/proposals/{pid}/content")
    assert r.status_code == 200
    body = r.json()
    assert len(body["items"]) >= 1
```

> Provide small helper fixtures `make_template_via_api` and `make_company` (thin wrappers over the POST endpoints) in `conftest.py` or inline in this test module.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_proposal_content.py -k content_endpoints -v`
Expected: FAIL (404)

- [ ] **Step 3: Add the routes**

Append to `backend/app/api/routes/proposals.py` (and extend the imports from `app.schemas.proposals`):

```python
from app.schemas.proposals import (
    ApplyTemplateInput,
    ProposalContentInput,
    ProposalContentResponse,
)


@router.post("/{proposal_id}/apply-template", response_model=ProposalResponse)
def apply_template(proposal_id: uuid.UUID, payload: ApplyTemplateInput, user: RequireGestor, db: DbSession) -> ProposalResponse:
    proposal = proposal_service.apply_template(db, user, proposal_id, payload.template_id)
    return ProposalResponse.model_validate(proposal)


@router.get("/{proposal_id}/content", response_model=ProposalContentResponse)
def get_content(proposal_id: uuid.UUID, user: CurrentUser, db: DbSession) -> ProposalContentResponse:
    return proposal_service.get_content(db, user, proposal_id)


@router.put("/{proposal_id}/content", response_model=ProposalContentResponse)
def set_content(proposal_id: uuid.UUID, payload: ProposalContentInput, user: RequireGestor, db: DbSession) -> ProposalContentResponse:
    proposal_service.set_content(db, user, proposal_id, payload)
    return proposal_service.get_content(db, user, proposal_id)
```

- [ ] **Step 4: Run tests + smoke**

Run: `cd backend && uv run pytest tests/test_proposal_content.py tests/smoke/ -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/proposals.py backend/tests/test_proposal_content.py
git commit -m "feat(proposals): content and apply-template endpoints"
```

---

# MILESTONE 3b — Frontend

> **Frontend convention (read before Task 15):** open `frontend/src/lib/api/proposals.ts`, `frontend/src/components/proposals/proposals-view.tsx`, and `frontend/src/components/proposals/create-proposal-dialog.tsx` first. Mirror their structure exactly — `Backend*` snake types + camel domain types, TanStack Query hooks, shadcn components, loading/empty/error states, i18n via `useTranslations`. Each frontend task ends with `npm run lint && npx tsc --noEmit` clean, then a commit.

## Task 15: Catalog API client + types + nav entry

**Files:**
- Create: `frontend/src/lib/api/catalog-types.ts`, `frontend/src/lib/api/catalog.ts`
- Modify: nav config (find it: `cd frontend && grep -rln "Propostas\|crm/proposals" src --exclude-dir=.next` → the sidebar array; add `Catálogo` + `Templates` entries under the COMERCIAL group)
- Test: manual (`npm run lint`, `tsc`)

**Interfaces:**
- Produces: `catalogApi` with `list(params)`, `get(id)`, `create(input)`, `update(id, input)`, `archive(id)`, `restore(id)`; domain type `CatalogItem` (camelCase), `CatalogItemInput`, `BillingType`, `CatalogUnit`.

- [ ] **Step 1: Types**

```typescript
// frontend/src/lib/api/catalog-types.ts
export type CatalogUnit = "unit" | "hour" | "day" | "month" | "m2" | "license" | "fixed";
export type BillingType = "one_time" | "monthly" | "annual";

export interface CatalogItem {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  unit: CatalogUnit;
  unitPrice: number; // EUR cents
  taxRate: string;   // percent, e.g. "23.00"
  billingType: BillingType;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogItemInput {
  name: string;
  description?: string | null;
  category?: string | null;
  unit: CatalogUnit;
  unitPrice: number;
  taxRate?: string;
  billingType: BillingType;
}

export interface CatalogListParams {
  q?: string;
  category?: string;
  billingType?: BillingType;
  includeArchived?: boolean;
  sort?: string;
  page?: number;
  pageSize?: number;
}
```

- [ ] **Step 2: Client (mirror `proposals.ts` http usage + case mapping)**

```typescript
// frontend/src/lib/api/catalog.ts
import { http } from "./http";
import type { CatalogItem, CatalogItemInput, CatalogListParams } from "./catalog-types";

interface Page<T> { items: T[]; total: number; page: number; pageSize: number; }

export const catalogApi = {
  async list(params: CatalogListParams = {}): Promise<Page<CatalogItem>> {
    return http.get<Page<CatalogItem>>("/catalog-items", { query: params });
  },
  async get(id: string): Promise<CatalogItem> {
    return http.get<CatalogItem>(`/catalog-items/${id}`);
  },
  async create(input: CatalogItemInput): Promise<CatalogItem> {
    return http.post<CatalogItem>("/catalog-items", input);
  },
  async update(id: string, input: Partial<CatalogItemInput>): Promise<CatalogItem> {
    return http.patch<CatalogItem>(`/catalog-items/${id}`, input);
  },
  async archive(id: string): Promise<CatalogItem> {
    return http.post<CatalogItem>(`/catalog-items/${id}/archive`, {});
  },
  async restore(id: string): Promise<CatalogItem> {
    return http.post<CatalogItem>(`/catalog-items/${id}/restore`, {});
  },
};
```

> Confirm the exact `http` method signatures (`http.get(path, { query })` vs `http.get(path, params)`) by reading `http.ts`; match them. The wrapper already deep-maps snake↔camel, so send camelCase and read camelCase.

- [ ] **Step 3: Nav** — add entries under the COMERCIAL group pointing to `/crm/catalog` and `/crm/proposal-templates`, with lucide icons (`Package`, `FileStack`) and i18n keys `nav.catalog`, `nav.proposalTemplates`.

- [ ] **Step 4: Verify + commit**

Run: `cd frontend && npm run lint && npx tsc --noEmit`
Expected: clean

```bash
git add frontend/src/lib/api/catalog-types.ts frontend/src/lib/api/catalog.ts frontend/src/<nav-file>
git commit -m "feat(catalog): frontend api client, types, nav entries"
```

## Task 16: Catalog pages (list / create dialog / detail / edit)

**Files:**
- Create: `frontend/src/app/(app)/crm/catalog/page.tsx`, `.../new/page.tsx` (or dialog), `.../[id]/page.tsx`, `.../[id]/edit/page.tsx`
- Create: `frontend/src/components/catalog/catalog-view.tsx`, `catalog-form.tsx`, `catalog-item-detail.tsx`
- Modify: `messages/pt-PT.json`, `messages/en.json` (add `catalog.*`)

**Interfaces:**
- Consumes: `catalogApi`, TanStack Query. Mirror `proposals-view.tsx` (table, search, filter, empty/loading/error states) and `create-proposal-dialog.tsx` (form dialog).

- [ ] **Step 1: Build the list view** — a `"use client"` `catalog-view.tsx` with `useQuery(["catalog", params], () => catalogApi.list(params))`, a shadcn `Table` of name/category/unit price (format cents → `€` via the existing money formatter — check `proposal-format.ts`), billing-type badge, and a "Novo item" button opening `catalog-form` in a dialog. Include loading skeleton, empty state, error state. `page.tsx` renders `<CatalogView />`.

- [ ] **Step 2: Build the form** — `catalog-form.tsx` using shadcn `Form` + zod (mirror `frontend/src/lib/validation/proposal-schemas.ts` for the zod pattern; add `catalog-schemas.ts` if that's the convention). Fields: name, description, category, unit (select of `CatalogUnit`), unitPrice (euros input → cents on submit), taxRate (default 23), billingType (select). `useMutation` → `catalogApi.create`/`update`, invalidate `["catalog"]`, toast success.

- [ ] **Step 3: Detail + edit pages** — `[id]/page.tsx` shows the item (reuse detail layout patterns from a CRM detail view), with Edit and Archive/Restore actions. `[id]/edit/page.tsx` renders `catalog-form` in edit mode.

- [ ] **Step 4: i18n** — add all `catalog.*` keys to both message files. No hardcoded strings.

- [ ] **Step 5: Verify + commit**

Run: `cd frontend && npm run lint && npx tsc --noEmit`

```bash
git add frontend/src/app/(app)/crm/catalog frontend/src/components/catalog frontend/src/messages/pt-PT.json frontend/src/messages/en.json
git commit -m "feat(catalog): catalog management pages"
```

## Task 17: Shared line-items table + totals panel components

**Files:**
- Create: `frontend/src/lib/api/proposal-content-types.ts`
- Create: `frontend/src/components/proposals/line-items-table.tsx`, `totals-panel.tsx`
- Test: `frontend/src/components/proposals/__tests__/totals.test.ts` (if the repo has a JS test runner — check `package.json`; if none, skip the test file and rely on `tsc` + Playwright)

**Interfaces:**
- Produces: TS types `LineItem`, `ProposalSectionData`, `Totals` (mirrors backend `TotalsResponse` camelCased: `oneTime/monthly/annual` each `{net,tax,gross}` + `value`); a pure `computeTotals(lines, discountBps)` client mirror for live editing; `<LineItemsTable value onChange catalogItems />` (editable grid with catalog picker) and `<TotalsPanel totals />` (shows one-time / mensal / anual separately).

- [ ] **Step 1: Types + pure client totals** — port the backend rounding rule (per-line, half-up, discount on net before tax) into `computeTotals` so the editor shows live totals without a round-trip. Keep the algorithm identical to `proposal_totals.py` (document the parity in a comment).

- [ ] **Step 2: `line-items-table.tsx`** — editable rows: catalog picker (searchable combobox querying `catalogApi.list`) that, on select, fills name/unit/unitPrice/taxRate/billingType (snapshot into local state), plus quantity input and a remove button. "Adicionar linha" appends a blank/ad-hoc row. Emits `onChange(lines)`.

- [ ] **Step 3: `totals-panel.tsx`** — a card showing Subtotal, IVA, **Total inicial (one-time)**, and, when present, **Mensal** and **Anual** rows, each formatted from cents.

- [ ] **Step 4: Verify + commit**

Run: `cd frontend && npm run lint && npx tsc --noEmit`

```bash
git add frontend/src/lib/api/proposal-content-types.ts frontend/src/components/proposals/line-items-table.tsx frontend/src/components/proposals/totals-panel.tsx
git commit -m "feat(proposals): shared line-items table and totals panel"
```

## Task 18: Proposal-templates API client + management pages

**Files:**
- Create: `frontend/src/lib/api/proposal-templates-types.ts`, `proposal-templates.ts`
- Create: `frontend/src/app/(app)/crm/proposal-templates/{page,new/page,[id]/page}.tsx`
- Create: `frontend/src/components/proposal-templates/{templates-view,template-editor,section-editor}.tsx`
- Modify: `messages/pt-PT.json`, `messages/en.json` (`proposalTemplates.*`)

**Interfaces:**
- Produces: `proposalTemplatesApi` (`list/get/create/update/archive/restore`); `ProposalTemplate` domain type with `sections`, `items`, `totals`. Editor composes `<SectionEditor>` (ordered rich-text-ish blocks: heading + textarea/markdown, reorder up/down, placeholder hint) + `<LineItemsTable>` (from Task 17) + a terms textarea + defaults (validity days, discount %). Live totals via `<TotalsPanel>`.

- [ ] **Step 1: Client + types** — mirror Task 15's client shape against `/proposal-templates`. `ProposalTemplateInput` carries `sections` + `items` (replace-on-save semantics).

- [ ] **Step 2: `templates-view.tsx`** — list of templates (name, #sections, #items, one-time total), "Novo template" → `/crm/proposal-templates/new`.

- [ ] **Step 3: `template-editor.tsx`** — full-page editor used by both `new` and `[id]`. Left: section editor + line items + terms; right: sticky `<TotalsPanel>` + defaults. Save → `create`/`update`, toast, redirect to detail. Guard writes to Gestor+ (mirror how proposals-view gates actions).

- [ ] **Step 4: i18n + verify + commit**

Run: `cd frontend && npm run lint && npx tsc --noEmit`

```bash
git add frontend/src/lib/api/proposal-templates-types.ts frontend/src/lib/api/proposal-templates.ts frontend/src/app/(app)/crm/proposal-templates frontend/src/components/proposal-templates frontend/src/messages/pt-PT.json frontend/src/messages/en.json
git commit -m "feat(proposals): proposal template management UI"
```

## Task 19: Wire content into proposals client + create-from-template

**Files:**
- Modify: `frontend/src/lib/api/proposals.ts`, `proposals-types.ts`
- Modify: `frontend/src/components/proposals/create-proposal-dialog.tsx`
- Test: `npm run lint`, `tsc`

**Interfaces:**
- Produces on `proposalsApi`: `getContent(id) -> ProposalContent`, `setContent(id, input)`, `applyTemplate(id, templateId)`. `ProposalContent` mirrors backend `ProposalContentResponse` (camel). Create dialog gains an optional "Começar a partir de um template" select; on create of a draft, if chosen, call `applyTemplate` immediately after.

- [ ] **Step 1: Add the three methods** to `proposalsApi` using `http` (GET `/proposals/{id}/content`, PUT same, POST `/proposals/{id}/apply-template`). Add the domain types to `proposals-types.ts`.

- [ ] **Step 2: Extend create dialog** — add a template `<Select>` (options from `proposalTemplatesApi.list`), and after `create` resolves, if a template was picked, `await proposalsApi.applyTemplate(newId, templateId)` then navigate to the detail page.

- [ ] **Step 3: Verify + commit**

Run: `cd frontend && npm run lint && npx tsc --noEmit`

```bash
git add frontend/src/lib/api/proposals.ts frontend/src/lib/api/proposals-types.ts frontend/src/components/proposals/create-proposal-dialog.tsx
git commit -m "feat(proposals): content client methods and create-from-template"
```

## Task 20: Proposal content editor in detail view

**Files:**
- Create: `frontend/src/components/proposals/proposal-content-editor.tsx`
- Modify: `frontend/src/components/proposals/proposal-detail-view.tsx`
- Modify: `messages/*` (`proposals.content.*`)

**Interfaces:**
- Consumes: `proposalsApi.getContent/setContent/applyTemplate`, `<LineItemsTable>`, `<SectionEditor>`, `<TotalsPanel>`.
- Produces: a "Conteúdo" card in the detail view, **editable only while `status === "draft"`** (else render read-only summary), with an "Aplicar template" action, autosave-or-explicit-save via `setContent`, and a link to the preview route.

- [ ] **Step 1: Build `proposal-content-editor.tsx`** — loads content via `useQuery(["proposal-content", id])`, renders sections + line items + terms + totals; Save button `useMutation(setContent)` invalidates `["proposal-content", id]` and `["proposal", id]` (so the recomputed `value` shown in Detalhes updates). When not draft, show a compact read-only view.

- [ ] **Step 2: Mount in `proposal-detail-view.tsx`** — add the "Conteúdo" card below "Documento", and a "Ver pré-visualização" button/link to `/crm/proposals/{id}/preview`.

- [ ] **Step 3: Verify + commit**

Run: `cd frontend && npm run lint && npx tsc --noEmit`

```bash
git add frontend/src/components/proposals/proposal-content-editor.tsx frontend/src/components/proposals/proposal-detail-view.tsx frontend/src/messages/pt-PT.json frontend/src/messages/en.json
git commit -m "feat(proposals): structured content editor in detail view"
```

## Task 21: Printable preview page

**Files:**
- Create: `frontend/src/app/(app)/crm/proposals/[id]/preview/page.tsx`
- Create: `frontend/src/components/proposals/proposal-preview.tsx`
- Modify: `messages/*` (`proposals.preview.*`)

**Interfaces:**
- Consumes: `proposalsApi.get(id)`, `proposalsApi.getContent(id)`, company data for the header.
- Produces: a branded, print-optimized page — company/brand header, proposal reference + dates, each section (heading + body), an itemized table grouped by billing type, `<TotalsPanel>` (one-time / mensal / anual), terms block, and a "Imprimir / Guardar PDF" button calling `window.print()`. `@media print` CSS hides app chrome and the print button.

- [ ] **Step 1: Build `proposal-preview.tsx`** — clean layout, generous whitespace, brand tokens from `globals.css`. Group line items by `billingType` with a subtotal per group. Use semantic HTML + print CSS (`@media print { .no-print { display: none } body { ... } }`).

- [ ] **Step 2: Build the route** — `preview/page.tsx` renders `<ProposalPreview id={params.id} />`; ensure it works inside the app shell but the print stylesheet strips nav/sidebar.

- [ ] **Step 3: Visual readback (MANDATORY gate)** — per the visual-foundation rule:

```bash
cd frontend && npm install --no-save -D playwright && npx playwright install chromium
# write a small .screenshot.mjs that logs in (or uses a seeded session), then captures:
#   /crm/catalog, /crm/proposal-templates, /crm/proposal-templates/new,
#   a proposal detail with content, and /crm/proposals/<id>/preview
# at desktop (1440) + mobile (390), plus preview under page.emulateMedia({ media: 'print' }).
node .screenshot.mjs
```

Read each PNG with the Read tool. For every screenshot answer: *"Would I demo this to a paying customer tomorrow?"* Fix anything that fails (grayscale, no shell, broken 390px, wireframe preview). Do NOT mark the task done until the preview looks like a real client proposal.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/(app)/crm/proposals/[id]/preview frontend/src/components/proposals/proposal-preview.tsx frontend/src/messages/pt-PT.json frontend/src/messages/en.json
git commit -m "feat(proposals): branded printable proposal preview"
```

## Task 22: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Backend suite**

Run: `cd backend && uv run pytest -v`
Expected: all pass (new + existing). Fix regressions before proceeding.

- [ ] **Step 2: Smoke**

Run: `cd backend && uv run pytest tests/smoke/ -v`
Expected: PASS.

- [ ] **Step 3: Frontend build gates**

Run: `cd frontend && npm run lint && npx tsc --noEmit && npm run build`
Expected: clean.

- [ ] **Step 4: Manual E2E via Playwright CLI** — script the full flow: create a catalog item → create a template using it → create a proposal from the template → verify Detalhes `value` = one-time net → open preview → print emulation screenshot. Read the screenshots back and confirm the numbers match the totals. Capture the DB read-back for `proposals.value` (query via the API `GET /proposals/{id}` and assert `value`).

- [ ] **Step 5: Final commit (if any fixes)**

```bash
git add -A
git commit -m "test(proposals): end-to-end verification of templates + catalog"
```

---

## Self-Review (completed by plan author)

**Spec coverage:** Catalog (§4) → Tasks 1–6, 15–16. Templates (§5) incl. sections/items/terms/defaults/totals → Tasks 7, 9–11, 17–18. Placeholders (§5.2) → Task 8. Totals model + `value`=one-time-net (§5.3) → Task 7 + Task 13 recompute. Proposal content + instantiation (§6) → Tasks 12–14, 19–20. Preview (§6.4) → Task 21. Snapshot integrity (§3) → Task 13 test asserts mutating the template doesn't change the proposal. Non-draft guard (§6.2/§7) → Task 13/14. i18n (§9) → every frontend task. Testing (§8) → pure-math unit tests (Task 7), instantiation test (13), visual readback (21), E2E (22).

**Open questions from spec:** rich-text format — plan uses plain text/markdown in `body`/`terms` (textarea), matching the "markdown, no XSS surface" recommendation; no HTML rendering of untrusted input. Catalog create-as-dialog vs page — plan uses a dialog for create + a page for edit (Task 16).

**Placeholder scan:** the two backend uncertainties (exact `errors.*` class names; exact `http` method signature; fixture names in the existing test suite) are flagged inline with a concrete verification step, not left as silent TODOs — the implementer confirms the real name against the existing code before writing. This is deliberate: inventing a wrong class name would be worse than an explicit "confirm and match".

**Type consistency:** `LineInput`/`GroupTotal`/`Totals`/`compute_totals` names are identical across Tasks 7, 11, 13. `ProposalTemplateResponse.totals` (Task 10) is produced by `to_response` (Task 11) and mirrored by the frontend `Totals` type (Task 17). `apply_template`/`set_content`/`get_content` signatures match between service (13), routes (14), and frontend client (19).
