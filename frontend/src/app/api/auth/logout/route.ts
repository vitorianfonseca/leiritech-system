import { NextResponse } from "next/server";
import {
  backendApiBase,
  clearAuthCookies,
  readRefreshCookie,
} from "@/lib/api/server-auth";

/**
 * POST /api/auth/logout
 * Best-effort revokes the refresh session server-side, then always clears the
 * local auth cookies.
 */
export async function POST() {
  const refreshToken = await readRefreshCookie();
  if (refreshToken) {
    await fetch(`${backendApiBase()}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    }).catch(() => {
      /* revoke is best-effort; local cookies are cleared regardless */
    });
  }
  await clearAuthCookies();
  return NextResponse.json({ ok: true });
}
