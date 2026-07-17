import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE_KEY, REFRESH_COOKIE_KEY } from "@/lib/constants";

/**
 * Route protection + transparent token refresh (integration issue #44).
 *
 * Auth pages (login/forgot/reset/invite) and the /api/auth/* handlers are
 * public. Every other route requires a session:
 *  - access cookie present  → allow (it expires exactly when the token does).
 *  - access absent, refresh present → rotate against the backend, set fresh
 *    cookies on the response, allow.
 *  - neither → redirect to /login (preserving the intended path).
 */

const PUBLIC_PREFIXES = ["/login", "/forgot-password", "/reset-password", "/invite"];

function backendApiBase(): string {
  const raw =
    process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  return `${raw.replace(/\/+$/, "")}/api/v1`;
}

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  const hasAccess = Boolean(request.cookies.get(ACCESS_COOKIE_KEY)?.value);
  if (hasAccess) return NextResponse.next();

  const refreshToken = request.cookies.get(REFRESH_COOKIE_KEY)?.value;
  if (refreshToken) {
    try {
      const res = await fetch(`${backendApiBase()}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (res.ok) {
        const tokens = (await res.json()) as {
          access_token: string;
          refresh_token: string;
          expires_in: number;
        };
        const response = NextResponse.next();
        const secure = process.env.NODE_ENV === "production";
        response.cookies.set(ACCESS_COOKIE_KEY, tokens.access_token, {
          httpOnly: false,
          secure,
          sameSite: "lax",
          path: "/",
          maxAge: tokens.expires_in,
        });
        response.cookies.set(REFRESH_COOKIE_KEY, tokens.refresh_token, {
          httpOnly: true,
          secure,
          sameSite: "lax",
          path: "/",
          maxAge: 14 * 24 * 60 * 60,
        });
        return response;
      }
    } catch {
      /* fall through to redirect */
    }
  }

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") loginUrl.searchParams.set("from", `${pathname}${search}`);
  const redirect = NextResponse.redirect(loginUrl);
  redirect.cookies.delete(ACCESS_COOKIE_KEY);
  redirect.cookies.delete(REFRESH_COOKIE_KEY);
  return redirect;
}

export const config = {
  // Everything except Next internals, static assets, and the auth API handlers.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth|.*\\.[\\w]+$).*)"],
};
