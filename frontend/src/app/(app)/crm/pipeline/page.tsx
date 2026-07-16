import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { canAccessPipeline } from "@/lib/api/opportunities-types";
import { PipelineBoard } from "@/components/pipeline";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("crmPipeline") };
}

/**
 * /crm/pipeline — commercial pipeline Kanban (F5). Gestor+/Admin only; a Membro
 * has NO access (BR-002) and gets a not-found. The board itself re-checks access
 * server-side via the API client.
 */
export default async function PipelinePage() {
  const session = await getSession();
  if (!session || !canAccessPipeline(session.role)) notFound();
  return (
    <PipelineBoard
      user={{ role: session.role, userId: session.id, paymentsGrant: session.paymentsGrant }}
    />
  );
}
