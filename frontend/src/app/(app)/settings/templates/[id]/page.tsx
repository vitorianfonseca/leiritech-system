import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { canUseTemplates } from "@/lib/api/template-types";
import { TemplateEditorView } from "@/components/templates";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("templates");
  return { title: t("editor.metaTitle") };
}

/**
 * /settings/templates/[id] — the template editor (F9). Admin edits phases/tasks
 * with drag-and-drop ordering; Gestor gets a read-only view. Membro is 404'd.
 * The template is loaded client-side (TanStack Query) so the editor can apply
 * optimistic reordering; a missing template renders an in-view not-found state.
 */
export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session || !canUseTemplates(session.role)) {
    notFound();
  }

  const { id } = await params;
  return <TemplateEditorView templateId={id} role={session.role} />;
}
