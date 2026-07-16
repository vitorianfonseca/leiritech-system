"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Plus,
  GitBranch,
  Building2,
  Users,
  FolderKanban,
  ListChecks,
  Clock,
} from "lucide-react";
import type { SessionUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

export function QuickCreate({ user }: { user: SessionUser }) {
  const t = useTranslations("shell.quickCreate");
  const isManager = user.role === "admin" || user.role === "gestor";

  const items = [
    isManager && { key: "opportunity", href: "/crm/pipeline", icon: GitBranch },
    isManager && { key: "company", href: "/crm/companies/new", icon: Building2 },
    isManager && { key: "contact", href: "/crm/contacts", icon: Users },
    isManager && { key: "project", href: "/projects/new", icon: FolderKanban },
    { key: "task", href: "/tasks", icon: ListChecks },
    { key: "timeEntry", href: "/my-work", icon: Clock },
  ].filter(Boolean) as { key: string; href: string; icon: typeof Plus }[];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button size="sm" aria-label={t("label")} />}
      >
        <Plus />
        <span className="hidden sm:inline">{t("label")}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel>{t("label")}</DropdownMenuLabel>
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem key={item.key} render={<Link href={item.href} />}>
              <Icon />
              {t(item.key)}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
