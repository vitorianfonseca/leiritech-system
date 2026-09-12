import * as React from "react";
import { getTranslations } from "next-intl/server";
import { LeiritechWordmark } from "@/components/shell/logo";
import { MeshBackdrop } from "@/components/shell/mesh-backdrop";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { ThemeToggle } from "@/components/shared/theme-toggle";

/**
 * Public auth layout — lives OUTSIDE the `(app)` route group, so it has NO app
 * shell (no sidebar/topbar). A calm, centered surface: warm paper, a soft
 * mesh of the brand ink blue blooming in from the edges, the wordmark, and
 * the auth card. The backdrop is shared with the app shell.
 */
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("app");

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-background">
      <MeshBackdrop />

      <header className="relative z-10 flex items-center justify-between px-4 py-4 sm:px-8 sm:py-6">
        <LeiritechWordmark />
        <div className="flex items-center gap-1">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-md">{children}</div>
      </main>

      <footer className="relative z-10 px-4 py-6 text-center">
        <p className="text-xs text-muted-foreground">{t("tagline")}</p>
      </footer>
    </div>
  );
}
