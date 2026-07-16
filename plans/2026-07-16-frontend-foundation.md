# Aurea System — Frontend Foundation Plan (2026-07-16)

Foundation builder. Runs ONCE before any feature builder. Output is the contract.

## Stack reality
- Next.js 16.2.10 (Turbopack default; `middleware` → `proxy`; App Router).
- shadcn v4 `base-nova` style on **@base-ui/react** (NOT Radix). Imports `shadcn/tailwind.css`.
- Tailwind v4 (CSS `@theme inline`, OKLCH tokens).
- lucide-react v1.24.0. Geist sans already wired.

## Brand
Aurea = balance, proportion, harmony, precision, light, excellence.
Warm-neutral paper/stone palette; ONE sophisticated functional primary (warm espresso ink);
DISCREET gold/amber accent reserved for state / priority / key indicator / the single primary action.
Body = Geist; headline = Fraunces (serif, opsz axis).

## Deliverables
1. `frontend/DESIGN.md` — palette + type + rationale + status tokens.
2. `src/app/globals.css` — OKLCH tokens (light + separate dark), gold/semantic/status tokens, `.font-heading`.
3. Providers — TanStack Query, next-themes (light default), NextIntlClientProvider.
4. i18n — next-intl `localePrefix:"never"`, server resolution profile→cookie→Accept-Language→pt-PT. pt-PT + en messages. `<LocaleSwitcher>` writes cookie + refresh, no URL change.
5. App shell — collapsible persisted sidebar (Início, O meu trabalho, CRM, Projetos, Tarefas, Calendário, Equipa, Relatórios, Definições), top bar (search, ⌘K palette, quick-create, notifications, help, profile), footer. Role-aware. Mobile drawer.
6. UI primitives (base-ui): card, badge, input, avatar, tooltip, separator, scroll-area, dialog, popover, menu, kbd, skeleton.
7. Playwright CLI baseline: sidebar expanded/collapsed, desktop 1440 + mobile 390, light + dark. Read PNGs back.

## Layout tree (no `[locale]` segment)
- `src/app/layout.tsx` — html/body, fonts, providers, intl.
- `src/app/(app)/layout.tsx` — AppShell (reads sidebar cookie + dev role).
- `src/app/(app)/page.tsx` — `/` foundation dashboard placeholder.
- `src/app/(app)/my-work/page.tsx` — second placeholder to prove shell across routes.

## Gate
build + tsc + lint clean; read ≥4 screenshots; "would I demo this tomorrow?" must be yes.
