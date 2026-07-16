"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { TimerReset, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/shared/toast";
import { useTimer, formatElapsed } from "@/lib/timer/timer-context";

/**
 * App-wide timer bar (BR-040). Renders a fixed pill whenever a timer is
 * running — anywhere in the app — showing the live elapsed time, the task it
 * is attributed to, and a Stop control. Because it reads the shared
 * `useTimer` state, it reflects the single active timer no matter where it was
 * started. Mounted once in the app shell.
 */
export function TimerBar() {
  const t = useTranslations("myWork.timer");
  const reduceMotion = useReducedMotion();
  const { active, elapsedMs, ready, stop } = useTimer();

  function handleStop() {
    const finished = stop();
    if (!finished) return;
    const minutes = Math.max(1, Math.round(finished.durationMs / 60000));
    toast({
      tone: "success",
      title: t("stoppedTitle"),
      description: t("stoppedDescription", {
        task: finished.taskTitle,
        minutes,
      }),
    });
  }

  const show = ready && active !== null;

  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          key="timer-bar"
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 sm:bottom-6"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
          transition={{ duration: reduceMotion ? 0 : 0.22, ease: "easeOut" }}
        >
          <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-full border border-border bg-popover py-2 pl-4 pr-2 text-popover-foreground shadow-lg">
            <span
              className="relative flex size-2.5 shrink-0 items-center justify-center"
              aria-hidden
            >
              <span className="absolute inline-flex size-2.5 animate-ping rounded-full bg-gold/60 motion-reduce:hidden" />
              <span className="relative inline-flex size-2.5 rounded-full bg-gold" />
            </span>

            <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
              {formatElapsed(elapsedMs)}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-tight">
                <span className="sr-only">{t("runningFor")} </span>
                {active.taskTitle}
              </p>
              {active.projectName ? (
                <p className="truncate text-xs text-muted-foreground leading-tight">
                  {active.projectName}
                </p>
              ) : null}
            </div>

            <Button
              variant="default"
              size="sm"
              className="shrink-0 rounded-full"
              onClick={handleStop}
            >
              <Square className="fill-current" strokeWidth={0} aria-hidden />
              {t("stop")}
            </Button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** Small idle-aware icon used by callers that need the timer glyph. */
export { TimerReset as TimerIcon };
