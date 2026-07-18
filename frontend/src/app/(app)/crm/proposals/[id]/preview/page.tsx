import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { canAccessProposals } from "@/lib/api/proposals-types";
import { ProposalPreview } from "@/components/proposals/proposal-preview";

/** /crm/proposals/[id]/preview — branded, printable proposal document. */
export default async function ProposalPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session || !canAccessProposals(session.role)) notFound();
  const { id } = await params;
  const t = await getTranslations("app");
  return (
    <ProposalPreview
      proposalId={id}
      user={{ role: session.role, userId: session.id, paymentsGrant: session.paymentsGrant }}
      brandName={t("name")}
    />
  );
}
