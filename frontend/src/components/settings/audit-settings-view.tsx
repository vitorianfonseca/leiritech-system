"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Bug } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shell/page-header";
import { GithubIssuesPanel } from "@/components/shared";
import { AUDIT_FINDINGS, type AuditFinding } from "@/lib/audit/findings";

function severityVariant(severity: AuditFinding["severity"]) {
  return severity === "critical" ? "destructive" : "warning";
}

/**
 * Internal review area for the forge-audit findings (see /AUDIT_REPORT.md).
 * File and track real GitHub issues for any finding without leaving the app
 * — the same GithubIssuesPanel used on a Project's Overview tab, scoped here
 * to `entityType="audit_finding"`.
 */
export function AuditSettingsView() {
  const t = useTranslations("settings.audit");
  const [selected, setSelected] = React.useState<AuditFinding | null>(null);

  const open = AUDIT_FINDINGS.filter((f) => !f.fixed);
  const fixed = AUDIT_FINDINGS.filter((f) => f.fixed);

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="font-heading text-base font-semibold text-foreground">
          {t("openTitle", { count: open.length })}
        </h2>
        <div className="mt-3 divide-y divide-border">
          {open.map((finding) => (
            <FindingRow key={finding.code} finding={finding} onOpen={() => setSelected(finding)} />
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="font-heading text-base font-semibold text-foreground">
          {t("fixedTitle", { count: fixed.length })}
        </h2>
        <div className="mt-3 divide-y divide-border">
          {fixed.map((finding) => (
            <FindingRow key={finding.code} finding={finding} onOpen={() => setSelected(finding)} />
          ))}
        </div>
      </section>

      <Dialog open={selected !== null} onOpenChange={(next) => !next && setSelected(null)}>
        <DialogContent className="max-w-2xl p-6">
          {selected ? (
            <>
              <div className="space-y-1.5">
                <DialogTitle className="flex items-center gap-2">
                  <Badge variant={severityVariant(selected.severity)}>
                    {selected.severity.toUpperCase()}
                  </Badge>
                  {selected.code}
                </DialogTitle>
                <DialogDescription>{selected.summary}</DialogDescription>
              </div>
              <div className="mt-5">
                <GithubIssuesPanel
                  entityType="audit_finding"
                  entityId={selected.code}
                  canCreate
                  titlePrefix={`[${selected.code}] `}
                  labels={["audit", selected.severity]}
                />
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FindingRow({ finding, onOpen }: { finding: AuditFinding; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-start gap-3 py-3 text-left outline-none first:pt-0 last:pb-0 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Badge variant={severityVariant(finding.severity)} className="mt-0.5 shrink-0">
        {finding.code}
      </Badge>
      <span className="flex items-start gap-2 text-sm text-foreground">
        <Bug className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden />
        {finding.summary}
      </span>
    </button>
  );
}
