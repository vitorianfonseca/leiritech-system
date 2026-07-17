# Aurea System — Design System

> This file is the visual contract. Every feature builder consumes these tokens.
> Do NOT introduce new palettes, invent status colors, or fall back to grayscale.
> Chosen once at foundation time; changing it is a design decision, not a feature edit.

---

## Brand

- **App**: Aurea System
- **Tagline**: *O sistema operativo interno da Aurea.*
- **Emotional positioning**: an instrument of balance, proportion, harmony, precision, light
  and excellence — the internal OS a software house trusts to run quote-to-cash. It should feel
  calm, editorial and exact, never loud or "SaaS-dashboard busy".

### The core discipline: warm neutrals + discreet gold
Aurea ("golden") earns its name through **restraint**. The interface is built from **warm paper
and stone neutrals** with a **warm ink** foreground. Saturated colour — especially the **gold
accent** — is spent deliberately and never decoratively. Gold appears only on:
- the **single primary action** of a surface,
- **key indicators** (active nav, focus rings, a highlighted metric),
- and where a **state / priority / alert** must be read at a glance.

If gold is everywhere, it means nothing. A screen should read as paper, ink and one flash of gold.

---

## Palette (OKLCH)

OKLCH is used for wider gamut and predictable lightness. Hues sit in the warm band (h ≈ 55–85)
so neutrals read as paper/stone, not cold gray.

### Light (default)

| Token | OKLCH | ~Hex | Role |
|---|---|---|---|
| `background` | `oklch(0.977 0.007 83)` | `#f6f3ee` | Warm paper canvas |
| `foreground` | `oklch(0.245 0.012 62)` | `#2a2622` | Warm ink (never pure black) |
| `card` | `oklch(0.995 0.003 85)` | `#fefdfb` | Elevated surface |
| `card-foreground` | `oklch(0.245 0.012 62)` | `#2a2622` | |
| `popover` / `-foreground` | same as card | | |
| `primary` | `oklch(0.305 0.024 58)` | `#3b3229` | **Functional primary** — warm espresso ink |
| `primary-foreground` | `oklch(0.985 0.006 85)` | `#fdfbf7` | |
| `secondary` | `oklch(0.94 0.010 80)` | `#eae4da` | Warm stone |
| `secondary-foreground` | `oklch(0.305 0.024 58)` | `#3b3229` | |
| `muted` | `oklch(0.955 0.008 82)` | `#efeae2` | Muted stone surface |
| `muted-foreground` | `oklch(0.515 0.016 66)` | `#6d655a` | Secondary text |
| `accent` | `oklch(0.95 0.012 82)` | `#efe9df` | Hover / tinted row |
| `accent-foreground` | `oklch(0.305 0.024 58)` | `#3b3229` | |
| `border` | `oklch(0.90 0.010 80)` | `#e0d9cd` | Hairline |
| `input` | `oklch(0.90 0.010 80)` | `#e0d9cd` | |
| `ring` | `oklch(0.74 0.115 78)` | `#c99a3f` | **Gold** focus ring |

### The gold accent (signature)

| Token | OKLCH | ~Hex | Role |
|---|---|---|---|
| `gold` | `oklch(0.745 0.118 78)` | `#cb9a3c` | Signature accent — indicators, single CTA highlight |
| `gold-foreground` | `oklch(0.985 0.006 85)` | `#fdfbf7` | Text/icon on solid gold |

Gold is intentionally *not* the `primary`. `primary` (espresso) carries the bulk of interactive
chrome; gold is the sparing highlight. A feature builder painting large gold blocks is a bug.

### Semantic (fixed, warm-tuned)

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
| `status-done` (+ `-bg`) | faded stone `oklch(0.62 0.006 70)` | Completed / archived — visually receded |

Rule: overdue = solid alarm (red bg tint + icon), due = amber countdown, done = faded/strikethrough.
The three must never share one visual treatment.

### Charts (multi-series order: primary → secondary → success → info → warning)

| Token | Light OKLCH | Hue |
|---|---|---|
| `chart-1` | `oklch(0.745 0.118 78)` | gold |
| `chart-2` | `oklch(0.60 0.10 205)` | teal |
| `chart-3` | `oklch(0.60 0.125 150)` | green |
| `chart-4` | `oklch(0.55 0.12 262)` | indigo |
| `chart-5` | `oklch(0.63 0.155 40)` | terracotta |

### Dark (designed separately — NOT auto-inverted; light is default)

Warm charcoal base (never pure black). Borders become translucent white; shadows deepen; the
**gold becomes the primary CTA colour** in dark since an espresso button would not separate from a
dark canvas. Saturation of semantics reduced ~10%.

| Token | Dark OKLCH |
|---|---|
| `background` | `oklch(0.205 0.008 62)` |
| `foreground` | `oklch(0.95 0.006 85)` |
| `card` / `popover` | `oklch(0.245 0.010 62)` |
| `primary` | `oklch(0.80 0.12 82)` (gold) |
| `primary-foreground` | `oklch(0.22 0.02 60)` |
| `secondary` / `accent` | `oklch(0.29 0.010 62)` |
| `muted` | `oklch(0.27 0.010 62)` |
| `muted-foreground` | `oklch(0.71 0.012 72)` |
| `border` | `oklch(1 0 0 / 12%)` |
| `input` | `oklch(1 0 0 / 15%)` |
| `ring` | `oklch(0.80 0.12 82)` |
| `gold` | `oklch(0.82 0.125 82)` |

Full dark values live in `globals.css` under `.dark`.

---

## Typography

- **Body / UI**: **Manrope** (`--font-sans`). Geometric, clean, numeric-friendly.
- **Headings / editorial moments**: **Instrument Serif** (`--font-heading`), a high-contrast
  display serif. Used for page titles, greeting headers, big metric labels — the "editorial"
  voice of Aurea. Utility: `.font-heading` (also `--font-heading` registered in `@theme`).
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
- **Shadows**: soft, warm-neutral — `--shadow-sm/md/lg`. No shadow heavier than ~0.12 alpha in light.
- **Motion** (Framer Motion): 150–300ms ease-out micro-interactions; respect `prefers-reduced-motion`;
  never delay frequent actions.

---

## Iconography

- **lucide-react**, stroke weight 1.5–1.8, size 16–20 in chrome.
- Decorative icons `aria-hidden`; meaningful icons get an accessible label.
- State is always icon **+** colour, never colour alone.

---

## Do / Don't

- ✅ Paper + ink + one flash of gold. ✅ Status via the zone tokens. ✅ `.font-heading` for titles.
- ❌ shadcn `neutral` grayscale. ❌ Gold as a background block. ❌ Rainbow of accents on one screen.
- ❌ Pure `#000`. ❌ Locale in the URL. ❌ Inventing per-page status colours.
