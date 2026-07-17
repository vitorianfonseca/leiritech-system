import "server-only";

import { cookies } from "next/headers";
import {
  ACCESS_COOKIE_KEY,
  REFRESH_COOKIE_KEY,
} from "@/lib/constants";

/**
 * Server-side auth plumbing shared by the /api/auth/* route handlers and
 * `getSession()`. The refresh token is stored httpOnly + path-scoped so it never
 * reaches page JavaScript; the access token is browser-readable (short-lived) so
 * the client HTTP layer can attach it as a cross-origin Authorization header.
 */

/** Backend origin + API prefix (server-side; not the NEXT_PUBLIC value only). */
export function backendApiBase(): string {
  const raw =
    process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  return `${raw.replace(/\/+$/, "")}/api/v1`;
}

export interface BackendTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

const REFRESH_MAX_AGE = 14 * 24 * 60 * 60; // 14 days (matches backend REFRESH_TOKEN_TTL)

/** Persist the token pair into cookies on the given (mutable) cookie store. */
export async function writeAuthCookies(tokens: BackendTokens): Promise<void> {
  const store = await cookies();
  const secure = process.env.NODE_ENV === "production";

  store.set(ACCESS_COOKIE_KEY, tokens.accessToken, {
    httpOnly: false, // readable by the client HTTP layer (Authorization header)
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: tokens.expiresIn,
  });

  store.set(REFRESH_COOKIE_KEY, tokens.refreshToken, {
    httpOnly: true, // never exposed to page JS
    secure,
    sameSite: "lax",
    path: "/", // sent on navigations too, so middleware can rotate it
    maxAge: REFRESH_MAX_AGE,
  });
}

export async function clearAuthCookies(): Promise<void> {
  const store = await cookies();
  store.delete(ACCESS_COOKIE_KEY);
  store.set(REFRESH_COOKIE_KEY, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
}

export async function readRefreshCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(REFRESH_COOKIE_KEY)?.value ?? null;
}

export async function readAccessCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACCESS_COOKIE_KEY)?.value ?? null;
}

/** Normalise the backend TokenResponse (snake_case) into our shape. */
export function parseTokenResponse(json: unknown): BackendTokens {
  const j = json as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresIn: j.expires_in,
  };
}
