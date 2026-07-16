import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { canAccessSettings } from "@/lib/api/settings-types";
import { ThemeSettingsView } from "@/components/settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.areas.theme");
  return { title: t("title") };
}

export default async function ThemeSettingsPage() {
  const session = await getSession();
  if (!session || !canAccessSettings(session.role)) notFound();
  return <ThemeSettingsView />;
}
