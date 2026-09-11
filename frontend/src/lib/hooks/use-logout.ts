"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Shared logout flow (C3 fix).
 *
 * Previously the user menu and the security section each just navigated to
 * `/login`, leaving the refresh session (and the httpOnly cookie carrying it)
 * live server-side — the session was never actually revoked. This hook is the
 * single place logout happens:
 *   1. POST /api/auth/logout — best-effort revokes the refresh session against
 *      the backend, then always clears both auth cookies (see that route
 *      handler); we don't block navigation on the network call succeeding.
 *   2. Clear the TanStack Query cache so no authenticated data lingers in
 *      memory for the next signed-in user on this device.
 *   3. Redirect to /login and refresh the router so server components re-read
 *      the (now-cleared) session.
 */
export function useLogout() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, setPending] = React.useState(false);

  const logout = React.useCallback(async () => {
    if (pending) return;
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Best-effort revoke — the route handler clears local cookies
      // regardless, so we still proceed to sign the user out client-side.
    } finally {
      queryClient.clear();
      router.push("/login");
      router.refresh();
      setPending(false);
    }
  }, [pending, queryClient, router]);

  return { logout, pending };
}
