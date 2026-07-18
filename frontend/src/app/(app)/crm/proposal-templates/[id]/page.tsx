import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { TemplateEditorLoader } from "@/components/proposal-templates";

/** /crm/proposal-templates/[id] — edit a proposal template. Gestor+/Admin only. */
export default async function ProposalTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session || session.role === "membro") notFound();
  const { id } = await params;
  return <TemplateEditorLoader id={id} />;
}
