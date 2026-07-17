/**
 * Calendar API client — MOCK implementation (F12).
 *
 * Backend is not wired yet. This module exports a typed `calendarApi` whose
 * `getCalendarEvents(range, ctx)` returns a promise exactly as the real HTTP
 * client will. The integration agent replaces the body with a real `fetch` to
 * FastAPI WITHOUT changing the signature. UI code (via TanStack Query) depends
 * only on the `CalendarApi` interface below.
 *
 * Events are seeded RELATIVE to "today" so the month / week / agenda views are
 * always populated whenever the app runs. The projection is read-only.
 */

import { addDays, format, startOfDay } from "date-fns";
import {
  type CalendarEvent,
  type CalendarQueryContext,
  type CalendarRange,
  type CalendarEventType,
  type CalendarUrgency,
} from "./calendar-types";

const MOCK_LATENCY_MS = 350;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** ISO datetime `offsetDays` from local midnight today, at `hour:minute`. */
function at(offsetDays: number, hour: number, minute = 0): string {
  const d = addDays(startOfDay(new Date()), offsetDays);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** All-day ISO datetime (local midnight) `offsetDays` from today. */
function allDayAt(offsetDays: number): string {
  return addDays(startOfDay(new Date()), offsetDays).toISOString();
}

/** Urgency derived from an offset relative to today (for dated deliverables). */
function urgencyFor(offsetDays: number, done = false): CalendarUrgency {
  if (done) return "done";
  if (offsetDays < 0) return "overdue";
  if (offsetDays <= 1) return "due";
  return "upcoming";
}

/**
 * Seed record. `ownerId` + `shared` drive BR-002 scoping for Membro; the mock
 * membro is `dev-membro`. `financial` events are withheld from Membro (BR-008).
 */
interface SeedEvent extends CalendarEvent {
  ownerId: string;
  /** Team-wide event visible to every member regardless of ownership. */
  shared: boolean;
  /** Financial event — withheld from Membro (BR-008). */
  financial: boolean;
}

const MEMBRO_ID = "dev-membro";

function seedEvents(): SeedEvent[] {
  const raw: Array<
    Omit<SeedEvent, "urgency"> & { offset: number; done?: boolean }
  > = [
    // ---- tasks (deadlines) ----
    mk("task", "Entregar wireframes da homepage", -2, {
      offsetHour: 18,
      project: ["p-1", "Website — Solar do Douro"],
      href: "/tasks?task=t-1",
      owner: MEMBRO_ID,
    }),
    mk("task", "Rever copy da newsletter", 0, {
      offsetHour: 17,
      project: ["p-2", "Rebranding — Adega Vale"],
      href: "/tasks?task=t-6",
      owner: MEMBRO_ID,
    }),
    mk("task", "Configurar ambiente de testes", 2, {
      offsetHour: 12,
      project: ["p-3", "App Fidelização — Lumina"],
      href: "/tasks?task=t-5",
      owner: "dev-gestor",
    }),
    mk("task", "Documentar API interna", 9, {
      offsetHour: 16,
      project: ["p-3", "App Fidelização — Lumina"],
      href: "/tasks?task=t-7",
      owner: MEMBRO_ID,
    }),
    // ---- meetings ----
    mk("meeting", "Reunião de arranque — Adega Vale", 0, {
      offsetHour: 11,
      durationMin: 45,
      location: "Google Meet",
      project: ["p-2", "Rebranding — Adega Vale"],
      href: "/projects/p-2",
      shared: true,
    }),
    mk("meeting", "Revisão de sprint — Lumina", 1, {
      offsetHour: 16,
      offsetMinute: 30,
      durationMin: 30,
      location: "Sala Aurea",
      project: ["p-3", "App Fidelização — Lumina"],
      href: "/projects/p-3",
      shared: true,
    }),
    mk("meeting", "Apresentação de proposta — Solar do Douro", 5, {
      offsetHour: 10,
      durationMin: 60,
      location: "Escritório do cliente",
      project: ["p-1", "Website — Solar do Douro"],
      href: "/crm/opportunities/o-1",
      shared: true,
    }),
    // ---- milestones ----
    mk("milestone", "Fecho da fase de design", 3, {
      allDay: true,
      project: ["p-1", "Website — Solar do Douro"],
      href: "/projects/p-1",
      shared: true,
    }),
    mk("milestone", "Lançamento da app (v1)", 21, {
      allDay: true,
      project: ["p-3", "App Fidelização — Lumina"],
      href: "/projects/p-3",
      shared: true,
    }),
    // ---- deliveries ----
    mk("delivery", "Entrega do manual de marca", -1, {
      allDay: true,
      project: ["p-2", "Rebranding — Adega Vale"],
      href: "/projects/p-2",
      owner: MEMBRO_ID,
    }),
    mk("delivery", "Entrega de mockups finais", 7, {
      allDay: true,
      project: ["p-3", "App Fidelização — Lumina"],
      href: "/projects/p-3",
      owner: MEMBRO_ID,
    }),
    // ---- commercial next-actions ----
    mk("next_action", "Follow-up telefónico — Lumina", 1, {
      offsetHour: 9,
      offsetMinute: 30,
      href: "/crm/opportunities/o-2",
      owner: "dev-gestor",
    }),
    mk("next_action", "Enviar caso de estudo — Adega Vale", 4, {
      offsetHour: 15,
      href: "/crm/opportunities/o-3",
      owner: "dev-gestor",
    }),
    // ---- proposal expiries ----
    mk("proposal_expiry", "Proposta expira — Solar do Douro", 6, {
      allDay: true,
      href: "/crm/proposals/pr-1",
      owner: "dev-gestor",
    }),
    mk("proposal_expiry", "Proposta expira — Quinta das Oliveiras", 0, {
      allDay: true,
      href: "/crm/proposals/pr-2",
      owner: "dev-gestor",
    }),
    // ---- expected payments (financial — hidden from Membro, BR-008) ----
    mk("payment", "Marco de pagamento — 40% Adega Vale", -3, {
      allDay: true,
      amountCents: 480000,
      project: ["p-2", "Rebranding — Adega Vale"],
      href: "/finance?milestone=pm-1",
      owner: "dev-gestor",
      financial: true,
    }),
    mk("payment", "Marco de pagamento — 30% Lumina", 8, {
      allDay: true,
      amountCents: 675000,
      project: ["p-3", "App Fidelização — Lumina"],
      href: "/finance?milestone=pm-2",
      owner: "dev-gestor",
      financial: true,
    }),
    mk("payment", "Marco de pagamento — final Solar do Douro", 30, {
      allDay: true,
      amountCents: 320000,
      project: ["p-1", "Website — Solar do Douro"],
      href: "/finance?milestone=pm-3",
      owner: "dev-gestor",
      financial: true,
    }),
  ];

  return raw.map((e) => ({
    ...e,
    urgency:
      e.type === "task" || e.type === "delivery" || e.type === "payment" || e.type === "proposal_expiry"
        ? urgencyFor(e.offset, e.done)
        : null,
  }));
}

/** Small factory keeping the seed table terse and consistent. */
function mk(
  type: CalendarEventType,
  title: string,
  offset: number,
  opts: {
    offsetHour?: number;
    offsetMinute?: number;
    durationMin?: number;
    allDay?: boolean;
    location?: string;
    project?: [string, string];
    href: string;
    owner?: string;
    shared?: boolean;
    financial?: boolean;
    amountCents?: number;
    done?: boolean;
  }
): Omit<SeedEvent, "urgency"> & { offset: number; done?: boolean } {
  const allDay = opts.allDay ?? false;
  const start = allDay
    ? allDayAt(offset)
    : at(offset, opts.offsetHour ?? 9, opts.offsetMinute ?? 0);
  const end =
    !allDay && opts.durationMin
      ? at(
          offset,
          opts.offsetHour ?? 9,
          (opts.offsetMinute ?? 0) + opts.durationMin
        )
      : null;
  return {
    id: `evt-${type}-${offset}-${title.length}`,
    type,
    title,
    start,
    end,
    allDay,
    projectId: opts.project?.[0] ?? null,
    projectName: opts.project?.[1] ?? null,
    sourceHref: opts.href,
    location: opts.location ?? null,
    description: null,
    amountCents: opts.amountCents ?? null,
    ownerId: opts.owner ?? "dev-admin",
    shared: opts.shared ?? false,
    financial: opts.financial ?? false,
    offset,
    done: opts.done,
  } as Omit<SeedEvent, "urgency"> & { offset: number; done?: boolean };
}

/** True when the event's start falls inside the half-open range `[start, end)`. */
function inRange(event: CalendarEvent, range: CalendarRange): boolean {
  const day = format(new Date(event.start), "yyyy-MM-dd");
  return day >= range.start && day < range.end;
}

export interface CalendarApi {
  /**
   * Aggregate events overlapping `range`, scoped for `ctx.role`/`ctx.userId`.
   * Payment (financial) events are withheld from Membro (BR-008); Membro sees
   * only own-scope + shared events (BR-002).
   */
  getCalendarEvents(
    range: CalendarRange,
    ctx: CalendarQueryContext
  ): Promise<CalendarEvent[]>;
}

export const calendarApi: CalendarApi = {
  // INTEGRATION-GAP: no backend endpoint — left on mock. There is no /calendar
  // route; a real feed must aggregate task due-dates, project milestones,
  // deliveries, proposal expiries, next-actions and payment milestones across
  // several domains (with BR-002/BR-008 scoping) — not a single cheap call.
  async getCalendarEvents(range, ctx) {
    await delay(MOCK_LATENCY_MS);
    const all = seedEvents();

    const scoped = all.filter((e) => {
      // BR-008 — financial payment events never reach Membro.
      if (ctx.role === "membro" && e.financial) return false;
      // BR-002 — Membro sees only own-scope + team-wide (shared) events.
      if (ctx.role === "membro" && !e.shared && e.ownerId !== ctx.userId) {
        return false;
      }
      if (ctx.projectId && e.projectId !== ctx.projectId) return false;
      return inRange(e, range);
    });

    // Strip seed-only fields — callers depend on the CalendarEvent contract.
    return scoped
      .map(({ ownerId: _o, shared: _s, financial: _f, ...event }) => {
        void _o;
        void _s;
        void _f;
        return event as CalendarEvent;
      })
      .sort((a, b) => a.start.localeCompare(b.start));
  },
};
