/**
 * Client-side preference persistence (cookie + localStorage).
 *
 * Kept in a plain module (not a component/hook) so DOM writes live outside the
 * React render model. Cookie mirrors localStorage so the server can read the
 * choice on the next request (locale + sidebar state) without a flash.
 */
const ONE_YEAR = 60 * 60 * 24 * 365;

export function persistPref(key: string, value: string): void {
  document.cookie = `${key}=${value}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage may be unavailable (private mode, quota) — cookie still set */
  }
}
