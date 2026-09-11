import * as React from "react";
import { getTranslations } from "next-intl/server";
import { LeiritechWordmark } from "@/components/shell/logo";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { ThemeToggle } from "@/components/shared/theme-toggle";

/**
 * Public auth layout — lives OUTSIDE the `(app)` route group, so it has NO app
 * shell (no sidebar/topbar). A calm, centered, editorial surface: cool paper
 * canvas, a single discreet cobalt aura, the LeiriTech wordmark, and the auth card.
 */
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("app");

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-background">
      {/* Signature cobalt aura — the single flash of brand color on the canvas. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-gold/10 blur-3xl"
      />

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
