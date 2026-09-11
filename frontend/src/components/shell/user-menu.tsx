"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { User, Settings, LogOut, ChevronDown } from "lucide-react";
import type { SessionUser } from "@/lib/session";
import { useLogout } from "@/lib/hooks/use-logout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function UserMenu({ user }: { user: SessionUser }) {
  const t = useTranslations("shell.userMenu");
  const tr = useTranslations("roles");
  const { logout, pending } = useLogout();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/40"
        aria-label={user.name}
      >
        <Avatar className="size-8">
          {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
          <AvatarFallback>{initials(user.name)}</AvatarFallback>
        </Avatar>
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-60">
        <div className="flex items-center gap-3 p-2">
          <Avatar className="size-9">
            {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
            <AvatarFallback>{initials(user.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <div className="px-2 pb-2">
          <Badge variant="gold">{tr(user.role)}</Badge>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/profile" />}>
          <User />
          {t("profile")}
        </DropdownMenuItem>
        {user.role === "admin" && (
          <DropdownMenuItem render={<Link href="/settings" />}>
            <Settings />
            {t("settings")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={pending}
          onClick={() => void logout()}
        >
          <LogOut />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
