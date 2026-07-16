import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { canAccessProposals } from "@/lib/api/proposals-types";
import { ProposalsView } from "@/components/proposals";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("crmProposals") };
}

/**
 * /crm/proposals — proposals directory (F6). Gestor+/Admin only (BR-002); a
 * Membro has no access and the route renders not-found.
 */
export default async function ProposalsPage() {
  const session = await getSession();
  if (!session || !canAccessProposals(session.role)) notFound();
  return (
    <ProposalsView
      user={{ role: session.role, userId: session.id, paymentsGrant: session.paymentsGrant }}
    />
  );
}
