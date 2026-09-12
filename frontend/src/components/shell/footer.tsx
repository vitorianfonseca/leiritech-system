"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";

export function Footer() {
  const t = useTranslations("app");
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-border px-4 py-4 md:px-8">
      <div className="mx-auto flex max-w-[1400px] flex-col items-center justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
        <p>
          © {year} {t("name")} · {t("tagline")}
        </p>
        <div className="flex items-center gap-4">
          <a className="hit-area transition-colors hover:text-foreground" href="#">
            Privacidade
          </a>
          <a className="hit-area transition-colors hover:text-foreground" href="#">
            Termos
          </a>
          <LocaleSwitcher variant="full" />
        </div>
      </div>
    </footer>
  );
}
