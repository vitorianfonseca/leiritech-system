import { NextResponse } from "next/server";
import {
  backendApiBase,
  clearAuthCookies,
  parseTokenResponse,
  readRefreshCookie,
  writeAuthCookies,
} from "@/lib/api/server-auth";

/**
 * POST /api/auth/refresh
 * Rotates the token pair using the httpOnly refresh cookie. On success the new
 * tokens are written back to cookies and the fresh access token is returned so
 * the client HTTP layer can retry the original request. On failure the cookies
 * are cleared and a 401 is returned (the app then redirects to /login).
 */
export async function POST() {
  const refreshToken = await readRefreshCookie();
  if (!refreshToken) {
    return NextResponse.json(
      { error: { code: "INVALID_REFRESH_TOKEN", message: "No session." } },
      { status: 401 },
    );
  }

  const res = await fetch(`${backendApiBase()}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!res.ok) {
    await clearAuthCookies();
    const body = await res.json().catch(() => null);
    return NextResponse.json(body ?? { error: { code: "INVALID_REFRESH_TOKEN" } }, {
      status: res.status,
    });
  }

  const tokens = parseTokenResponse(await res.json());
  await writeAuthCookies(tokens);
  return NextResponse.json({ accessToken: tokens.accessToken });
}
