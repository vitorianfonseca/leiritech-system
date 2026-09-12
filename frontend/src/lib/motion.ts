/**
 * The LeiriTech motion vocabulary.
 *
 * Motion here is orchestration, not decoration: a screen arrives as one
 * composed sequence — frame, then figures, then the queue — so the eye is
 * led through the page in the order the page wants to be read. Numbers count
 * up because a figure settling reads as a measurement being taken; rows
 * cascade because a list arriving as one block reads as a screenshot.
 *
 * Everything a person triggers still resolves fast (under 260ms). Only the
 * opening sequence is allowed to take its time, and even then it is under
 * three quarters of a second end to end.
 *
 * Every variant collapses to a cut under `prefers-reduced-motion`, which
 * `useReducedMotion()` reports and framer-motion honours on `MotionConfig`.
 */

import type { Transition, Variants } from "framer-motion";

export const duration = {
  instant: 0.1,
  fast: 0.16,
  base: 0.26,
  slow: 0.42,
} as const;

export const ease = {
  /** Decelerating. Anything arriving. */
  out: [0.16, 1, 0.3, 1],
  inOut: [0.76, 0, 0.24, 1],
  /** A little overshoot. Toggles, checks, counters — never layout. */
  spring: [0.34, 1.4, 0.64, 1],
} as const;

export const transition = {
  fast: { duration: duration.fast, ease: ease.out },
  base: { duration: duration.base, ease: ease.out },
  slow: { duration: duration.slow, ease: ease.out },
  spring: { type: "spring", stiffness: 420, damping: 32, mass: 0.8 },
} satisfies Record<string, Transition>;

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: transition.slow },
};

/** The screen's opening sequence: children arrive in reading order. */
export const stageVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.07, delayChildren: 0.06 },
  },
};

/** A block within the sequence — a panel, a chart, a section. */
export const blockVariants: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.985 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: duration.slow, ease: ease.out },
  },
};

/** A strip of figures: each cell lifts a beat after the one before it. */
export const cellsVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.045, delayChildren: 0.1 } },
};

export const cellVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: transition.spring },
};

/** A queue of rows. Tighter than the cells — a list should feel quick. */
export const listVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.035, delayChildren: 0.14 } },
};

export const rowVariants: Variants = {
  hidden: { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0, transition: transition.base },
};

/* ------------------------------------------------------------------ *
 * Surfaces
 * ------------------------------------------------------------------ */

export const modalVariants: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: transition.slow },
  exit: { opacity: 0, scale: 0.98, y: 4, transition: transition.fast },
};

export const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: transition.base },
  exit: { opacity: 0, transition: transition.fast },
};

export const popoverVariants: Variants = {
  hidden: { opacity: 0, y: -6, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: transition.base },
  exit: { opacity: 0, y: -3, transition: transition.fast },
};

export const toastVariants: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: transition.spring },
  exit: { opacity: 0, y: 8, transition: transition.fast },
};

/** Shared hover/press feel for anything that lifts off the page. */
export const lift = {
  whileHover: { y: -2, transition: { duration: duration.fast, ease: ease.out } },
  whileTap: { scale: 0.985, transition: { duration: 0.08 } },
} as const;
