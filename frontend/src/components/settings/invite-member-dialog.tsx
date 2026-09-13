"use client";

import * as React from "react";
import { UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/session";

const ROLE_OPTIONS: Role[] = ["admin", "gestor", "membro"];

export interface InviteMemberValues {
  email: string;
  role: Role;
}

export interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: InviteMemberValues) => Promise<void>;
  serverErrorKey?: string | null;
  onClearServerError?: () => void;
}

export function InviteMemberDialog({
  open,
  onOpenChange,
  onSubmit,
  serverErrorKey,
  onClearServerError,
}: InviteMemberDialogProps) {
  const t = useTranslations("settings.members.invite");
  const tRole = useTranslations("roles");
  const tErr = useTranslations("settings.members.errors");
  const emailId = React.useId();

  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Role>("membro");
  const [pending, setPending] = React.useState(false);
  const [showErrors, setShowErrors] = React.useState(false);

  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setEmail("");
      setRole("membro");
      setShowErrors(false);
    }
  }

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    if (!emailValid) return;
    try {
      setPending(true);
      await onSubmit({ email: email.trim(), role });
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader
          icon={UserPlus}
          title={t("title")}
          description={t("description")}
        />
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={emailId}>{t("fields.email")}</Label>
              <Input
                id={emailId}
                type="email"
                value={email}
                autoFocus
                placeholder="nome@leiritech.pt"
                onChange={(e) => {
                  setEmail(e.target.value);
                  onClearServerError?.();
                }}
                aria-invalid={(showErrors && !emailValid) || Boolean(serverErrorKey)}
              />
              {showErrors && !emailValid ? (
                <p role="alert" className="text-xs text-destructive">
                  {tErr("emailInvalid")}
                </p>
              ) : serverErrorKey ? (
                <p role="alert" className="text-xs text-destructive">
                  {tErr(serverErrorKey)}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>{t("fields.role")}</Label>
              <div role="radiogroup" aria-label={t("fields.role")} className="grid grid-cols-3 gap-2">
                {ROLE_OPTIONS.map((option) => {
                  const active = option === role;
                  return (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setRole(option)}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                        active
                          ? "border-signal bg-signal-muted text-signal"
                          : "border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {tRole(option)}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">{t(`roleHint.${role}`)}</p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? t("sending") : t("send")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
