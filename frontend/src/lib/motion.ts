/**
 * The LeiriTech motion system.
 *
 * Three rules govern everything here:
 *
 *  1. **Motion explains, it never decorates.** Every variant below maps to
 *     one of: state changed, hierarchy, continuity between two views,
 *     feedback for something a person did. Nothing floats for atmosphere.
 *  2. **Nothing waits on motion.** A page is fully legible inside ~320ms and
 *     anything a person triggers resolves under 200ms. Delay is what makes
 *     an interface feel slow; a stagger is only legible while it is short.
 *  3. **Only compositor-friendly properties.** Transform and opacity. No
 *     blur across a page, no animated box-shadow on a list — those drop
 *     frames on exactly the interactions they were meant to flatter.
 *
 * `MotionConfig reducedMotion="user"` wraps the app, so every variant here
 * collapses to a cut when the system asks for reduced motion.
 */

import type { Transition, Variants } from "framer-motion";

/* ------------------------------------------------------------------ *
 * Primitives
 * ------------------------------------------------------------------ */

export const duration = {
  /** State flips: check, toggle, selection. */
  instant: 0.12,
  /** Hover, focus, press. */
  fast: 0.18,
  /** Dropdowns, popovers, toasts, tab bodies. */
  base: 0.24,
  /** Things entering or leaving the screen entirely. */
  slow: 0.32,
} as const;

/** Decelerating, with a long tail — reads as something settling into place. */
export const easeOut = [0.16, 1, 0.3, 1] as const;
/** Symmetric, for movement that neither arrives nor leaves. */
export const easeInOut = [0.76, 0, 0.24, 1] as const;
/** Accelerating — for exits, which should feel like leaving, not fading. */
export const easeIn = [0.55, 0, 1, 0.45] as const;

export const spring = {
  /** Layout and shared-element moves. Critically damped: no wobble. */
  layout: { type: "spring", stiffness: 420, damping: 38, mass: 0.9 },
  /** A little life for things that pop into existence. */
  pop: { type: "spring", stiffness: 520, damping: 30, mass: 0.7 },
  /** Drag release. Softer, so a dropped card settles rather than snaps. */
  drop: { type: "spring", stiffness: 320, damping: 30, mass: 1 },
} satisfies Record<string, Transition>;

export const transition = {
  fast: { duration: duration.fast, ease: easeOut },
  base: { duration: duration.base, ease: easeOut },
  slow: { duration: duration.slow, ease: easeOut },
  exit: { duration: duration.fast, ease: easeIn },
} satisfies Record<string, Transition>;

/* ------------------------------------------------------------------ *
 * Route transition
 *
 * The outgoing page recedes slightly as it fades — receding reads as
 * "this is being put away", where a plain fade reads as a screenshot
 * swap. The incoming page rises into place. The two do not overlap:
 * `mode="wait"` keeps the screen from showing two pages at once, which
 * is what makes a transition feel cheap.
 * ------------------------------------------------------------------ */

export const routeVariants: Variants = {
  hidden: { opacity: 0, y: 8, scale: 0.995 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: duration.slow, ease: easeOut, staggerChildren: 0.04 },
  },
  exit: {
    opacity: 0,
    y: -4,
    scale: 0.997,
    transition: { duration: duration.fast, ease: easeIn },
  },
};

/* ------------------------------------------------------------------ *
 * Page composition
 *
 * A screen arrives in reading order — heading, then controls, then the
 * body, then its rows. Each step trails the one above by a frame or two:
 * enough to read as a cascade, never enough to read as waiting.
 * ------------------------------------------------------------------ */

export const stage: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.045 } },
};

export const stageItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: duration.slow, ease: easeOut } },
};

/** Rows and cells: tighter than blocks, because a list should feel quick. */
export const listStage: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.022 } },
};

export const listItem: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: duration.base, ease: easeOut } },
  exit: { opacity: 0, y: -4, transition: transition.exit },
};

/* ------------------------------------------------------------------ *
 * Surfaces
 * ------------------------------------------------------------------ */

export const overlay: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: transition.base },
  exit: { opacity: 0, transition: transition.exit },
};

export const dialog: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: 10 },
  visible: { opacity: 1, scale: 1, y: 0, transition: spring.pop },
  exit: { opacity: 0, scale: 0.98, y: 6, transition: transition.exit },
};

export const popover: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: -6 },
  visible: { opacity: 1, scale: 1, y: 0, transition: transition.base },
  exit: { opacity: 0, scale: 0.98, y: -3, transition: transition.exit },
};

export const toast: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: spring.pop },
  exit: { opacity: 0, y: 8, scale: 0.98, transition: transition.exit },
};

/**
 * A record that has just been created. It arrives with a touch of overshoot
 * so the eye is drawn to where it landed — the one place a little bounce
 * earns its keep, because "your thing is here" is the message.
 */
export const created: Variants = {
  hidden: { opacity: 0, scale: 0.94, y: -8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: spring.pop },
};
