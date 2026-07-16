import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { canCreateProject } from "@/lib/api/projects-types";
import { canAccessFinance } from "@/lib/api/finance-types";
import { NewProjectForm } from "@/components/projects";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("projects.newPage");
  return { title: t("title") };
}

/**
 * /projects/new — create a project (F8). Commercial/delivery write action,
 * limited to Admin / Gestor; a Membro is 404'd (no creation right — BR-002).
 */
export default async function NewProjectPage() {
  const session = await getSession();
  if (!session || !canCreateProject(session.role)) notFound();
  return (
    <NewProjectForm
      user={{ role: session.role, userId: session.id, paymentsGrant: session.paymentsGrant }}
      canFinance={canAccessFinance(session.role, session.paymentsGrant)}
    />
  );
}
