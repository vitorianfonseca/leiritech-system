"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Archive,
  AlertTriangle,
  FolderKanban,
  GitBranch,
  Trophy,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toastWithUndo } from "@/components/shared";
import { crmApi } from "@/lib/api/crm";
import { CrmError, type ArchiveBlocker } from "@/lib/api/crm-types";

export interface ArchiveCompanyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: { id: string; name: string } | null;
  actorId: string;
  /** Called after a successful archive or a successful undo (restore). */
  onChanged: () => void;
}

const BLOCKER_ICON: Record<ArchiveBlocker["kind"], LucideIcon> = {
  liveProject: FolderKanban,
  openOpportunity: GitBranch,
  wonUnconvertedOpportunity: Trophy,
};

/**
 * Archive a company (BR-060 — soft only, never hard-delete). Before archiving
 * succeeds the client checks BR-062/H6 guards; if a live project, open
 * opportunity or unconverted won opportunity exists, the dialog switches to a
 * "blocked" state listing exactly what must be resolved first. A successful
 * archive fires a Toast with Undo (restore).
 */
export function ArchiveCompanyDialog({
  open,
  onOpenChange,
  company,
  actorId,
  onChanged,
}: ArchiveCompanyDialogProps) {
  const t = useTranslations("crm.archive");
  const [pending, setPending] = React.useState(false);
  // Scope the blocked state to a company id so a new target automatically shows
  // the confirm step again — no reset-in-effect needed.
  const [blockedFor, setBlockedFor] = React.useState<{
    id: string;
    blockers: ArchiveBlocker[];
  } | null>(null);

  const blockers =
    blockedFor && company && blockedFor.id === company.id ? blockedFor.blockers : null;

  async function handleArchive() {
    if (!company) return;
    setPending(true);
    try {
      await crmApi.archiveCompany(company.id, actorId);
      onChanged();
      onOpenChange(false);
      toastWithUndo({
        tone: "default",
        title: t("archivedToast", { name: company.name }),
        onUndo: async () => {
          await crmApi.restoreCompany(company.id, actorId);
          onChanged();
        },
      });
    } catch (error) {
      if (error instanceof CrmError && error.code === "archive_blocked") {
        setBlockedFor({ id: company.id, blockers: error.blockers });
      } else {
        throw error;
      }
    } finally {
      setPending(false);
    }
  }

  const groups = React.useMemo(() => {
    const map = new Map<ArchiveBlocker["kind"], ArchiveBlocker[]>();
    for (const b of blockers ?? []) {
      const list = map.get(b.kind) ?? [];
      list.push(b);
      map.set(b.kind, list);
    }
    return [...map.entries()];
  }, [blockers]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        {blockers ? (
          <>
            <DialogHeader
              icon={AlertTriangle}
              tone="warning"
              title={t("blockedTitle")}
              description={t("blockedDescription", { name: company?.name ?? "" })}
            />
            <DialogBody>
              <ul className="space-y-3">
              {groups.map(([kind, items]) => {
                const Icon = BLOCKER_ICON[kind];
                return (
                  <li key={kind} className="rounded-lg border border-border bg-muted p-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <Icon className="size-3.5" strokeWidth={1.8} aria-hidden />
                      {t(`blocker.${kind}`)}
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {items.map((b, i) => (
                        <li key={i} className="text-sm text-foreground">
                          {b.label}
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
              </ul>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
                {t("understood")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader
              icon={Archive}
              tone="neutral"
              title={t("confirmTitle")}
              description={t("confirmDescription", { name: company?.name ?? "" })}
            />
            <DialogFooter>
              <Button
                variant="outline"
                size="lg"
                disabled={pending}
                onClick={() => onOpenChange(false)}
              >
                {t("cancel")}
              </Button>
              <Button size="lg" disabled={pending} onClick={handleArchive}>
                {pending ? t("archiving") : t("confirm")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
