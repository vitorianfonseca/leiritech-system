"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export interface DetailSidePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Default header title (ignored when `header` slot is provided). */
  title?: string;
  /** Default header supporting copy. */
  description?: string;
  /** Replaces the default title/description header entirely. */
  header?: React.ReactNode;
  /** Rendered under the header, above the scrollable body (e.g. Tabs list). */
  tabs?: React.ReactNode;
  /** Sticky footer (e.g. action buttons). */
  footer?: React.ReactNode;
  /** Scrollable body content. */
  children?: React.ReactNode;
  /** Dialog width (Tailwind class), defaults to a comfortable detail width. */
  widthClassName?: string;
}

/**
 * Centred detail dialog.
 *
 * This used to slide in from the right edge. A slide-over puts the record it
 * opens hard against the window frame and leaves the page it came from
 * half-visible beside it, so the eye keeps being pulled back to a board it can
 * no longer use. Centring it gives the record the middle of the screen and
 * lets the backdrop do the work of saying the rest is inactive.
 *
 * Opens with a short rise and scale rather than a lateral sweep, collapsing to
 * an instant fade for `prefers-reduced-motion`. Provides its own focus trap,
 * Escape-to-close, scroll lock and focus restore, with header/tabs/footer
 * slots.
 */
export function DetailSidePanel({
  open,
  onOpenChange,
  title,
  description,
  header,
  tabs,
  footer,
  children,
  widthClassName = "sm:max-w-xl md:max-w-2xl",
}: DetailSidePanelProps) {
  const t = useTranslations("shared.sidePanel");
  const reduceMotion = useReducedMotion();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const previouslyFocused = React.useRef<HTMLElement | null>(null);
  const titleId = React.useId();
  // Client-only flag for the portal target, without a setState-in-effect.
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  // Scroll lock + focus management while open.
  React.useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panelRef.current)?.focus();
    }, 20);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = overflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const list = Array.from(nodes);
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onOpenChange]
  );

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
            onClick={() => onOpenChange(false)}
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={header ? undefined : titleId}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            className={cn(
              "relative flex max-h-[85vh] w-full flex-col overflow-hidden rounded-3xl border border-border bg-card text-card-foreground shadow-[0_8px_24px_-8px_oklch(0.28_0.06_285/0.18),0_32px_64px_-24px_oklch(0.28_0.06_285/0.28)] outline-none",
              widthClassName
            )}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.985 }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-start gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0 flex-1">
                {header ?? (
                  <>
                    {title ? (
                      <h2
                        id={titleId}
                        className="font-heading truncate text-lg font-semibold"
                      >
                        {title}
                      </h2>
                    ) : null}
                    {description ? (
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">
                        {description}
                      </p>
                    ) : null}
                  </>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("close")}
                onClick={() => onOpenChange(false)}
              >
                <X aria-hidden />
              </Button>
            </div>

            {tabs ? (
              <div className="border-b border-border px-5">{tabs}</div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

            {footer ? (
              <div className="border-t border-border bg-card px-5 py-4">{footer}</div>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
