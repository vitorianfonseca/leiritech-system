# Aurea System

Studio/agency operations platform — commercial pipeline (CRM), projects, tasks,
time, finance, and reporting.

- **Backend:** FastAPI (Python 3.12+, `uv`), PostgreSQL, JWT auth. API prefix
  `/api/v1`, health at `/health`, interactive docs at `/docs`.
- **Frontend:** Next.js 16 (App Router), TypeScript, shadcn/ui, TanStack Query,
  next-intl.

## Local development

### Backend

```bash
cd backend
uv sync
# apply migrations
ENVIRONMENT=development uv run alembic upgrade head
# seed the first admin + demo data (dev prints a generated admin password once,
# or pass your own with --password)
ENVIRONMENT=development uv run python -m app.database.seed \
  --email admin@aurea.pt --password "your-strong-pass"
# run
ENVIRONMENT=development uv run uvicorn app.main:app --port 8000
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local   # then set NEXT_PUBLIC_API_URL if the backend isn't on :8000
npm run dev                  # http://localhost:3000
```

Log in at `/login` with the seeded admin credentials.

## Environment variables

### Frontend (`frontend/.env.local`, example in `frontend/.env.example`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | yes | `http://localhost:8000` | Backend origin **without** the `/api/v1` prefix (the HTTP client appends it). No trailing slash. Exposed to the browser for direct cross-origin API calls. |

### Backend (`backend/.env`, example in `backend/.env.example`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `ENVIRONMENT` | no | `development` | `development`/`production`/`staging`. Production fails fast on insecure secrets. |
| `DEBUG` | no | `false` | Verbose mode. Must be `false` in production. |
| `DATABASE_URL` | yes (prod) | local dev DB | PostgreSQL DSN (`postgresql://…`; the psycopg v3 driver is forced automatically). |
| `JWT_SECRET` | yes (prod) | insecure dev placeholder | ≥32 chars in production; app refuses to start otherwise. |
| `ACCESS_TOKEN_TTL` | no | `900` | Access-token lifetime (seconds). |
| `REFRESH_TOKEN_TTL` | no | `1209600` | Refresh-token lifetime (seconds, 14 days). |
| `FRONTEND_URL` | no | `http://localhost:3000` | Allowed CORS origin. In development, `localhost:3000/3100/3200` are also allowed automatically. |
| `BACKEND_URL` | no | `http://localhost:8000` | Public backend origin. |
| `LOGIN_RATE_LIMIT_PER_MINUTE` | no | `5` | Per-account login attempts/minute. |
| `RESEND_API_KEY` / `EMAIL_FROM` | no | empty | Transactional email (invites, password reset). |
| `R2_ACCOUNT_ID` | for uploads | empty | Cloudflare R2 account id (or set `R2_ENDPOINT`). |
| `R2_ENDPOINT` | for uploads | empty | S3-compatible endpoint (overrides account-id URL). |
| `R2_ACCESS_KEY_ID` | for uploads | empty | R2 access key. |
| `R2_SECRET_ACCESS_KEY` | for uploads | empty | R2 secret key. |
| `R2_BUCKET` | for uploads | empty | R2 bucket name. |
| `R2_PUBLIC_URL` | no | empty | Public base URL for public objects (if used). |

> **Attachments / file uploads (#46):** the signed-URL upload/download interface
> is fully implemented (backend `app/storage/` + `/api/v1/attachments/*`,
> frontend `src/lib/api/attachments.ts`). It is **inert until the `R2_*`
> variables are set and `boto3` is installed backend-side** — until then those
> endpoints return `503 STORAGE_NOT_CONFIGURED` (they never fake a successful
> upload).

## Frontend ↔ backend integration

- One typed HTTP client (`frontend/src/lib/api/http.ts`) resolves the base URL,
  attaches the JWT, auto-refreshes once on 401, maps the backend error envelope
  to a typed `HttpError`, and case-maps snake_case ⇄ camelCase.
- Auth: `/api/auth/login|refresh|logout` route handlers store the refresh token
  in an httpOnly cookie and a short-lived access token in a browser-readable
  cookie; `middleware.ts` protects `(app)` routes and rotates tokens;
  `getSession()` reads the real user from `GET /auth/me`.
