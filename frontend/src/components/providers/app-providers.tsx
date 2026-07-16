"use client";

import * as React from "react";
import { ThemeProvider } from "./theme-provider";
import { QueryProvider } from "./query-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/shared/toast";
import { TimerProvider } from "@/lib/timer/timer-context";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <QueryProvider>
        {/* App-wide single-active-timer state (BR-040) — mounted high so
            My Work (#27), Tasks (#34) and Time Tracking (#35) share one timer. */}
        <TimerProvider>
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </TimerProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
