"use client";

import * as React from "react";
import { useTranslations, useFormatter } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  UserPlus,
  ChevronDown,
  UserCheck,
  UserX,
  ShieldCheck,
  TriangleAlert,
  RefreshCw,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/shell/page-header";
import {
  SmartTable,
  EmptyState,
  ConfirmDialog,
  toast,
  toastWithUndo,
  type SmartTableColumn,
} from "@/components/shared";
import { settingsApi } from "@/lib/api/settings";
import {
  SettingsError,
  type MemberRecord,
  type MemberStatus,
} from "@/lib/api/settings-types";
import type { Role } from "@/lib/session";
import { InviteMemberDialog, type InviteMemberValues } from "./invite-member-dialog";

export interface MembersSettingsViewProps {
  role: Role;
  invitesGrant: boolean;
}

const MEMBERS_KEY = ["settings-members"] as const;
const ROLE_OPTIONS: Role[] = ["admin", "gestor", "membro"];

function roleBadgeVariant(role: Role): "signal" | "info" | "outline" {
  return role === "admin" ? "signal" : role === "gestor" ? "info" : "outline";
}
function statusBadgeVariant(status: MemberStatus): "success" | "warning" | "done" {
  return status === "active" ? "success" : status === "invited" ? "warning" : "done";
}

export function MembersSettingsView({ role, invitesGrant }: MembersSettingsViewProps) {
  const t = useTranslations("settings.members");
  const tRole = useTranslations("roles");
  const tErr = useTranslations("settings.members.errors");
  const format = useFormatter();
  const qc = useQueryClient();

  const query = useQuery({ queryKey: MEMBERS_KEY, queryFn: () => settingsApi.getMembers(role) });

  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [serverErrorKey, setServerErrorKey] = React.useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [target, setTarget] = React.useState<MemberRecord | null>(null);

  const refresh = React.useCallback(
    () => qc.invalidateQueries({ queryKey: MEMBERS_KEY }),
    [qc]
  );

  const members = query.data?.members ?? [];
  const activeAdminCount = query.data?.activeAdminCount ?? 0;

  /** BR-005 — the member is the last active admin (can't demote/deactivate). */
  const isLastAdmin = React.useCallback(
    (m: MemberRecord) => m.role === "admin" && m.status === "active" && activeAdminCount <= 1,
    [activeAdminCount]
  );

  async function handleInvite(values: InviteMemberValues) {
    try {
      const member = await settingsApi.inviteMember(role, invitesGrant, values);
      await refresh();
      toast({ tone: "success", title: t("invited", { email: member.email }) });
      setInviteOpen(false);
    } catch (err) {
      if (err instanceof SettingsError && err.detailKey) {
        setServerErrorKey(err.detailKey);
        return;
      }
      toast({ tone: "destructive", title: tErr("saveFailed") });
    }
  }

  async function handleRoleChange(member: MemberRecord, nextRole: Role) {
    if (member.role === nextRole) return;
    try {
      await settingsApi.updateMemberRole(role, { id: member.id, role: nextRole });
      await refresh();
      toast({
        tone: "success",
        title: t("roleChanged", { name: member.name, role: tRole(nextRole) }),
      });
    } catch (err) {
      if (err instanceof SettingsError && err.code === "last_admin") {
        toast({ tone: "warning", title: tErr("lastAdminTitle"), description: tErr("lastAdmin") });
        return;
      }
      toast({ tone: "destructive", title: tErr("saveFailed") });
    }
  }

  async function activate(member: MemberRecord) {
    try {
      await settingsApi.setMemberStatus(role, member.id, true);
      await refresh();
      toast({ tone: "success", title: t("activated", { name: member.name }) });
    } catch {
      toast({ tone: "destructive", title: tErr("saveFailed") });
    }
  }

  function requestDeactivate(member: MemberRecord) {
    setTarget(member);
    setConfirmOpen(true);
  }

  async function handleDeactivate() {
    if (!target) return;
    const member = target;
    try {
      await settingsApi.setMemberStatus(role, member.id, false);
      await refresh();
      toastWithUndo({
        tone: "warning",
        title: t("deactivated", { name: member.name }),
        onUndo: async () => {
          await settingsApi.setMemberStatus(role, member.id, true);
          await refresh();
          toast({ tone: "success", title: t("activated", { name: member.name }) });
        },
      });
    } catch (err) {
      if (err instanceof SettingsError && err.code === "last_admin") {
        toast({ tone: "warning", title: tErr("lastAdminTitle"), description: tErr("lastAdmin") });
        return;
      }
      toast({ tone: "destructive", title: tErr("saveFailed") });
    }
  }

  const columns: SmartTableColumn<MemberRecord>[] = [
    {
      id: "name",
      header: t("columns.name"),
      accessor: (r) => r.name,
      sortable: true,
      cardPriority: 0,
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{r.name}</p>
          <p className="truncate text-xs text-muted-foreground">{r.email}</p>
        </div>
      ),
    },
    {
      id: "role",
      header: t("columns.role"),
      accessor: (r) => r.role,
      filterOptions: ROLE_OPTIONS.map((r) => ({ label: tRole(r), value: r })),
      cardPriority: 1,
      cell: (r) => {
        const lastAdmin = isLastAdmin(r);
        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="sm" className="gap-1 px-2">
                  <Badge variant={roleBadgeVariant(r.role)}>{tRole(r.role)}</Badge>
                  <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
                </Button>
              }
            />
            <DropdownMenuContent align="start">
              {ROLE_OPTIONS.map((option) => {
                const disabled = lastAdmin && option !== "admin";
                return (
                  <DropdownMenuItem
                    key={option}
                    disabled={disabled}
                    onClick={() => handleRoleChange(r, option)}
                  >
                    {option === r.role ? (
                      <ShieldCheck aria-hidden />
                    ) : (
                      <span className="size-4" aria-hidden />
                    )}
                    {tRole(option)}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
    {
      id: "status",
      header: t("columns.status"),
      accessor: (r) => r.status,
      filterOptions: (["active", "invited", "inactive"] as MemberStatus[]).map((s) => ({
        label: t(`status.${s}`),
        value: s,
      })),
      cardPriority: 2,
      cell: (r) => <Badge variant={statusBadgeVariant(r.status)}>{t(`status.${r.status}`)}</Badge>,
    },
    {
      id: "lastActive",
      header: t("columns.lastActive"),
      accessor: (r) => r.lastActiveAt ?? "",
      sortable: true,
      align: "right",
      defaultHidden: true,
      cell: (r) =>
        r.lastActiveAt ? (
          <span className="text-sm tabular-nums text-muted-foreground">
            {format.dateTime(new Date(r.lastActiveAt), { day: "2-digit", month: "2-digit", year: "numeric" })}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Button onClick={() => { setServerErrorKey(null); setInviteOpen(true); }}>
            <UserPlus aria-hidden />
            <span className="hidden sm:inline">{t("inviteAction")}</span>
            <span className="sm:hidden">{t("inviteShort")}</span>
          </Button>
        }
      />

      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-signal" aria-hidden />
        <p>{t("lastAdminNotice")}</p>
      </div>

      {query.isError ? (
        <EmptyState
          icon={TriangleAlert}
          title={tErr("loadTitle")}
          description={tErr("loadDescription")}
          action={
            <Button variant="outline" size="lg" onClick={() => query.refetch()}>
              <RefreshCw aria-hidden />
              {tErr("retry")}
            </Button>
          }
        />
      ) : (
        <SmartTable
          data={members}
          columns={columns}
          getRowId={(r) => r.id}
          loading={query.isLoading}
          searchPlaceholder={t("searchPlaceholder")}
          emptyTitle={t("emptyTitle")}
          emptyDescription={t("emptyDescription")}
          rowActions={(row) =>
            row.status === "inactive"
              ? [{ label: t("actions.activate"), icon: UserCheck, onSelect: () => activate(row) }]
              : [
                  {
                    label: t("actions.deactivate"),
                    icon: UserX,
                    variant: "destructive",
                    onSelect: () => requestDeactivate(row),
                    disabled: () => isLastAdmin(row),
                  },
                ]
          }
        />
      )}

      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onSubmit={handleInvite}
        serverErrorKey={serverErrorKey}
        onClearServerError={() => setServerErrorKey(null)}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        variant="destructive"
        title={t("deactivateConfirm.title")}
        description={t("deactivateConfirm.description", { name: target?.name ?? "" })}
        confirmLabel={t("actions.deactivate")}
        onConfirm={handleDeactivate}
      />
    </div>
  );
}
