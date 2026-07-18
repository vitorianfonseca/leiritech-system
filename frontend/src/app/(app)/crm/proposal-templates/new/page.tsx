import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { TemplateEditor } from "@/components/proposal-templates";

/** /crm/proposal-templates/new — create a proposal template. Gestor+/Admin only. */
export default async function NewProposalTemplatePage() {
  const session = await getSession();
  if (!session || session.role === "membro") notFound();
  return <TemplateEditor />;
}
