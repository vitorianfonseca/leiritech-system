import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { routing, isSupportedLocale, type AppLocale } from "./routing";
import { getSession } from "@/lib/session";

/**
 * Minimal Accept-Language negotiation (no extra deps).
 * Matches exact tags then base language against the supported locales.
 */
function negotiate(acceptLanguage: string): AppLocale | null {
  const requested = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.trim().toLowerCase(), q: q ? parseFloat(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { tag } of requested) {
    const exact = routing.locales.find((l) => l.toLowerCase() === tag);
    if (exact) return exact;
    const base = tag.split("-")[0];
    const byBase = routing.locales.find((l) => l.toLowerCase().split("-")[0] === base);
    if (byBase) return byBase;
  }
  return null;
}

async function resolveLocale(): Promise<AppLocale> {
  // 1. Authenticated user's profile preference.
  try {
    const session = await getSession();
    if (session && isSupportedLocale(session.locale)) return session.locale;
  } catch {
    // session read may throw before auth is wired; fall through
  }

  // 2. Anonymous user's persisted cookie (set by <LocaleSwitcher>).
  const cookieLocale = (await cookies()).get("locale")?.value;
  if (isSupportedLocale(cookieLocale)) return cookieLocale;

  // 3. Accept-Language negotiation.
  const accept = (await headers()).get("accept-language") ?? "";
  const negotiated = negotiate(accept);
  if (negotiated) return negotiated;

  // 4. Hard default.
  return routing.defaultLocale;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  const messages = (await import(`../messages/${locale}.json`)).default;
  return { locale, messages };
});
