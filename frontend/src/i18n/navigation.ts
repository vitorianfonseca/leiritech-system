import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Locale-agnostic navigation. Because `localePrefix` is "never", these behave
 * like the plain next/navigation equivalents and NEVER add a locale prefix to
 * the URL. Import Link/useRouter from here across the app for a stable surface.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
