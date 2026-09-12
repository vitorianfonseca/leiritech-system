/**
 * The LeiriTech motion vocabulary.
 *
 * A page arrives as a fade running top to bottom: whatever sits higher
 * resolves first, each block a beat behind the one above it. Opacity and a
 * few pixels of travel, nothing else — no blur, no scale. Compositing a blur
 * on a full page is expensive enough to drop frames, which is exactly the
 * "not smooth" it was meant to avoid.
 *
 * The whole opening is under 300ms end to end. Delay is the thing that makes
 * an interface feel slow, and a stagger is only legible while it is short:
 * past about 40ms a cascade stops reading as one movement and starts
 * reading as waiting.
 *
 * Every variant collapses to a cut under `prefers-reduced-motion`, which
 * `useReducedMotion()` reports and framer-motion honours via `MotionConfig`.
 */

import type { Transition, Variants } from "framer-motion";

export const duration = {
  instant: 0.1,
  fast: 0.14,
  base: 0.2,
  slow: 0.28,
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
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: transition.base },
};

/** The page's cascade. No `delayChildren`: the first block starts at once. */
export const stageVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.035 } },
};

/** A block in the cascade — a panel, a strip, a section. */
export const blockVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.base, ease: ease.out },
  },
};

/**
 * Figures and rows inherit the page's cascade rather than starting their own.
 * Nesting a second stagger inside the first is what pushed the last row past
 * half a second; these keep the same downward direction and add no delay.
 */
export const cellsVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.02 } },
};

export const cellVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: transition.fast },
};

export const listVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.02 } },
};

export const rowVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: transition.fast },
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

/*
 * There is deliberately no `lift` helper here any more.
 *
 * A framer-motion `whileHover` writes inline style on the very element the
 * pointer is over, and each write re-resolves hit-testing: the browser fires
 * pointerout/pointerover even though the mouse never moved out of the
 * element, and the cursor blinks between arrow and pointer. Measured at two
 * spurious exits per slow glide across a dashboard cell.
 *
 * Hover and press states belong in CSS, where the browser resolves them
 * without anything mutating the DOM under the pointer.
 */
