"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { UserPlus, Users, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { CrmField } from "@/components/crm/crm-field";
import { ConfirmDialog, toast } from "@/components/shared";
import { useOwnerOptions } from "@/lib/use-owner-options";
import { projectsApi } from "@/lib/api/projects";
import type { Project, ProjectMember } from "@/lib/api/projects-types";
import { initials } from "./project-format";

/**
 * The project team.
 *
 * It was a list of names with nothing to press: the API client could read
 * members but had no way to add or remove one, so who works on a project was
 * decided somewhere else and only reported here. Assignment is the whole
 * point of a team panel, and it is also what BR-002 keys on — a Membro sees
 * a project because they are on it.
 *
 * Removal keeps their tasks and logged time on the project. Unassigning
 * someone is a statement about who is working on it now, not an instruction
 * to erase what they already did.
 */
export function TeamCard({
  project,
  canManage,
  onChanged,
  className,
}: {
  project: Project;
  canManage: boolean;
  onChanged: () => Promise<void> | void;
  className?: string;
}) {
  const t = useTranslations("projects.overview");
  const tt = useTranslations("projects.team");
  const { options: directory } = useOwnerOptions();

  const [addOpen, setAddOpen] = React.useState(false);
  const [pendingRemove, setPendingRemove] = React.useState<ProjectMember | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [pick, setPick] = React.useState("");
  const [role, setRole] = React.useState("");

  // Only people not already assigned: offering a name that cannot be added is
  // a dead option, and the backend rejects the duplicate anyway.
  const available = React.useMemo(
    () => directory.filter((d) => !project.team.some((m) => m.userId === d.value)),
    [directory, project.team]
  );

  async function add() {
    if (!pick) return;
    setBusy(true);
    try {
      await projectsApi.addMember(project.id, pick, role.trim());
      await onChanged();
      const name = directory.find((d) => d.value === pick)?.label ?? "";
      toast({ tone: "success", title: tt("added", { name }) });
      setAddOpen(false);
      setPick("");
      setRole("");
    } catch {
      toast({ tone: "destructive", title: tt("addFailed") });
    } finally {
      setBusy(false);
    }
  }

  async function remove(member: ProjectMember) {
    setBusy(true);
    try {
      await projectsApi.removeMember(project.id, member.userId);
      await onChanged();
      toast({ tone: "success", title: tt("removed", { name: member.name }) });
    } catch {
      toast({ tone: "destructive", title: tt("removeFailed") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4 text-muted-foreground" strokeWidth={1.8} aria-hidden />
              {t("teamTitle")}
            </CardTitle>
            {canManage ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAddOpen(true)}
                disabled={available.length === 0}
                title={available.length === 0 ? tt("noneLeft") : undefined}
              >
                <UserPlus aria-hidden />
                {tt("add")}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {project.team.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noTeam")}</p>
          ) : (
            <ul className="flex flex-wrap gap-x-6 gap-y-3">
              {project.team.map((m) => (
                <li key={m.userId} className="group/member flex items-center gap-2.5">
                  <Avatar className="size-8">
                    <AvatarFallback className="text-xs">{initials(m.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">{m.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.userId === project.managerId ? t("managerLabel") : m.roleLabel}
                    </p>
                  </div>
                  {/* The manager is not removable here: they are set on the
                      project itself, so removing them from the roster would
                      leave the field pointing at someone who is not on it. */}
                  {canManage && m.userId !== project.managerId ? (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="opacity-0 transition-opacity group-hover/member:opacity-100 focus-visible:opacity-100"
                      aria-label={tt("remove")}
                      title={tt("remove")}
                      disabled={busy}
                      onClick={() => setPendingRemove(m)}
                    >
                      <X aria-hidden />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={(o) => !busy && setAddOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader
            icon={UserPlus}
            title={tt("addTitle")}
            description={tt("addSubtitle")}
          />
          <DialogBody className="flex flex-col gap-4">
            <CrmField label={tt("person")} required>
              {({ controlProps }) => (
                <select
                  {...controlProps}
                  value={pick}
                  onChange={(e) => setPick(e.target.value)}
                  className="glass-field h-10 w-full rounded-xl px-3 text-sm outline-none"
                >
                  <option value="">—</option>
                  {available.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </CrmField>
            <CrmField label={tt("roleLabel")}>
              {({ controlProps }) => (
                <Input
                  {...controlProps}
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder={tt("rolePlaceholder")}
                />
              )}
            </CrmField>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              size="lg"
              disabled={busy}
              onClick={() => setAddOpen(false)}
            >
              {tt("cancel")}
            </Button>
            <Button size="lg" disabled={busy || !pick} onClick={() => void add()}>
              {busy ? tt("adding") : tt("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingRemove !== null}
        onOpenChange={(o) => !o && setPendingRemove(null)}
        title={pendingRemove ? tt("removeConfirm", { name: pendingRemove.name }) : ""}
        description={tt("removeBody")}
        confirmLabel={tt("remove")}
        variant="destructive"
        onConfirm={async () => {
          if (pendingRemove) await remove(pendingRemove);
          setPendingRemove(null);
        }}
      />
    </>
  );
}
