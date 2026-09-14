# Issue #42 — Settings areas

## Goal
`/settings/*` section with shared SettingsNav + landing, consuming foundation tokens and
shared #7 components. Admin-only config (BR-004); templates admin+gestor; cost rates admin
(BR-069). Reuse teamApi (capacity/costs single source, #37), opportunities pipeline stages
(#29), existing theme provider, LocaleSwitcher. Do NOT rebuild templates (#33) — link it.

## Routes (src/app/(app)/settings/)
layout.tsx (server gate: membro→notFound; render SettingsLayoutClient) + loading.tsx + error.tsx
- page.tsx            landing (grid of areas, role-filtered)
- leiritech/             org data + logo (admin) — settings.ts
- members/           list + role + activate/deactivate + invite; last-admin guard BR-005 — settings.ts
- roles/             view-only permission matrix (admin)
- pipeline/          stages: reorder(dnd) + color + win_probability (admin) — opportunities stages + settings color store
- states/            estados (view) + prioridades (manage labels/colors) — settings.ts
- tags/              tags CRUD + delete undo — settings.ts
- capacity/          weekly capacity + utilization target (admin) — teamApi.updateFunctionConfig
- costs/             internal cost rates (admin) — teamApi.updateFunctionConfig
- notifications/     preference toggles — settings.ts
- theme/             theme picker (reuse provider) + link to /profile
- archive/           view archived + restore(undo mock) — settings.ts
- export/            dataset CSV export (mock blob) — settings.ts
- templates/         EXISTING (#33) — untouched, gains SettingsNav via layout

## Data layer
- lib/api/settings-types.ts, lib/api/settings.ts (mock, module store, TanStack Query)
- capacity/costs call teamApi (NOT settings.ts) — single source with #37

## Components (src/components/settings/)
settings-nav-config.ts, settings-nav.tsx, settings-layout-client.tsx, index.ts,
settings-landing.tsx, + one *-view.tsx per area, tag-form-dialog, invite-member-dialog,
sortable-stage-row.

## i18n
New top-level `settings` key in pt-PT.json + en.json, injected via node script for parity.
Reuse common/roles/theme/shared.*.

## Verify
build + tsc + lint clean; Playwright CLI on port 3100 (kill next-server first); admin landing +
pipeline/tags/capacity/costs/members; membro→notFound; templates still works; 1440 + 390, light+dark.

## Cross-issue findings to flag (don't fix)
- Main nav Definições is ADMIN-only → gestor can't reach /settings/templates from nav (only direct URL).
- Pipeline stage order/probability/color has no settingsApi setter in opportunities.ts (#29);
  settings owns a parallel color+config store until integration.
