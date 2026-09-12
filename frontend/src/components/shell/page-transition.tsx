"use client";

import * as React from "react";
import { MotionConfig, motion, useReducedMotion } from "framer-motion";
import { duration, ease } from "@/lib/motion";

/**
 * How a page arrives.
 *
 * Three things happen at once, and they are timed to overlap rather than
 * queue: a hairline in the accent sweeps the top edge, a soft wash lifts off
 * the surface, and the content settles up into place. It reads as a sheet
 * being squared against a desk — deliberate, and over in under half a
 * second, because this is a tool and not a title sequence.
 *
 * `MotionConfig reducedMotion="user"` is set here rather than on each
 * component, so every framer-motion animation inside a page — including ones
 * added later — honours the system preference without being asked.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();

  if (reduced) return <>{children}</>;

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative">
        {/* The rule: draws from the leading edge, then releases. */}
        <motion.span
          aria-hidden
          initial={{ scaleX: 0, opacity: 1 }}
          animate={{ scaleX: 1, opacity: 0 }}
          transition={{
            scaleX: { duration: 0.55, ease: ease.out },
            opacity: { duration: 0.3, delay: 0.32, ease: "linear" },
          }}
          className="pointer-events-none absolute inset-x-0 -top-px z-20 h-px origin-left bg-signal"
        />

        {/* A wash that lifts away, so the page feels lit rather than swapped. */}
        <motion.span
          aria-hidden
          initial={{ opacity: 0.5 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: ease.out }}
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-40 bg-gradient-to-b from-signal-muted to-transparent"
        />

        <motion.div
          initial={{ opacity: 0, y: 12, filter: "blur(3px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: duration.slow, ease: ease.out }}
        >
          {children}
        </motion.div>
      </div>
    </MotionConfig>
  );
}
