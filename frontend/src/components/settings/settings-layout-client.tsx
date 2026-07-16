"use client";

import * as React from "react";
import type { Role } from "@/lib/session";
import { SettingsNav } from "./settings-nav";

export interface SettingsLayoutClientProps {
  role: Role;
  children: React.ReactNode;
}

/**
 * Two-column settings shell: a sticky section nav (collapses to a dropdown on
 * mobile) beside the active section's content.
 */
export function SettingsLayoutClient({ role, children }: SettingsLayoutClientProps) {
  return (
    <div className="grid gap-6 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="md:sticky md:top-20 md:self-start">
        <SettingsNav role={role} />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
