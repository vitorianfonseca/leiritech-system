import { defineRouting } from "next-intl/routing";

/**
 * Locale is NEVER in the URL (mandatory project rule).
 * Resolution happens server-side in `request.ts`:
 *   authenticated profile -> `locale` cookie -> Accept-Language -> defaultLocale.
 * Canonical locale is pt-PT (EUR, dd/mm/yyyy).
 */
export const routing = defineRouting({
  locales: ["pt-PT", "en"],
  defaultLocale: "pt-PT",
  localePrefix: "never",
});

export type AppLocale = (typeof routing.locales)[number];

export function isSupportedLocale(value: string | undefined | null): value is AppLocale {
  return !!value && (routing.locales as readonly string[]).includes(value);
}
