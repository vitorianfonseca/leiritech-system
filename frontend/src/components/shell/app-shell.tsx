import * as React from "react";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { SIDEBAR_COOKIE_KEY } from "@/lib/constants";
import { ShellClient } from "./shell-client";

/**
 * Server entry for the app shell. Resolves the session (role-aware nav +
 * user menu) and the persisted sidebar state, then hands serializable data to
 * the client shell. Mount this in the `(app)` route-group layout so every
 * authenticated page renders inside it.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const session = await getSession();
  const defaultCollapsed = store.get(SIDEBAR_COOKIE_KEY)?.value === "true";

  // Auth guard is enforced by the backend/integration layer later; the shell
  // requires a user to render role-aware navigation.
  if (!session) return <>{children}</>;

  return (
    <ShellClient user={session} defaultCollapsed={defaultCollapsed}>
      {children}
    </ShellClient>
  );
}
