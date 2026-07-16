import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { canInviteMembers } from "@/lib/api/settings-types";
import { InviteMemberView } from "@/components/settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.members.inviteSurface");
  return { title: t("title") };
}

export default async function InviteMemberPage() {
  const session = await getSession();
  // BR-003 / §3: admin OR gestor-with-grant. Member management stays admin-only.
  if (!session || !canInviteMembers(session.role, session.invitesGrant)) notFound();
  return <InviteMemberView role={session.role} invitesGrant={session.invitesGrant} />;
}
