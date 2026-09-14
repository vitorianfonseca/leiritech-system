# App Forge Context

## App Name
LeiriTech

## Problem Statement
LeiriTech, a software development company, needs a single internal operating system to
run its full commercial and delivery lifecycle — from first client contact through
opportunity, proposal, won deal, project execution, time tracking, and payment —
without the bloat of ClickUp/Notion/Monday/Jira/Salesforce.

## Industry Domain
Internal Professional Services Automation (PSA) for a software house. Private,
invite-only tool — NOT a SaaS product. Single company, no multi-tenancy.

## Domain Research Summary
- **Industry**: Professional Services Automation (PSA) / agency operations tooling.
- **Key standards**: None regulatory. Follows PSA "quote-to-cash" lifecycle convention.
- **Competitors**: Scoro (quote→invoice lifecycle), Productive (PM + resourcing + CRM +
  financials), Kantata (resource planning + margins), ClickUp (all-in-one PM).
- **Standard terminology**: pipeline/stages, opportunity, proposal, utilization,
  capacity, workload, project health, billable hours, payment milestones, margin.
- **Standard workflows**: pipeline Kanban with drag-between-stages; won-deal →
  project spin-up reusing commercial data; timers + manual time entries; capacity vs
  logged hours; milestone-based payment tracking; project health auto-flagging.

## Target Users
- **Administrator**: full control — members, settings, pipeline stages, templates,
  all financials, all projects/reports.
- **Gestor (Manager)**: manages CRM, projects, tasks, proposals, operational reports;
  payments/invites only when granted.
- **Membro (Member)**: sees only own projects/clients; updates tasks, comments, logs
  time, own profile and notifications.

## Core Features (MVP)
1. Auth & invites: login, logout, password reset, invite/accept, refresh tokens — standard
2. Dashboard with "Atenção necessária" actionable panel + useful charts — user-requested
3. "O meu trabalho": daily work hub with contextual greeting from real data — differentiator
4. CRM: companies, contacts, interactions — standard
5. Pipeline: Kanban opportunities, drag between stages, won/lost flows — standard
6. Won → project spin-up reusing commercial data + template — differentiator (core principle)
7. Proposals: metadata + PDF upload (no document editor) — standard
8. Projects: phases, milestones, health (manual + auto-suggested), templates — standard
9. Tasks: list/kanban/calendar, side-panel detail, blockers, checklist — standard
10. Time tracking: single active timer per user, manual entries, billable flag — standard
11. Calendar: internal aggregate view (tasks/meetings/milestones/payments) — standard
12. Team & workload: capacity vs load, availability states — standard
13. Financial ops: contracted/received/pending, payment milestones, margin — standard
14. Notifications center + fixed automations (12 rules) — standard
15. Global search (Cmd/Ctrl+K command palette) + reports (CSV export) — standard

## User Flows
- **Commercial (Gestor)**: create company → contacts → opportunity → move across
  pipeline → log meeting → set next action → attach proposal → mark won → spin up
  project from template.
- **Delivery (Membro)**: open "O meu trabalho" → see today/overdue tasks → start
  timer → update status → comment/mention → attach file → flag blockers.
- **Oversight (Admin)**: dashboard "Atenção necessária" → drill into at-risk project /
  overdue payment / stalled opportunity → review reports.

## Data Entities
users, user_sessions, invitations, companies, contacts, opportunities,
pipeline_stages, proposals, interactions, projects, project_members, project_phases,
project_templates, template_phases, template_tasks, tasks, task_assignees,
task_checklist_items, task_dependencies, comments, mentions, attachments,
time_entries, meetings, milestones, payment_milestones, notifications, activity_logs,
tags, entity_tags, user_preferences.
(All with UUID id, created_at, updated_at, created_by, archived_at where applicable.
Soft-delete/archive — never hard-delete companies, opportunities, projects, tasks, proposals.)

## External Integrations
- **Email**: Resend (transactional — invites, password reset), behind an email-service abstraction.
- **File storage**: Cloudflare R2 (S3-compatible), behind a storage abstraction layer;
  metadata in PostgreSQL, binaries in R2, signed URLs.
- **Scheduled jobs**: Railway Cron (or equivalent) for the 12 automations.
- Calendar integration (Google) — architecture-ready, NOT built in v1.

## Auth & Roles
- JWT (short-lived access + secure refresh), HttpOnly cookies where appropriate.
- Password hashing: Argon2 (bcrypt fallback). Rate limiting on login. No public signup.
- First admin via secure seed/CLI command.
- Three roles: Administrador, Gestor, Membro. Permissions enforced in backend only.

## Compliance Requirements
- None regulatory. Internal security posture only: horizontal-access prevention,
  upload validation, secret management via env vars, audit via activity_logs
  (non-editable by regular users).

## Non-Goals (v1)
Multi-tenancy/workspaces, plans/subscriptions/billing of users, public pricing/signup,
chat, wiki, document/spreadsheet editor, customizable dashboards, custom fields, Gantt,
mind maps, whiteboards, video calls, full email inbox, legal invoicing/accounting,
payment processing, client portal, native mobile app, generative AI, configurable
automations, fully custom permissions, marketplace. (Architecture prepared for future
evolution.)

## Tech Stack
- Frontend: Next.js 16 (App Router) + TypeScript + shadcn/ui + Tailwind CSS
  (+ TanStack Query, React Hook Form, Zod, Framer Motion, dnd-kit, date-fns,
  lucide-react, Recharts, Zustand only when needed).
- Backend: Python 3.12 + FastAPI + Pydantic 2 + SQLAlchemy 2 + Alembic + UV
  (Uvicorn/Gunicorn, pytest, httpx, Ruff, mypy).
- Database: PostgreSQL on Neon.
- Auth: JWT (access + refresh), Argon2, HttpOnly cookies.
- Deployment: Frontend (modern Next.js host) + Backend on Railway.
- Storage: Cloudflare R2. Email: Resend.

## Localization
- Canonical locale: pt-PT (European Portuguese). Currency: EUR. Date format: dd/mm/yyyy.
- Locale NEVER in URL — resolved from user profile → cookie → Accept-Language → pt-PT.
- All UI strings via translation keys (no hardcoded strings). Optional en mirror later.

## Light/Dark
- Light mode is the default. Dark mode designed separately (not auto-inverted), full token set.

## Open Questions
- Frontend deploy target: Vercel assumed (spec says "modern Next.js host") — confirm at deploy time.
- Whether an English (en) key tree is built now or deferred — deferred by default.
- Exact LeiriTech brand palette (warm neutrals + subtle amber accent) — finalized in design-system step.

## Research Sources
- [Kantata — What is PSA software](https://www.kantata.com/resource-article/what-is-professional-services-automation-psa-software) — PSA core functional areas (CRM, resourcing, time/expense, billing, forecasts).
- [Ruddr — Top PSA platforms 2026](https://www.ruddr.com/post/top-professional-services-automation-psa-platforms-for-2026) — competitor landscape and feature baselines.
- [Productive.io — PM software with CRM](https://productive.io/blog/project-management-software-with-crm/) — all-in-one PM+CRM+financials pattern for agencies.
- [PSOhub — Agency management software guide 2026](https://www.psohub.com/blog/agency-management-software) — agency operations scope (delivery, resourcing, budgeting, reporting).
