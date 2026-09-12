"use client";

import * as React from "react";
import { Toast } from "@base-ui/react/toast";
import { useTranslations } from "next-intl";
import {
  CheckCircle2,
  Info,
  AlertTriangle,
  XCircle,
  Undo2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * Types + global manager
 * ------------------------------------------------------------------ */

export type ToastTone = "default" | "success" | "warning" | "destructive" | "info";

/** Custom payload carried on each toast. */
export interface LeiritechToastData {
  tone?: ToastTone;
  onUndo?: () => void | Promise<void>;
}

export interface ToastOptions {
  title?: string;
  description?: string;
  tone?: ToastTone;
  /** Auto-dismiss delay in ms. `0` keeps it until dismissed. Defaults to 5000. */
  duration?: number;
}

export interface UndoToastOptions extends Omit<ToastOptions, "tone"> {
  /** Callback invoked when the user hits "Undo". */
  onUndo: () => void | Promise<void>;
  tone?: ToastTone;
}

/**
 * Global toast manager. Because it lives outside the React tree, `toast()` and
 * `toastWithUndo()` can be called from anywhere (event handlers, mutation
 * callbacks, non-component modules) and still render in the single <Toaster/>.
 */
export const leiritechToastManager = Toast.createToastManager<LeiritechToastData>();

/** Fire a basic toast. Returns the toast id. */
export function toast(options: ToastOptions): string {
  const { title, description, tone = "default", duration } = options;
  return leiritechToastManager.add({
    title,
    description,
    timeout: duration,
    data: { tone },
  });
}

/**
 * Fire a toast with an Undo action — the standard pattern for
 * archive / move / state-change / remove. The action button runs `onUndo` and
 * dismisses the toast. Defaults to a longer 6s window so the user can react.
 */
export function toastWithUndo(options: UndoToastOptions): string {
  const { title, description, onUndo, tone = "default", duration = 6000 } = options;
  return leiritechToastManager.add({
    title,
    description,
    timeout: duration,
    data: { tone, onUndo },
  });
}

/** Programmatically dismiss a toast (or the latest when no id is given). */
export function dismissToast(id?: string): void {
  leiritechToastManager.close(id);
}

/**
 * Ergonomic hook for components. Returns the same imperative helpers bound to
 * the global manager, so call sites read naturally: `const { toast } = useToast()`.
 */
export function useToast() {
  return React.useMemo(
    () => ({ toast, toastWithUndo, dismiss: dismissToast }),
    []
  );
}

/* ------------------------------------------------------------------ *
 * Renderer
 * ------------------------------------------------------------------ */

const toneIcon: Record<ToastTone, LucideIcon | null> = {
  default: null,
  success: CheckCircle2,
  warning: AlertTriangle,
  destructive: XCircle,
  info: Info,
};

const toneAccent: Record<ToastTone, string> = {
  default: "before:bg-border",
  success: "before:bg-success",
  warning: "before:bg-warning",
  destructive: "before:bg-destructive",
  info: "before:bg-info",
};

const toneIconColor: Record<ToastTone, string> = {
  default: "text-muted-foreground",
  success: "text-success",
  warning: "text-warning-foreground",
  destructive: "text-destructive",
  info: "text-info",
};

function ToastList() {
  const { toasts } = Toast.useToastManager<LeiritechToastData>();
  const t = useTranslations("shared.toast");

  return (
    <>
      {toasts.map((item) => {
        const tone = item.data?.tone ?? "default";
        const Icon = toneIcon[tone];
        const onUndo = item.data?.onUndo;
        return (
          <Toast.Root
            key={item.id}
            toast={item}
            className={cn(
              "relative flex w-full items-start gap-3 overflow-hidden rounded-xl border border-border bg-popover py-3 pl-4 pr-3 text-popover-foreground shadow-lg",
              "before:absolute before:inset-y-0 before:left-0 before:w-1",
              toneAccent[tone],
              "transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none",
              "data-[starting-style]:translate-y-2 data-[starting-style]:opacity-0",
              "data-[ending-style]:translate-y-1 data-[ending-style]:opacity-0",
              "data-[limited]:opacity-0"
            )}
          >
            <Toast.Content className="flex min-w-0 flex-1 items-start gap-3">
              {Icon ? (
                <Icon
                  className={cn("mt-0.5 size-4 shrink-0", toneIconColor[tone])}
                  strokeWidth={1.8}
                  aria-hidden
                />
              ) : null}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <Toast.Title className="text-sm font-semibold leading-snug" />
                <Toast.Description className="text-sm text-muted-foreground" />
              </div>
            </Toast.Content>

            <div className="flex shrink-0 items-center gap-1">
              {onUndo ? (
                <Toast.Action
                  className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-signal transition-colors hover:bg-signal-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => onUndo()}
                >
                  <Undo2 className="size-3.5" strokeWidth={1.8} aria-hidden />
                  {t("undo")}
                </Toast.Action>
              ) : null}
              <Toast.Close
                aria-label={t("dismiss")}
                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-4" strokeWidth={1.8} aria-hidden />
              </Toast.Close>
            </div>
          </Toast.Root>
        );
      })}
    </>
  );
}

/**
 * Mount once near the app root. Provides the toast viewport bound to the global
 * manager. Toasts are announced in a landmark region (F6 to focus) for a11y.
 */
export function Toaster() {
  const t = useTranslations("shared.toast");
  return (
    <Toast.Provider toastManager={leiritechToastManager}>
      <Toast.Portal>
        <Toast.Viewport
          aria-label={t("region")}
          className="fixed bottom-4 right-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 outline-none sm:bottom-6 sm:right-6"
        >
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}
