"use client";

import * as React from "react";
import Lenis from "lenis";
import { usePathname } from "@/i18n/navigation";

/**
 * Smooth scrolling for the app's scroll container.
 *
 * The app does not scroll the window — `<main>` inside the shell is the
 * scroller, with the sidebar and topbar held still outside it. Lenis therefore
 * has to be pointed at that element and its inner content wrapper; left on its
 * default it would drive `document.documentElement`, which never moves here,
 * and the page would simply stop scrolling.
 *
 * Two things it deliberately does not touch:
 *
 * It leaves nested scrollers alone. Any element marked `data-lenis-prevent`
 * (a dialog body, a long menu, a horizontally scrolling table) keeps native
 * scrolling, because interpolating a small inner list feels like lag rather
 * than polish.
 *
 * And it yields entirely to `prefers-reduced-motion`. Smooth scrolling is
 * exactly the kind of motion that setting exists to turn off, so when it is
 * set no instance is created at all — not one configured to animate less.
 */
export function SmoothScroll({
  wrapper,
  content,
}: {
  wrapper: React.RefObject<HTMLElement | null>;
  content: React.RefObject<HTMLElement | null>;
}) {
  const pathname = usePathname();
  const lenisRef = React.useRef<Lenis | null>(null);
  // Held locally: writing `scrollTop` through the `wrapper` prop reads to the
  // React compiler as mutating a prop, even though it only touches the DOM.
  const elementRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    const wrapperEl = wrapper.current;
    const contentEl = content.current;
    if (!wrapperEl || !contentEl) return;

    elementRef.current = wrapperEl;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;

    const lenis = new Lenis({
      wrapper: wrapperEl,
      content: contentEl,
      // Short and heavily eased: the wheel should feel like it carries weight,
      // not like the page is catching up. Anything longer reads as lag.
      duration: 0.9,
      easing: (t: number) => 1 - Math.pow(1 - t, 4),
      wheelMultiplier: 1,
      touchMultiplier: 1.6,
      // Trackpad and touch already interpolate in hardware; smoothing them
      // again fights the gesture.
      syncTouch: false,
    });
    lenisRef.current = lenis;

    let frame = 0;
    function raf(time: number) {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    }
    frame = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [wrapper, content]);

  // A new page starts at the top. Without this the instance keeps the previous
  // route's offset and a short page opens already scrolled past its heading.
  React.useEffect(() => {
    lenisRef.current?.scrollTo(0, { immediate: true });
    const el = elementRef.current;
    if (el) el.scrollTop = 0;
  }, [pathname]);

  return null;
}
