/**
 * Typed HTTP client — the single fetch wrapper every real API client uses
 * (integration issue #44).
 *
 * Responsibilities:
 *  - Resolve the backend base URL from `NEXT_PUBLIC_API_URL` and append the
 *    `/api/v1` prefix.
 *  - Attach the JWT access token (read from the browser-readable `aurea_access`
 *    cookie) as a cross-origin `Authorization: Bearer` header.
 *  - On a 401, transparently refresh ONCE via the `/api/auth/refresh` route
 *    handler (which holds the httpOnly refresh token) and retry the request.
 *  - Deep case-map: snake_case responses → camelCase; camelCase request bodies
 *    → snake_case.
 *  - Map the backend error envelope `{ error: { code, message, details } }` to a
 *    typed {@link HttpError}.
 *
 * This module is browser-oriented (clients run inside `"use client"` components
 * via TanStack Query). Server-side reads (e.g. `getSession`) call the backend
 * directly with an explicit token instead of going through here.
 */

import { ACCESS_COOKIE_KEY } from "@/lib/constants";
import { keysToCamel, keysToSnake } from "./case";

/** Backend origin without the API prefix (no trailing slash). */
function apiBase(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  return `${raw.replace(/\/+$/, "")}/api/v1`;
}

export interface BackendErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
}

/**
 * Typed transport/domain error. `code` is the backend's stable machine code
 * (e.g. `INVALID_CREDENTIALS`, `VALIDATION_ERROR`) or `NETWORK` when the request
 * never reached the server. Domain clients translate `code`/`status` into their
 * own typed error classes (AuthError, CrmError, …).
 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function readAccessTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${ACCESS_COOKIE_KEY}=`));
  return match ? decodeURIComponent(match.slice(ACCESS_COOKIE_KEY.length + 1)) : null;
}

let refreshInFlight: Promise<boolean> | null = null;

/** Ask the route handler to rotate tokens; de-duplicated across concurrent 401s. */
async function refreshTokens(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch("/api/auth/refresh", { method: "POST" });
        return res.ok;
      } catch {
        return false;
      } finally {
        // Clear after the microtask so parallel callers observe the same result.
        setTimeout(() => {
          refreshInFlight = null;
        }, 0);
      }
    })();
  }
  return refreshInFlight;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** JSON body (camelCase) — deep-converted to snake_case before sending. */
  body?: unknown;
  /** Query params; `undefined`/`null` values are skipped. */
  query?: Record<string, string | number | boolean | null | undefined>;
  /** Explicit token (server-side callers). Browser callers omit this. */
  token?: string | null;
  /** Skip the snake_case body conversion (already snake / not JSON). */
  rawBody?: boolean;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(`${apiBase()}${path.startsWith("/") ? path : `/${path}`}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function toHttpError(res: Response): Promise<HttpError> {
  let body: BackendErrorBody | null = null;
  try {
    body = (await res.json()) as BackendErrorBody;
  } catch {
    /* non-JSON error body */
  }
  const code = body?.error?.code ?? `HTTP_${res.status}`;
  const message = body?.error?.message ?? res.statusText ?? "Request failed";
  return new HttpError(res.status, code, message, body?.error?.details);
}

async function doFetch<T>(path: string, opts: RequestOptions, token: string | null): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload: BodyInit | undefined;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(opts.rawBody ? opts.body : keysToSnake(opts.body));
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? "GET",
      headers,
      body: payload,
      signal: opts.signal,
    });
  } catch {
    throw new HttpError(0, "NETWORK", "Não foi possível contactar o servidor.");
  }

  if (res.status === 204) return undefined as T;
  if (!res.ok) throw await toHttpError(res);

  const text = await res.text();
  if (!text) return undefined as T;
  return keysToCamel<T>(JSON.parse(text));
}

/** Core request with a single transparent refresh-and-retry on 401. */
export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const explicit = opts.token !== undefined;
  const token = explicit ? opts.token ?? null : readAccessTokenFromCookie();

  try {
    return await doFetch<T>(path, opts, token);
  } catch (err) {
    // Only the browser path (implicit token) can refresh via the route handler.
    if (err instanceof HttpError && err.status === 401 && !explicit) {
      const ok = await refreshTokens();
      if (ok) return doFetch<T>(path, opts, readAccessTokenFromCookie());
    }
    throw err;
  }
}

export const http = {
  get: <T>(path: string, opts?: Omit<RequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method">) =>
    apiRequest<T>(path, { ...opts, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method">) =>
    apiRequest<T>(path, { ...opts, method: "PATCH", body }),
  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method">) =>
    apiRequest<T>(path, { ...opts, method: "PUT", body }),
  delete: <T>(path: string, opts?: Omit<RequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...opts, method: "DELETE" }),
};
