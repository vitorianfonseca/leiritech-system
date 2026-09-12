# LeiriTech — Backend

FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL. Managed with `uv`.

## Local setup

```bash
cd backend
cp .env.example .env            # adjust if needed; defaults target docker-compose db
docker compose up -d            # Postgres 16 on localhost:5433 (user/pass/db = leiritech)
uv sync --extra dev             # install deps
uv run alembic upgrade head     # create all tables + indexes + extensions
uv run uvicorn app.main:app --reload
```

`GET /health` → `{"status": "ok"}`. OpenAPI docs at `/docs`.

## Structure

```
app/
  api/{routes,dependencies}/  # HTTP layer (routers mounted in api/router.py)
  core/                       # config, security (Argon2 + JWT), permissions
  database/                   # Base + mixins, engine/session, get_db
  models/                     # SQLAlchemy 2 ORM models (all §6 entities)
  schemas/                    # Pydantic request/response models
  repositories/ services/     # data access + business logic
  automations/ storage/       # scheduled automations, R2/S3 storage adapters
  main.py                     # FastAPI app, /health, CORS, error envelope
alembic/                      # migration environment + versions
tests/                        # pytest
```

## Conventions

- Money is stored as **integer EUR cents**.
- Enum/state fields store **stable English keys** (VARCHAR + CHECK via `native_enum=False`).
- Soft-delete (`archived_at`) for companies, opportunities, projects, tasks, proposals (BR-060).
- Single active timer per user enforced by a **partial unique index** (BR-040, #9).
- `pg_trgm` GIN indexes back global search (F18, #10).
- Secrets come from env vars only (`core/config.py`); never hardcoded.

## Migrations

```bash
uv run alembic revision --autogenerate -m "message"
uv run alembic upgrade head
uv run alembic downgrade -1
```
