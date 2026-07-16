import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { EmptyState } from "@/components/shared";
import { PageHeader } from "@/components/shell/page-header";
import { CalendarView } from "@/components/calendar";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("calendar") };
}

export default async function CalendarPage() {
  const session = await getSession();
  const t = await getTranslations("calendar");

  if (!session) {
    return <EmptyState title={t("error.title")} description={t("error.description")} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <CalendarView user={{ id: session.id, role: session.role }} />
    </div>
  );
}
