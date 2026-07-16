import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { CompanyDetailView } from "@/components/crm";

export const metadata: Metadata = { title: "—" };

/**
 * /crm/companies/[id] — full relationship view (F4). The client view fetches
 * the company (scoped read — BR-002; financial surfaces gated — BR-008) and
 * renders a not-found state if the company is missing or out of scope.
 *
 * Next 16: `params` is a Promise and must be awaited.
 */
export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) notFound();
  return (
    <CompanyDetailView
      companyId={id}
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
