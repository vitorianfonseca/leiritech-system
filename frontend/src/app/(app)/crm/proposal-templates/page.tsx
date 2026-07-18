import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { TemplatesView } from "@/components/proposal-templates";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("crmProposalTemplates") };
}

/** /crm/proposal-templates — proposal template directory. Gestor+/Admin only. */
export default async function ProposalTemplatesPage() {
  const session = await getSession();
  if (!session || session.role === "membro") notFound();
  return <TemplatesView />;
}
