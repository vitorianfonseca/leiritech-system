"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { DetailSidePanel, CommentThread } from "@/components/shared";
import type { CommentThreadCurrentUser } from "@/components/shared";
import type { CollaborationEntityType } from "@/lib/api/collaboration-types";

export type DetailTab = "details" | "comments";

export interface DetailTarget {
  title: string;
  subtitle?: string;
  entityType: CollaborationEntityType;
  entityId: string;
  /** Extra content rendered in the Details tab (task facts, project stats…). */
  details?: React.ReactNode;
}

export interface EntityDetailPanelProps {
  target: DetailTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab: DetailTab;
  currentUser: CommentThreadCurrentUser;
}

/**
 * Slide-over detail for any hub item, reusing the shared DetailSidePanel and
 * CommentThread. Two tabs — Details and Comments — so inline "comment" and
 * "open" actions land on the right view. The thread is entity-agnostic, so the
 * same panel serves tasks, projects and mentions.
 */
export function EntityDetailPanel({
  target,
  open,
  onOpenChange,
  initialTab,
  currentUser,
}: EntityDetailPanelProps) {
  const t = useTranslations("myWork");
  const [tab, setTab] = React.useState<DetailTab>(initialTab);

  // Reset the active tab when a new target/tab is opened — done during render
  // (React's "adjust state on prop change" pattern) rather than in an effect.
  const openKey = `${open ? "1" : "0"}:${target?.entityType ?? ""}:${
    target?.entityId ?? ""
  }:${initialTab}`;
  const [lastOpenKey, setLastOpenKey] = React.useState(openKey);
  if (openKey !== lastOpenKey) {
    setLastOpenKey(openKey);
    setTab(initialTab);
  }

  const tabs = (
    <div role="tablist" aria-label={t("detail.tabsLabel")} className="flex gap-1 py-2">
      {(["details", "comments"] as const).map((key) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={tab === key}
          onClick={() => setTab(key)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            tab === key
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t(`detail.${key}`)}
        </button>
      ))}
    </div>
  );

  return (
    <DetailSidePanel
      open={open}
      onOpenChange={onOpenChange}
      title={target?.title}
      description={target?.subtitle}
      tabs={target ? tabs : undefined}
    >
      {target ? (
        tab === "details" ? (
          <div className="space-y-4">
            {target.details ?? (
              <p className="text-sm text-muted-foreground">{t("detail.noDetails")}</p>
            )}
          </div>
        ) : (
          <CommentThread
            entityType={target.entityType}
            entityId={target.entityId}
            currentUser={currentUser}
          />
        )
      ) : null}
    </DetailSidePanel>
  );
}
