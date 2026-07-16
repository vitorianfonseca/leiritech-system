import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { CompaniesView } from "@/components/crm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("crmCompanies") };
}

/**
 * /crm/companies — company book (F4). Visible to all roles; a Membro's list is
 * scoped server-side to companies tied to their projects (BR-002), and
 * financial columns are stripped without finance access (BR-008).
 */
export default async function CompaniesPage() {
  const session = await getSession();
  if (!session) notFound();
  return (
    <CompaniesView
      user={{ role: session.role, userId: session.id, paymentsGrant: session.paymentsGrant }}
    />
  );
}
