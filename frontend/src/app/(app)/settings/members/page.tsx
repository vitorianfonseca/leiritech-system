import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { canAdministerSettings } from "@/lib/api/settings-types";
import { MembersSettingsView } from "@/components/settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.areas.members");
  return { title: t("title") };
}

export default async function MembersSettingsPage() {
  const session = await getSession();
  if (!session || !canAdministerSettings(session.role)) notFound();
  return <MembersSettingsView role={session.role} invitesGrant={session.invitesGrant} />;
}
