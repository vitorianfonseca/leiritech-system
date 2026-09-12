import { NextResponse } from "next/server";

/**
 * `/api/health` — liveness probe for the platform health check.
 *
 * `/` is not usable as a probe: it is session-gated and redirects to `/login`
 * for an unauthenticated request, so a health check pointed there sees a 307
 * rather than a 200. This route is deliberately unauthenticated, does no I/O
 * and touches neither the database nor the API, so it reports "this Next.js
 * server is up and serving" and nothing more.
 *
 * No `dynamic` export needed: Next 16 does not cache Route Handlers by
 * default — caching is opt-in via `force-static`.
 */
export function GET() {
  return NextResponse.json(
    { status: "ok", service: "leiritech-frontend" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
