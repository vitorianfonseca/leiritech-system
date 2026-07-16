import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { ContactsView } from "@/components/crm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("crmContacts") };
}

/**
 * /crm/contacts — contact directory (F4). A Membro's list is scoped to contacts
 * of companies tied to their projects (BR-002).
 */
export default async function ContactsPage() {
  const session = await getSession();
  if (!session) notFound();
  return (
    <ContactsView
      user={{ role: session.role, userId: session.id, paymentsGrant: session.paymentsGrant }}
    />
  );
}
