import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { NewCompanyForm } from "@/components/crm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("crm.newPage");
  return { title: t("title") };
}

/**
 * /crm/companies/new — create a company (F4). Commercial write action, so it is
 * limited to Admin / Gestor; a Membro is 404'd (no creation right).
 */
export default async function NewCompanyPage() {
  const session = await getSession();
  if (!session || session.role === "membro") notFound();
  return <NewCompanyForm user={{ userId: session.id }} />;
}
