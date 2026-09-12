"use client";

import * as React from "react";
import type { SessionUser } from "@/lib/session";
import { SidebarProvider } from "./sidebar-context";
import { DesktopSidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { Topbar } from "./topbar";
import { Footer } from "./footer";
import { CommandPalette } from "./command-palette";
import { TimerBar } from "@/components/timer/timer-bar";
import { MeshBackdrop } from "./mesh-backdrop";

export function ShellClient({
  user,
  defaultCollapsed,
  children,
}: {
  user: SessionUser;
  defaultCollapsed: boolean;
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider defaultCollapsed={defaultCollapsed}>
      <div className="flex h-dvh w-full overflow-hidden">
        <DesktopSidebar user={user} />
        <MobileNav user={user} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar user={user} />
          <main className="relative flex-1 overflow-y-auto">
            <MeshBackdrop />
            <div className="relative z-10 mx-auto flex min-h-full max-w-[1400px] flex-col px-4 py-6 md:px-8 md:py-8">
              <div className="flex-1">{children}</div>
              <Footer />
            </div>
          </main>
        </div>
      </div>
      <CommandPalette user={user} />
      {/* App-wide timer bar — visible on every authenticated page whenever a
          timer is running (BR-040). */}
      <TimerBar />
    </SidebarProvider>
  );
}
