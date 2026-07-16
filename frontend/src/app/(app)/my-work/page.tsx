import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { EmptyState } from "@/components/shared";
import { MyWorkView } from "@/components/my-work/my-work-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("myWork") };
}

export default async function MyWorkPage() {
  const session = await getSession();
  const t = await getTranslations("myWork");

  if (!session) {
    return (
      <EmptyState title={t("errors.loadTitle")} description={t("errors.loadDescription")} />
    );
  }

  return (
    <MyWorkView
      user={{
        id: session.id,
        name: session.name,
        role: session.role,
        avatarUrl: session.avatarUrl,
      }}
    />
  );
}
