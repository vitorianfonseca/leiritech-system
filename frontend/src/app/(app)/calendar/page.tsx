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
    // The month should be readable without scrolling for it, so the page
    // claims the viewport minus the shell's chrome and hands the rest to the
    // calendar. The footer sits below the fold, which is where it belongs.
    <div className="flex h-[calc(100dvh-7.5rem)] flex-col gap-5">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <CalendarView user={{ id: session.id, role: session.role }} />
    </div>
  );
}
