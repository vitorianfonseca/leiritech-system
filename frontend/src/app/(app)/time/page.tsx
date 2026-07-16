import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { canAccessTime } from "@/lib/api/time-types";
import { TimeView } from "@/components/time";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("time");
  return { title: t("title") };
}

/**
 * /time — the time-tracking workspace (F11). All roles reach it and see their
 * own entries; a Gestor/Admin can additionally view team entries scoped to their
 * projects (WORKFLOW_SPEC §3). Single-active timer is shared app-wide (BR-040).
 */
export default async function TimePage() {
  const session = await getSession();
  if (!session || !canAccessTime(session.role)) notFound();
  return (
    <TimeView
      user={{
        id: session.id,
        name: session.name,
        role: session.role,
        avatarUrl: session.avatarUrl,
      }}
    />
  );
}
