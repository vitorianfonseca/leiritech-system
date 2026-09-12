"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Check, Minus, KeyRound, UserRound, ShieldCheck, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shell/page-header";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/session";

type Level = "full" | "scoped" | "grant" | "none";

const ROLES: Role[] = ["admin", "gestor", "membro"];

const CAPABILITIES: { key: string; levels: Record<Role, Level> }[] = [
  { key: "crm", levels: { admin: "full", gestor: "full", membro: "scoped" } },
  { key: "pipeline", levels: { admin: "full", gestor: "full", membro: "none" } },
  { key: "projects", levels: { admin: "full", gestor: "full", membro: "scoped" } },
  { key: "tasks", levels: { admin: "full", gestor: "full", membro: "scoped" } },
  { key: "time", levels: { admin: "full", gestor: "scoped", membro: "scoped" } },
  { key: "financial", levels: { admin: "full", gestor: "grant", membro: "none" } },
  { key: "team", levels: { admin: "full", gestor: "full", membro: "scoped" } },
  { key: "reports", levels: { admin: "full", gestor: "scoped", membro: "scoped" } },
  { key: "settings", levels: { admin: "full", gestor: "grant", membro: "none" } },
];

const roleIcon: Record<Role, typeof ShieldCheck> = {
  admin: ShieldCheck,
  gestor: KeyRound,
  membro: UserRound,
};

export function RolesSettingsView() {
  const t = useTranslations("settings.roles");
  const tRole = useTranslations("roles");

  return (
    <div className="space-y-8">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <div className="grid gap-3 sm:grid-cols-3">
        {ROLES.map((role) => {
          const Icon = roleIcon[role];
          return (
            <div key={role} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-signal-muted text-signal">
                  <Icon className="size-4" strokeWidth={1.8} aria-hidden />
                </span>
                <h2 className="font-heading text-base font-semibold text-foreground">{tRole(role)}</h2>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{t(`summary.${role}`)}</p>
            </div>
          );
        })}
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-signal" aria-hidden />
        <p>{t("notice")}</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[34rem] caption-bottom text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("matrix.capability")}
              </th>
              {ROLES.map((role) => (
                <th
                  key={role}
                  scope="col"
                  className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {tRole(role)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CAPABILITIES.map((cap) => (
              <tr key={cap.key} className="border-b border-border last:border-0">
                <th scope="row" className="px-4 py-3 text-left font-medium text-foreground">
                  {t(`capabilities.${cap.key}`)}
                </th>
                {ROLES.map((role) => (
                  <td key={role} className="px-4 py-3 text-center">
                    <LevelCell level={cap.levels[role]} label={t(`levels.${cap.levels[role]}`)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
        {(["full", "scoped", "grant", "none"] as Level[]).map((level) => (
          <span key={level} className="inline-flex items-center gap-1.5">
            <LevelGlyph level={level} />
            {t(`levels.${level}`)}
          </span>
        ))}
      </div>
    </div>
  );
}

function LevelGlyph({ level }: { level: Level }) {
  switch (level) {
    case "full":
      return <Check className="size-4 text-success" strokeWidth={2.4} aria-hidden />;
    case "scoped":
      return <UserRound className="size-4 text-info" strokeWidth={1.8} aria-hidden />;
    case "grant":
      return <KeyRound className="size-4 text-warning-foreground" strokeWidth={1.8} aria-hidden />;
    case "none":
      return <Minus className="size-4 text-muted-foreground" strokeWidth={1.8} aria-hidden />;
  }
}

function LevelCell({ level, label }: { level: Level; label: string }) {
  const variant =
    level === "full" ? "success" : level === "scoped" ? "info" : level === "grant" ? "warning" : "outline";
  return (
    <Badge variant={variant} className={cn(level === "none" && "text-muted-foreground")}>
      <LevelGlyph level={level} />
      <span className="hidden sm:inline">{label}</span>
    </Badge>
  );
}
