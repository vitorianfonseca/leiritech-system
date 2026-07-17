import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { CatalogView } from "@/components/catalog";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("crmCatalog") };
}

/** /crm/catalog — product/service catalog directory. Gestor+/Admin only. */
export default async function CatalogPage() {
  const session = await getSession();
  if (!session || session.role === "membro") notFound();
  return <CatalogView />;
}
