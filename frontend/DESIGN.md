# LeiriTech — Design System

> This file is the visual contract. Every feature builder consumes these tokens.
> Do NOT introduce new palettes, invent status colors, or fall back to grayscale.
> Chosen once at foundation time; changing it is a design decision, not a feature edit.

---

## Brand

- **App**: LeiriTech
- **Tagline**: *O sistema operativo interno da LeiriTech.*
- **Emotional positioning**: an instrument of precision, signal and structure — the internal OS
  a software house trusts to run quote-to-cash. It should feel calm, confident and exact, never
  loud or "SaaS-dashboard busy".

### The core discipline: cool neutrals + discreet cobalt
LeiriTech earns its name through **restraint**. The interface is built from **cool paper and
slate neutrals** with a **deep indigo ink** foreground. Saturated colour — especially the
**cobalt accent** — is spent deliberately and never decoratively. Cobalt appears only on:
- the **single primary action** of a surface,
- **key indicators** (active nav, focus rings, a highlighted metric),
- and where a **state / priority / alert** must be read at a glance.

If cobalt is everywhere, it means nothing. A screen should read as paper, ink and one flash of blue.

---

## Palette (OKLCH)

OKLCH is used for wider gamut and predictable lightness. Hues sit in the cool blue band
(h ≈ 245–260) so neutrals read as paper/slate, not warm cream.

### Light (default)

| Token | OKLCH | ~Hex | Role |
|---|---|---|---|
| `background` | `oklch(0.983 0.004 248)` | `#f7fafc` | Cool paper canvas |
| `foreground` | `oklch(0.225 0.028 258)` | `#141c29` | Indigo ink (never pure black) |
| `card` | `oklch(0.997 0.002 248)` | `#fdfeff` | Elevated surface |
| `card-foreground` | `oklch(0.225 0.028 258)` | `#141c29` | |
| `popover` / `-foreground` | same as card | | |
| `primary` | `oklch(0.32 0.075 258)` | `#193358` | **Functional primary** — deep indigo ink |
| `primary-foreground` | `oklch(0.985 0.006 248)` | `#f7fbfe` | |
| `secondary` | `oklch(0.945 0.012 250)` | `#e7eef5` | Cool slate |
| `secondary-foreground` | `oklch(0.32 0.075 258)` | `#193358` | |
| `muted` | `oklch(0.955 0.010 250)` | `#ebf1f7` | Muted slate surface |
| `muted-foreground` | `oklch(0.50 0.020 255)` | `#5c646f` | Secondary text |
| `accent` | `oklch(0.95 0.014 250)` | `#e8eff8` | Hover / tinted row |
| `accent-foreground` | `oklch(0.32 0.075 258)` | `#193358` | |
| `border` | `oklch(0.90 0.012 250)` | `#d8dfe6` | Hairline |
| `input` | `oklch(0.90 0.012 250)` | `#d8dfe6` | |
| `ring` | `oklch(0.62 0.16 255)` | `#3986e4` | **Cobalt** focus ring |

### The cobalt accent (signature)

> Note: the underlying CSS custom property is still named `--gold` in `globals.css` for
> historical reasons (it predates this rebrand and ~90 files reference `bg-gold`/`text-gold`
> utility classes) — its **value** is now cobalt blue, not literal gold. Treat it as the brand
> accent token, not a colour name.

| Token | OKLCH | ~Hex | Role |
|---|---|---|---|
| `gold` (brand accent) | `oklch(0.60 0.17 255)` | `#2a80e2` | Signature accent — indicators, single CTA highlight |
| `gold-foreground` | `oklch(0.985 0.006 248)` | `#f7fbfe` | Text/icon on solid cobalt |

Cobalt is intentionally *not* the `primary`. `primary` (indigo ink) carries the bulk of
interactive chrome; cobalt is the sparing highlight. A feature builder painting large cobalt
blocks is a bug.

### Semantic (fixed, cool-tuned)

| Token | Light OKLCH | Meaning |
|---|---|---|
| `success` / `-foreground` | `oklch(0.60 0.13 150)` / white | positive, paid, done |
| `warning` / `-foreground` | `oklch(0.75 0.135 75)` / ink | attention, due soon |
| `destructive` / `-foreground` | `oklch(0.577 0.205 27)` / white | overdue, error, irreversible |
| `info` / `-foreground` | `oklch(0.60 0.115 245)` / white | neutral informational |

Each has a `-muted` tint (same hue, L≈0.95) for soft backgrounds. Never rely on colour alone —
pair with an icon or label (WCAG AA, F10/§10 accessibility).

### PSA status / urgency zones (consume these, do not reinvent)

Safety of the operation depends on late/at-risk states reading instantly. Feature builders MUST
use these tokens for project health, task urgency and payment state.

| Token | Family | Used for |
|---|---|---|
| `health-healthy` (+ `-bg`) | success | Project RAG = healthy |
| `health-attention` (+ `-bg`) | warning | Project RAG = attention |
| `health-at-risk` (+ `-bg`) | destructive | Project RAG = at_risk |
| `status-overdue` (+ `-bg`) | destructive | Overdue task / overdue payment (alarm zone) |
| `status-blocked` (+ `-bg`) | violet `oklch(0.55 0.13 305)` | Blocked task — distinct hue, not just red |
| `status-due` (+ `-bg`) | warning | Due soon / countdown |
| `status-done` (+ `-bg`) | faded slate `oklch(0.62 0.006 70)` | Completed / archived — visually receded |

Rule: overdue = solid alarm (red bg tint + icon), due = amber countdown, done = faded/strikethrough.
The three must never share one visual treatment.

### Charts (multi-series order: primary → secondary → success → info → warning)

| Token | Light OKLCH | Hue |
|---|---|---|
| `chart-1` | `oklch(0.60 0.17 255)` | cobalt |
| `chart-2` | `oklch(0.60 0.10 205)` | teal |
| `chart-3` | `oklch(0.60 0.125 150)` | green |
| `chart-4` | `oklch(0.66 0.15 40)` | amber |
| `chart-5` | `oklch(0.58 0.15 320)` | plum |

### Dark (designed separately — NOT auto-inverted; light is default)

Deep navy charcoal base (never pure black). Borders become translucent white; shadows deepen; the
**cobalt becomes the primary CTA colour** in dark since an indigo-ink button would not separate from
a dark canvas. Saturation of semantics reduced ~10%.

| Token | Dark OKLCH |
|---|---|
| `background` | `oklch(0.195 0.020 258)` |
| `foreground` | `oklch(0.95 0.006 248)` |
| `card` / `popover` | `oklch(0.235 0.022 258)` |
| `primary` | `oklch(0.72 0.15 255)` (cobalt) |
| `primary-foreground` | `oklch(0.16 0.02 258)` |
| `secondary` / `accent` | `oklch(0.275 0.018 258)` |
| `muted` | `oklch(0.255 0.016 258)` |
| `muted-foreground` | `oklch(0.68 0.020 255)` |
| `border` | `oklch(1 0 0 / 12%)` |
| `input` | `oklch(1 0 0 / 15%)` |
| `ring` | `oklch(0.72 0.15 255)` |
| `gold` (brand accent) | `oklch(0.74 0.15 255)` |

Full dark values live in `globals.css` under `.dark`.

---

## Typography

- **Body / UI**: **Satoshi** (`--font-sans`, self-hosted via `next/font/local`). Geometric, clean, numeric-friendly.
- **Headings / editorial moments**: **Satoshi** (`--font-heading` = `--font-sans`). A single
  typeface across the whole UI; headings lean on the heavier weights (700/900) for hierarchy.
  Utility: `.font-heading` (also `--font-heading` registered in `@theme`).
- **Mono**: Geist Mono (`--font-mono`) for references, IDs, code, keyboard hints.

Scale (max 3 sizes per view — HIG): title `text-2xl/3xl` heading serif, body `text-sm/base`,
caption `text-xs` muted. Headline tracking `-0.02em`; body default. Line-height 1.1–1.2 headings,
1.4–1.6 body.

**Dashboard metrics** use `.font-heading` at large size with `tabular-nums` for legible,
aligned figures. EUR values formatted `pt-PT` (`1.234,56 €`), dates `dd/mm/yyyy`.

---

## Spacing, radii, motion

- **8px grid**: 8 / 16 / 24 / 32 / 48 / 64. No 5/10/15.
- **Radius**: `--radius: 0.625rem` (10px) — precise but not sterile. `-sm/-md/-lg/-xl` derived.
- **Shadows**: soft, cool-neutral — `--shadow-sm/md/lg`. No shadow heavier than ~0.12 alpha in light.
- **Motion** (Framer Motion): 150–300ms ease-out micro-interactions; respect `prefers-reduced-motion`;
  never delay frequent actions.

---

## Iconography

- **lucide-react**, stroke weight 1.5–1.8, size 16–20 in chrome.
- Decorative icons `aria-hidden`; meaningful icons get an accessible label.
- State is always icon **+** colour, never colour alone.

---

## Create surfaces

Company/Project use a full page for creation while Opportunity/Proposal/Catalog/Task/Finance
use a modal dialog — this was accidental drift (forge-audit H10/H11), so the rule going forward
is explicit:

- **Full page** (`/…/new`) for entities with many fields, multi-step data entry, or that
  benefit from their own URL (deep-linkable, bookmarkable, shareable while filling it in).
  Company and Project are the canonical examples — heavy field sets (contacts, sector,
  address, phases, budget) that don't fit comfortably in a dialog.
- **Modal dialog** for quick, single-purpose creates — a handful of fields, created from
  context (a list toolbar, a quick-create menu, a related-records tab) without leaving the
  page the user was on. Opportunity, Proposal, Catalog item, Task, Contact, and Finance
  records are the canonical examples.

When in doubt: if the form would need its own scroll + multiple sections, use a page. If it's
one focused burst of fields the user fills in without losing their place, use a dialog. Don't
retrofit existing entities to match this rule outside of a dedicated cleanup — apply it to new
create flows and follow it when an inconsistency is otherwise touched.

`Company` follows the full-page rule for **create** (`/crm/companies/new`); its detail page
still exposes an **edit** dialog for changing an existing record, which is a different
surface (editing an already-open record, not a from-scratch multi-field entry) and is not
covered by this rule.

### Edit availability (H12)

Company and Catalog expose a general "Edit" action for their metadata. Opportunity and
Proposal deliberately do **not** — their core commercial fields (stage, value, state) are
governed by explicit lifecycle actions (move/win/lose/send/accept/reject) enforced by
business rules (BR-013, BR-026 terminal states), so an unguarded general edit would let the
UI bypass those transitions. This is an intentional lock, not a gap.

---

## Do / Don't

- ✅ Paper + ink + one flash of cobalt. ✅ Status via the zone tokens. ✅ `.font-heading` for titles.
- ❌ shadcn `neutral` grayscale. ❌ Cobalt as a background block. ❌ Rainbow of accents on one screen.
- ❌ Pure `#000`. ❌ Locale in the URL. ❌ Inventing per-page status colours.
