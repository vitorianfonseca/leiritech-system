/**
 * Shared constants safe to import from both server and client modules.
 * Do NOT put these in a "use client" file — server components that import a
 * value from a client module receive a client-reference proxy, not the value.
 */
export const SIDEBAR_COOKIE_KEY = "aurea_sidebar_collapsed";
export const LOCALE_COOKIE_KEY = "locale";
export const ROLE_COOKIE_KEY = "aurea_role";

/**
 * Auth token cookies (set by the /api/auth/* route handlers).
 * - ACCESS is short-lived (15 min) and readable by client JS so the browser can
 *   attach it as a cross-origin `Authorization` header to the FastAPI backend.
 * - REFRESH is httpOnly + path-scoped to /api/auth so it is only ever sent to
 *   the Next route handlers that rotate/revoke it — never exposed to page JS.
 */
export const ACCESS_COOKIE_KEY = "aurea_access";
export const REFRESH_COOKIE_KEY = "aurea_refresh";
