import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { EmptyState } from "@/components/shared";
import { NotificationsView } from "@/components/notifications/notifications-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("notifications");
  return { title: t("title") };
}

/**
 * Notifications center (F15). Available to all roles; role scoping (financial
 * hidden from Membro — BR-008; Membro own-scope only — BR-002) is resolved by
 * `getSession()` here and enforced in the notifications API client.
 */
export default async function NotificationsPage() {
  const session = await getSession();
  const t = await getTranslations("notifications");

  if (!session) {
    return (
      <EmptyState
        title={t("errors.loadTitle")}
        description={t("errors.loadDescription")}
      />
    );
  }

  return (
    <NotificationsView
      user={{ id: session.id, name: session.name, role: session.role }}
    />
  );
}
