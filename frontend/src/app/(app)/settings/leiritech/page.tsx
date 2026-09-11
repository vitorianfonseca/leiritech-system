import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { canAdministerSettings } from "@/lib/api/settings-types";
import { LeiritechSettingsView } from "@/components/settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.areas.leiritech");
  return { title: t("title") };
}

export default async function LeiritechSettingsPage() {
  const session = await getSession();
  if (!session || !canAdministerSettings(session.role)) notFound();
  return <LeiritechSettingsView role={session.role} />;
}
