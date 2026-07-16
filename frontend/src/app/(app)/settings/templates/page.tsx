import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { canUseTemplates } from "@/lib/api/template-types";
import { TemplatesListView } from "@/components/templates";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("templates");
  return { title: t("title") };
}

/**
 * /settings/templates — project templates management (F9).
 *
 * Access (matrix §9): Admin ✅ creates the canonical templates; Gestor 👀 views
 * and "uses" them; Membro ❌ (route lives under /settings). Unauthorized users
 * get a 404 — the view additionally gates every write to Admin.
 */
export default async function TemplatesPage() {
  const session = await getSession();

  if (!session || !canUseTemplates(session.role)) {
    notFound();
  }

  return <TemplatesListView role={session.role} />;
}
