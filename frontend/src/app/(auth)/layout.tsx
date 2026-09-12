import * as React from "react";
import { getTranslations } from "next-intl/server";
import { LeiritechWordmark } from "@/components/shell/logo";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { ThemeToggle } from "@/components/shared/theme-toggle";

/**
 * Public auth layout — lives OUTSIDE the `(app)` route group, so it has NO app
 * shell (no sidebar/topbar). A calm, centered surface: warm paper, a soft
 * mesh of the brand ink blue blooming in from the edges, the wordmark, and
 * the auth card.
 */
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("app");

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-background">
      {/* The mesh. Four overlapping radial blooms of the brand ink, each at
          single-digit opacity, so the paper stays paper and the colour reads
          as light falling on it rather than as a gradient laid over it.
          Painted as CSS gradients — no image, no blur filter, nothing for the
          compositor to redraw. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(55rem_34rem_at_12%_-8%,var(--signal),transparent_58%)] opacity-[0.22] dark:opacity-[0.16]" />
        <div className="absolute inset-0 bg-[radial-gradient(42rem_28rem_at_92%_4%,var(--signal),transparent_54%)] opacity-[0.18] dark:opacity-[0.14]" />
        <div className="absolute inset-0 bg-[radial-gradient(46rem_30rem_at_82%_102%,var(--signal),transparent_56%)] opacity-[0.20] dark:opacity-[0.15]" />
        <div className="absolute inset-0 bg-[radial-gradient(36rem_26rem_at_2%_92%,var(--signal),transparent_52%)] opacity-[0.16] dark:opacity-[0.12]" />
      </div>

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
