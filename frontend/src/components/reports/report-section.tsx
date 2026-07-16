"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Download, Inbox } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared";
import { cn } from "@/lib/utils";
import { buildCsv, csvFilename, downloadCsv, type CsvCell } from "./csv";

export interface ReportCsv {
  /** Localized header labels. */
  headers: string[];
  /** Body rows (already-formatted display strings, matching the table). */
  rows: CsvCell[][];
  /** Stem used to name the file (usually the report title). */
  filenameStem: string;
  /** Snapshot timestamp, for the filename date. */
  generatedAt: string;
}

export interface ReportSectionProps {
  title: string;
  description?: string;
  /** CSV export payload — the button is hidden when omitted or has no rows. */
  csv?: ReportCsv;
  /** When true, renders the empty state instead of children. */
  empty?: boolean;
  emptyLabel?: string;
  className?: string;
  /** Spans two columns on the xl grid. */
  wide?: boolean;
  children: React.ReactNode;
}

/**
 * The wrapper every report is rendered in: an editorial card with a title,
 * optional description and a per-report CSV export button. Keeps CSV export
 * uniform across chart-based and table-based reports (F19 requirement).
 */
export function ReportSection({
  title,
  description,
  csv,
  empty,
  emptyLabel,
  className,
  wide,
  children,
}: ReportSectionProps) {
  const t = useTranslations("reports");
  const canExport = !!csv && csv.rows.length > 0;

  const handleExport = React.useCallback(() => {
    if (!csv) return;
    const doc = buildCsv(csv.headers, csv.rows);
    downloadCsv(csvFilename(csv.filenameStem, csv.generatedAt), doc);
  }, [csv]);

  return (
    <Card className={cn("gap-4", wide && "xl:col-span-2", className)}>
      <CardHeader>
        <CardTitle className="font-heading text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {csv ? (
          <CardAction>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={!canExport}
              aria-label={t("export.ariaLabel", { report: title })}
            >
              <Download aria-hidden />
              {t("export.label")}
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {empty ? (
          <EmptyState
            icon={Inbox}
            variant="bare"
            title={emptyLabel ?? t("empty.title")}
            description={t("empty.description")}
          />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
