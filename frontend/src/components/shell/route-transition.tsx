"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { LayoutRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { routeVariants } from "@/lib/motion";

/**
 * Holds the outgoing route's router context still while it animates away.
 *
 * Without this, App Router hands the exiting subtree the *new* route's
 * context the moment navigation starts, so the page being animated out
 * re-renders as the incoming page and the exit animation plays over the
 * wrong content. Freezing the context at the value it had when the subtree
 * mounted keeps the old page intact until it is gone.
 *
 * This reaches into a Next internal, which is the trade: there is no public
 * API for route exit animations in App Router, and the alternative — no exit
 * at all — is the abrupt replacement this redesign exists to remove. The
 * import is narrow and `LayoutRouterContext` has been stable across the
 * App Router's life; if a future version moves it, this fails loudly at
 * build time rather than silently at runtime.
 */
function FrozenRouter({ children }: { children: React.ReactNode }) {
  const context = React.useContext(LayoutRouterContext);
  // `useState`'s initializer, not a ref: it captures the context once at
  // mount and never updates, which is exactly the freeze, and unlike reading
  // `ref.current` during render it is safe under the React compiler.
  const [frozen] = React.useState(context);

  if (!frozen) return <>{children}</>;
  return (
    <LayoutRouterContext.Provider value={frozen}>
      {children}
    </LayoutRouterContext.Provider>
  );
}

/**
 * One continuous application rather than a series of page loads.
 *
 * `mode="wait"` is deliberate: the outgoing page finishes leaving before the
 * incoming one starts arriving. Overlapping them shows two pages at once,
 * which is the tell of a cheap transition. The cost is ~180ms of exit before
 * the new page begins, which is why the exit is the fastest curve in the
 * system and accelerates — it should feel like being put away, not like
 * waiting.
 */
export function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={pathname}
          variants={routeVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          // No `will-change`. It was set permanently here, which keeps a
          // compositor layer alive under the whole page for its entire life —
          // the property is meant to be a hint given just before an animation
          // and withdrawn after, and framer-motion already applies it for the
          // duration of the transition itself.
        >
          <FrozenRouter>{children}</FrozenRouter>
        </motion.div>
      </AnimatePresence>
    </MotionConfig>
  );
}
