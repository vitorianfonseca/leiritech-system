"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { UserPlus, MailPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { toast } from "@/components/shared";
import { settingsApi } from "@/lib/api/settings";
import { SettingsError } from "@/lib/api/settings-types";
import type { Role } from "@/lib/session";
import { InviteMemberDialog, type InviteMemberValues } from "./invite-member-dialog";

export interface InviteMemberViewProps {
  role: Role;
  invitesGrant: boolean;
}

/**
 * Invite-only surface (BR-003 / §3). Reachable by an Admin or a Gestor holding
 * the invites grant WITHOUT exposing the full member directory or role
 * management (those stay Admin-only — BR-004/005). It reuses the shared
 * InviteMemberDialog and gates the write through `settingsApi.inviteMember`.
 */
export function InviteMemberView({ role, invitesGrant }: InviteMemberViewProps) {
  const t = useTranslations("settings.members.inviteSurface");
  const tErr = useTranslations("settings.members.errors");

  const [open, setOpen] = React.useState(false);
  const [serverErrorKey, setServerErrorKey] = React.useState<string | null>(null);

  async function handleInvite(values: InviteMemberValues) {
    try {
      const member = await settingsApi.inviteMember(role, invitesGrant, values);
      toast({ tone: "success", title: t("invited", { email: member.email }) });
      setOpen(false);
    } catch (err) {
      if (err instanceof SettingsError && err.detailKey) {
        setServerErrorKey(err.detailKey);
        return;
      }
      toast({ tone: "destructive", title: tErr("saveFailed") });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-12 text-center shadow-sm">
        <span className="flex size-14 items-center justify-center rounded-full bg-signal-muted text-signal">
          <MailPlus className="size-7" strokeWidth={1.6} aria-hidden />
        </span>
        <div className="max-w-md space-y-1.5">
          <h2 className="font-heading text-lg font-semibold text-foreground">{t("cardTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("cardDescription")}</p>
        </div>
        <Button size="lg" onClick={() => { setServerErrorKey(null); setOpen(true); }}>
          <UserPlus aria-hidden />
          {t("action")}
        </Button>
      </div>

      <InviteMemberDialog
        open={open}
        onOpenChange={setOpen}
        onSubmit={handleInvite}
        serverErrorKey={serverErrorKey}
        onClearServerError={() => setServerErrorKey(null)}
      />
    </div>
  );
}
