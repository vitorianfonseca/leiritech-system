import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { canAccessProposals } from "@/lib/api/proposals-types";
import { ProposalDetailView } from "@/components/proposals";

export const metadata: Metadata = { title: "—" };

/**
 * /crm/proposals/[id] — proposal detail + PDF + lifecycle actions (F6). Gestor+/
 * Admin only (BR-002). Next 16: `params` is a Promise and must be awaited.
 */
export default async function ProposalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session || !canAccessProposals(session.role)) notFound();
  return (
    <ProposalDetailView
      proposalId={id}
      user={{
        role: session.role,
        userId: session.id,
        paymentsGrant: session.paymentsGrant,
        name: session.name,
        avatarUrl: session.avatarUrl,
      }}
    />
  );
}
