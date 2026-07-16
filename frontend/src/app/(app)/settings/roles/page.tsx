import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { canAdministerSettings } from "@/lib/api/settings-types";
import { RolesSettingsView } from "@/components/settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.areas.roles");
  return { title: t("title") };
}

export default async function RolesSettingsPage() {
  const session = await getSession();
  if (!session || !canAdministerSettings(session.role)) notFound();
  return <RolesSettingsView />;
}
