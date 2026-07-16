import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { ReportsView } from "@/components/reports";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reports");
  return { title: t("metaTitle") };
}

/**
 * `/reports` — cross-domain reporting (F19, PRD §8). All roles reach the route;
 * the payload is scoped server-side by role and the report GROUPS are gated:
 * Comercial → pipeline access (Admin/Gestor), Financeiro → finance access
 * (Admin / Gestor-with-grant), Projetos + Equipa → all roles (own scope for a
 * Membro). The client view renders only the groups the scoped payload permits.
 */
export default async function ReportsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <ReportsView
      user={{ id: session.id, role: session.role, paymentsGrant: session.paymentsGrant }}
    />
  );
}
