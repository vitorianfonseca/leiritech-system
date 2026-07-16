import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { canAccessPipeline } from "@/lib/api/opportunities-types";
import { canAccessFinance } from "@/lib/api/finance-types";
import { ConvertWizard } from "@/components/conversion";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("conversion");
  return { title: t("title") };
}

/**
 * /crm/opportunities/[id]/convert — Won → project conversion wizard (#31,
 * BR-035). Gestor+/Admin only (conversion is a commercial/delivery write);
 * a Membro is 404'd (BR-002). The payment-milestone step is further gated to
 * finance inside the wizard. Next 16: `params` is a Promise and must be awaited.
 */
export default async function ConvertOpportunityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session || !canAccessPipeline(session.role)) notFound();

  return (
    <ConvertWizard
      opportunityId={id}
      user={{ role: session.role, userId: session.id, paymentsGrant: session.paymentsGrant }}
      canFinance={canAccessFinance(session.role, session.paymentsGrant)}
    />
  );
}
