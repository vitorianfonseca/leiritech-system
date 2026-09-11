import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { ContactDetailView } from "@/components/crm";

export const metadata: Metadata = { title: "—" };

/**
 * /crm/contacts/[id] — contact detail (F4). Scoped read (BR-002); renders a
 * not-found state if the contact is missing or out of scope.
 *
 * Next 16: `params` is a Promise and must be awaited.
 */
export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) notFound();
  return (
    <ContactDetailView
      contactId={id}
      user={{
        role: session.role,
        userId: session.id,
        paymentsGrant: session.paymentsGrant,
      }}
    />
  );
}
