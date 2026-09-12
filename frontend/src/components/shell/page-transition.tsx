"use client";

import * as React from "react";
import { MotionConfig, motion, useReducedMotion } from "framer-motion";
import { duration, ease } from "@/lib/motion";

/**
 * How a page arrives: a fade running top to bottom, and nothing else.
 *
 * An earlier version layered a blur, a gradient wash and a sweeping rule over
 * the content lift. Compositing a blur across a full page is expensive enough
 * to drop frames on the very transition it was decorating, and the extra
 * layers pushed the sequence past half a second — which reads as delay, not
 * polish. Opacity and eight pixels of travel do the whole job, in 280ms.
 *
 * `MotionConfig reducedMotion="user"` sits here rather than on each component,
 * so every framer-motion animation inside a page — including ones added
 * later — honours the system preference without being asked.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();

  if (reduced) return <>{children}</>;

  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: duration.slow, ease: ease.out }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}
