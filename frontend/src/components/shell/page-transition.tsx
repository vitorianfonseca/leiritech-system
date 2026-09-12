"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { duration, ease } from "@/lib/motion";

/**
 * How a page arrives in LeiriTech.
 *
 * Not a global cross-fade — that reads as a screenshot swap and is the thing
 * every generated dashboard does. The page settles in two beats: the content
 * lifts into place, and a hairline draws across the top edge as it lands, the
 * way a sheet of paper is squared against a desk. It is one orchestrated
 * moment, short enough to never sit between a person and their work.
 *
 * Under `prefers-reduced-motion` the whole thing collapses to a cut: no
 * opacity ramp, no movement, no rule.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();

  if (reduced) return <>{children}</>;

  return (
    <div className="relative">
      {/* The rule. Draws from the leading edge, then releases — the only
          moving colour in the transition, and it is the signal accent. */}
      <motion.span
        aria-hidden
        initial={{ scaleX: 0, opacity: 1 }}
        animate={{ scaleX: 1, opacity: 0 }}
        transition={{
          scaleX: { duration: 0.5, ease: ease.out },
          opacity: { duration: 0.32, delay: 0.28, ease: "linear" },
        }}
        className="pointer-events-none absolute inset-x-0 -top-px z-10 h-px origin-left bg-signal"
      />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: duration.slow, ease: ease.out }}
      >
        {children}
      </motion.div>
    </div>
  );
}
