import * as React from "react";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { canAccessSettings } from "@/lib/api/settings-types";
import { SettingsLayoutClient } from "@/components/settings";

/**
 * /settings layout (F20 / issue #42). Wraps every settings section with the
 * shared SettingsNav. Access is Admin + Gestor (Gestor is limited to templates
 * + personal preferences); a Membro is blocked entirely — own profile is #43,
 * separate (BR-004). Individual admin-only sections re-gate defensively.
 */
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session || !canAccessSettings(session.role)) notFound();
  return <SettingsLayoutClient role={session.role}>{children}</SettingsLayoutClient>;
}
