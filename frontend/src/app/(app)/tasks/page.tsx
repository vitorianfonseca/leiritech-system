import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { canAccessTasks } from "@/lib/api/tasks-types";
import { TasksView } from "@/components/tasks";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tasks");
  return { title: t("title") };
}

/**
 * /tasks — the tasks workspace (F10). All roles reach it; a Membro is row-scoped
 * to their member projects by the data client (BR-002 / H7).
 */
export default async function TasksPage() {
  const session = await getSession();
  if (!session || !canAccessTasks(session.role)) notFound();
  return (
    <TasksView
      user={{
        id: session.id,
        name: session.name,
        role: session.role,
        avatarUrl: session.avatarUrl,
      }}
    />
  );
}
