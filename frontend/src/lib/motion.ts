/**
 * The LeiriTech motion vocabulary.
 *
 * One set of durations and curves for the whole app, mirroring the CSS
 * tokens in `globals.css`. The rule behind the numbers: this is software
 * someone uses for hours, so motion exists to explain what changed — never
 * to perform. Anything a person triggers resolves in under 240ms; only
 * things that enter or leave the screen entirely are allowed 360ms.
 *
 * Every variant here degrades to an instant cut under
 * `prefers-reduced-motion`, via `useReducedMotion` in `useMotion()`.
 */

import type { Transition, Variants } from "framer-motion";

export const duration = {
  instant: 0.1, // state flips: checkbox, toggle
  fast: 0.16, // hover, focus, press
  base: 0.24, // dropdowns, popovers, toasts
  slow: 0.36, // modals, drawers, page transitions
} as const;

export const ease = {
  /** Decelerating. The default for anything arriving. */
  out: [0.22, 1, 0.36, 1],
  /** Symmetric. For things that move without arriving or leaving. */
  inOut: [0.76, 0, 0.24, 1],
  /** Slight overshoot. Toggles and checkmarks only — never layout. */
  spring: [0.34, 1.56, 0.64, 1],
} as const;

export const transition = {
  fast: { duration: duration.fast, ease: ease.out },
  base: { duration: duration.base, ease: ease.out },
  slow: { duration: duration.slow, ease: ease.out },
  spring: { duration: duration.base, ease: ease.spring },
} satisfies Record<string, Transition>;

/* ------------------------------------------------------------------ *
 * Variants
 * ------------------------------------------------------------------ */

/** Page-level. Content settles downward by a few pixels, never sideways. */
export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: transition.slow },
};

/**
 * List container. Staggers children so a list reads as one arrival rather
 * than N separate ones. The stagger is short on purpose — a long cascade
 * is the thing that makes an interface feel slow.
 */
export const listVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.03, delayChildren: 0.02 } },
};

export const rowVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: transition.base },
};

/** Modals and drawers: scale is subtle — this is not a photo viewer. */
export const modalVariants: Variants = {
  hidden: { opacity: 0, scale: 0.98, y: 6 },
  visible: { opacity: 1, scale: 1, y: 0, transition: transition.slow },
  exit: { opacity: 0, scale: 0.98, y: 4, transition: transition.fast },
};

export const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: transition.base },
  exit: { opacity: 0, transition: transition.fast },
};

/** Dropdowns and popovers: translate only, anchored to their trigger. */
export const popoverVariants: Variants = {
  hidden: { opacity: 0, y: -4, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: transition.base },
  exit: { opacity: 0, y: -2, transition: transition.fast },
};

export const toastVariants: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: transition.base },
  exit: { opacity: 0, y: 8, transition: transition.fast },
};

/** Press feedback shared by every interactive surface. */
export const press = { scale: 0.985 } as const;
