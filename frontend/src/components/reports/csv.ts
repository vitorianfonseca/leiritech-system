/**
 * Client-side CSV generation for the reports surface (F19).
 *
 * The CSV mirrors the on-screen table: the caller passes the already-formatted
 * cell strings so the export matches exactly what the user sees. The pt-PT/EUR
 * convention uses a comma decimal separator, which collides with a comma field
 * delimiter — so we use a SEMICOLON delimiter (the pt-PT Excel default) and
 * still quote any field that contains the delimiter, a quote or a newline. A
 * UTF-8 BOM is prepended so Excel renders accented characters correctly.
 */

export type CsvCell = string | number | null | undefined;

const DELIMITER = ";";
const BOM = "﻿";

// CSV formula-injection guard (OWASP): a cell beginning with =, +, -, @, tab or
// carriage return can be executed as a formula by Excel/Sheets. Neutralise it by
// prefixing a single quote so spreadsheets treat it as literal text.
const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;

function escapeCell(cell: CsvCell): string {
  let value = cell == null ? "" : String(cell);
  if (FORMULA_TRIGGERS.test(value)) {
    value = `'${value}`;
  }
  if (
    value.includes(DELIMITER) ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Build a CSV document string from a header row + body rows. */
export function buildCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(DELIMITER));
  return BOM + lines.join("\r\n");
}

/** Slugify a report title into a safe filename stem. */
export function csvFilename(stem: string, generatedAt: string): string {
  const slug = stem
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const day = generatedAt.slice(0, 10);
  return `leiritech-${slug}-${day}.csv`;
}

/** Trigger a browser download of a CSV document. No-op outside the browser. */
export function downloadCsv(filename: string, csv: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
