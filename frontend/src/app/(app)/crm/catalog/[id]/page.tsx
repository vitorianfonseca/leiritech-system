import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { CatalogDetailView } from "@/components/catalog";

/** /crm/catalog/[id] — catalog item detail. Gestor+/Admin only. */
export default async function CatalogItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session || session.role === "membro") notFound();
  const { id } = await params;
  return <CatalogDetailView id={id} />;
}
