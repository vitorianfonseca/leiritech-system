import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { canAccessPipeline } from "@/lib/api/opportunities-types";
import { OpportunityDetailView } from "@/components/pipeline";

export const metadata: Metadata = { title: "—" };

/**
 * /crm/opportunities/[id] — opportunity detail + activity feed (F5). Gestor+/
 * Admin only (BR-002). Next 16: `params` is a Promise and must be awaited.
 */
export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session || !canAccessPipeline(session.role)) notFound();
  return (
    <OpportunityDetailView
      opportunityId={id}
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
