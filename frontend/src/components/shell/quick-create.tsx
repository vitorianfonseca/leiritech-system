"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
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
import { ContactFormDialog } from "@/components/crm";
import { toast } from "@/components/shared";
import { crmApi, crmRoutes } from "@/lib/api/crm";
import type { ContactInput } from "@/lib/api/crm-types";

type QuickCreateItem =
  | { key: string; icon: typeof Plus; href: string; onSelect?: undefined }
  | { key: string; icon: typeof Plus; href?: undefined; onSelect: () => void };

export function QuickCreate({ user }: { user: SessionUser }) {
  const t = useTranslations("shell.quickCreate");
  const tContacts = useTranslations("crm.contacts");
  const router = useRouter();
  const qc = useQueryClient();
  const isManager = user.role === "admin" || user.role === "gestor";

  // H9 fix: "Novo contacto" used to link to the read-only contacts list — it
  // now opens the real create dialog, same as the CRM contacts page.
  const [contactOpen, setContactOpen] = React.useState(false);

  const items: QuickCreateItem[] = [
    isManager && { key: "opportunity", href: "/crm/pipeline", icon: GitBranch },
    isManager && { key: "company", href: "/crm/companies/new", icon: Building2 },
    isManager && { key: "contact", icon: Users, onSelect: () => setContactOpen(true) },
    isManager && { key: "project", href: "/projects/new", icon: FolderKanban },
    { key: "task", href: "/tasks", icon: ListChecks },
    { key: "timeEntry", href: "/my-work", icon: Clock },
  ].filter(Boolean) as QuickCreateItem[];

  async function handleCreateContact(input: ContactInput) {
    const created = await crmApi.createContact(input, user.id);
    qc.invalidateQueries({ queryKey: ["crm"] });
    toast({ tone: "success", title: tContacts("toasts.created", { name: created.name }) });
    router.push(crmRoutes.contact(created.id));
  }

  return (
    <>
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
            return item.href ? (
              <DropdownMenuItem key={item.key} render={<Link href={item.href} />}>
                <Icon />
                {t(item.key)}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem key={item.key} onClick={item.onSelect}>
                <Icon />
                {t(item.key)}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {isManager ? (
        <ContactFormDialog
          open={contactOpen}
          onOpenChange={setContactOpen}
          contact={null}
          user={{ role: user.role, userId: user.id, paymentsGrant: user.paymentsGrant }}
          onSubmit={handleCreateContact}
        />
      ) : null}
    </>
  );
}
