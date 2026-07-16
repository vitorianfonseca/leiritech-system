import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { canAccessProjects } from "@/lib/api/projects-types";
import { ProjectDetailView } from "@/components/projects";

export const metadata: Metadata = { title: "—" };

/**
 * /projects/[id] — project detail with tabs (F8). All roles reach the route;
 * the data client 404s a Membro who is not a member of the project (BR-002).
 * Next 16: `params` is a Promise and must be awaited.
 */
export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session || !canAccessProjects(session.role)) notFound();
  return (
    <ProjectDetailView
      projectId={id}
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
