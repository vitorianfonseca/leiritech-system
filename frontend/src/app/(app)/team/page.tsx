import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { canAccessTeam } from "@/lib/api/team-types";
import { TeamView } from "@/components/team";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("team");
  return { title: t("title") };
}

/**
 * /team — team roster + weekly workload heatmap (F13). Admin/Gestor see the
 * whole team + capacity; a Membro sees ONLY their own load (BR-002 — enforced
 * in the API client, the view just reflects `ownOnly`). Availability is derived
 * (BR-082); capacity config is Admin-only (BR-081, matrix §9).
 */
export default async function TeamPage() {
  const session = await getSession();
  if (!session || !canAccessTeam(session.role)) notFound();
  return (
    <TeamView
      user={{
        id: session.id,
        name: session.name,
        role: session.role,
        avatarUrl: session.avatarUrl,
      }}
    />
  );
}
