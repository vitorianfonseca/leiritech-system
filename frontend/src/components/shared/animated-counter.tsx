"use client";

import * as React from "react";
import {
  animate,
  useMotionValue,
  useReducedMotion,
  useInView,
} from "framer-motion";
import { cn } from "@/lib/utils";

export interface AnimatedCounterProps
  extends Omit<React.ComponentProps<"span">, "children"> {
  /** Target value to count up (or down) to. */
  value: number;
  /** Animation duration in seconds. */
  duration?: number;
  /** Number of decimal places to render. */
  decimals?: number;
  /** Optional formatter (e.g. EUR / pt-PT). Overrides `decimals`. */
  format?: (value: number) => string;
  prefix?: string;
  suffix?: string;
  /** Only start counting when scrolled into view. */
  startOnView?: boolean;
}

/**
 * Count-up number used for dashboard metrics. Respects `prefers-reduced-motion`:
 * reduced-motion users see the final value instantly (no tween). Uses
 * `tabular-nums` so digits don't jitter width during the count.
 */
export function AnimatedCounter({
  value,
  duration = 1,
  decimals = 0,
  format,
  prefix,
  suffix,
  startOnView = true,
  className,
  ...props
}: AnimatedCounterProps) {
  const reduceMotion = useReducedMotion();
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const motionValue = useMotionValue(0);

  const render = React.useCallback(
    (n: number) => (format ? format(n) : n.toFixed(decimals)),
    [format, decimals]
  );

  const shouldAnimate = !reduceMotion && (!startOnView || inView);
  const [display, setDisplay] = React.useState(() => render(0));

  React.useEffect(() => {
    if (!shouldAnimate) return;
    // `onUpdate` runs asynchronously via the animation frame loop, not
    // synchronously in the effect body.
    const controls = animate(motionValue, value, {
      duration,
      ease: "easeOut",
      onUpdate: (latest) => setDisplay(render(latest)),
    });
    return () => controls.stop();
  }, [shouldAnimate, value, duration, motionValue, render]);

  // Reduced-motion (or not-yet-in-view) users read the exact value directly.
  const text = shouldAnimate ? display : render(value);

  return (
    <span
      ref={ref}
      className={cn("tabular-nums", className)}
      aria-label={`${prefix ?? ""}${render(value)}${suffix ?? ""}`}
      {...props}
    >
      {prefix}
      <span aria-hidden>{text}</span>
      {suffix}
    </span>
  );
}
