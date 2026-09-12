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
      {/* The document scrolls, not a div inside it.
          The shell used to be a fixed-height flexbox with the content in an
          inner `overflow-y-auto`, which costs more than it looks: the
          scrollbar sits against the content instead of the window edge, the
          browser's own overscroll and momentum behaviour does not apply, and
          any code that locks `document.body` — the detail panel's scroll lock,
          for one — locks an element that never scrolled.

          The sidebar stays put with `sticky` instead, which keeps it in the
          normal flow and lets the page scroll natively behind it. */}
      <div className="flex min-h-dvh w-full">
        <DesktopSidebar user={user} />
        <MobileNav user={user} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar user={user} />
          <main className="flex-1">
            <div className="mx-auto flex min-h-full max-w-[1400px] flex-col px-4 pt-4 pb-6 md:px-8 md:pt-5">
              <div className="flex-1 pb-8">{children}</div>
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
