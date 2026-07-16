import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { ProfileView } from "@/components/profile";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("profile");
  return { title: t("title") };
}

/**
 * /profile — every role has a personal profile (matrix §3). No cross-user
 * access: the page renders only the current session user's own profile.
 */
export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <ProfileView user={session} />;
}
