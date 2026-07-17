"use client";

import * as React from "react";
import { ThemeProvider } from "./theme-provider";
import { TextSizeProvider } from "./text-size-provider";
import { QueryProvider } from "./query-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/shared/toast";
import { TimerProvider } from "@/lib/timer/timer-context";
import type { TextSize } from "@/lib/text-size";

export function AppProviders({
  children,
  textSize,
}: {
  children: React.ReactNode;
  textSize?: TextSize;
}) {
  return (
    <ThemeProvider>
      <TextSizeProvider initial={textSize}>
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
      </TextSizeProvider>
    </ThemeProvider>
  );
}
