/**
 * Formatting helpers for the time-tracking surface (F11).
 *
 * Hours render `pt-PT` style (`1,5 h`) and datetimes `dd/mm/yyyy HH:MM`, per
 * DESIGN.md. Durations are stored in minutes; these helpers take minutes. Pass
 * the active locale (from next-intl `useLocale()`) so components render
 * correctly under any resolved locale.
 */

/** Minutes → decimal hours (e.g. 95 → 1.5833…). */
export function minutesToHours(minutes: number): number {
  return minutes / 60;
}

/** Format minutes as localized decimal hours with an `h` suffix (`1,6 h`). */
export function formatHours(minutes: number, locale: string): string {
  const hours = minutes / 60;
  const n = new Intl.NumberFormat(locale, {
    minimumFractionDigits: hours % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(hours);
  return `${n} h`;
}

/** Format minutes as compact `H:MM` clock form (`1:35`). */
export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** Format an ISO datetime as `dd/mm/yyyy HH:MM`. */
export function formatDateTime(isoDate: string, locale: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Format an ISO datetime as a short `dd/mm HH:MM` (dense tables). */
export function formatDateShort(isoDate: string, locale: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/**
 * Value for a `datetime-local` input (`yyyy-MM-ddTHH:mm`) from a Date, using
 * LOCAL time components (never UTC — the input is wall-clock).
 */
export function toDateTimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** ISO string from a `datetime-local` value (interpreted as local time). */
export function fromDateTimeLocalValue(value: string): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

/** Utilisation ratio (used hours / budget hours), clamped to a display max. */
export function utilisation(usedMinutes: number, budgetHours: number | null): number | null {
  if (budgetHours == null || budgetHours <= 0) return null;
  return usedMinutes / 60 / budgetHours;
}
