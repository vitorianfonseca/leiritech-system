import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { canAccessProjects } from "@/lib/api/projects-types";
import { ProjectsView } from "@/components/projects";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("projects.list");
  return { title: t("title") };
}

/**
 * /projects — projects directory (F8). All roles reach it; a Membro is row-
 * scoped to their member projects by the data client (BR-002).
 */
export default async function ProjectsPage() {
  const session = await getSession();
  if (!session || !canAccessProjects(session.role)) notFound();
  return (
    <ProjectsView
      user={{ role: session.role, userId: session.id, paymentsGrant: session.paymentsGrant }}
    />
  );
}
