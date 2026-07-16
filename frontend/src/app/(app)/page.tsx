import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard");
  return { title: t("metaTitle") };
}

/**
 * `/` — the management dashboard (F2). All roles reach it; the payload is
 * scoped server-side by role (Admin/Gestor see the full operation, Membro sees
 * their own work) and financials are gated (BR-002/008). The client view renders
 * only what the scoped payload contains.
 */
export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const firstName = session.name.split(" ")[0] ?? session.name;

  return (
    <DashboardView
      user={{
        id: session.id,
        firstName,
        role: session.role,
        paymentsGrant: session.paymentsGrant,
      }}
    />
  );
}
