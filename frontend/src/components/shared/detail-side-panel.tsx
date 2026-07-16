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
  side?: "left" | "right";
  /** Panel width (Tailwind class), defaults to a comfortable detail width. */
  widthClassName?: string;
}

/**
 * Slide-over detail panel. Motion 150–300ms via framer-motion, collapsing to an
 * instant fade for `prefers-reduced-motion`. Provides its own focus trap,
 * Escape-to-close, scroll lock and focus restore, with header/tabs/footer slots.
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
  side = "right",
  widthClassName = "w-full sm:max-w-md md:max-w-lg",
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

  const offset = side === "right" ? "100%" : "-100%";

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50">
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
              "absolute inset-y-0 flex flex-col bg-card text-card-foreground shadow-lg outline-none",
              side === "right" ? "right-0 border-l" : "left-0 border-r",
              "border-border",
              widthClassName
            )}
            initial={reduceMotion ? { opacity: 0 } : { x: offset }}
            animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { x: offset }}
            transition={{ duration: reduceMotion ? 0 : 0.25, ease: "easeOut" }}
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
