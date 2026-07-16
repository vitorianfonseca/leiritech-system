/**
 * Shared constants safe to import from both server and client modules.
 * Do NOT put these in a "use client" file — server components that import a
 * value from a client module receive a client-reference proxy, not the value.
 */
export const SIDEBAR_COOKIE_KEY = "aurea_sidebar_collapsed";
export const LOCALE_COOKIE_KEY = "locale";
export const ROLE_COOKIE_KEY = "aurea_role";
