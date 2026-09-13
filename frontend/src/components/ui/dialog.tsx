"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * The dialog shell.
 *
 * Every dialog in the app is built from the same three bands, because a dialog
 * that composes its own padding ends up with its own idea of what a dialog is:
 * a flat sheet where the title, the fields and the confirm button all sit on
 * one ground at one weight, and nothing tells you where to look or what the
 * dialog is actually asking.
 *
 *   Header — a mark, then the question, then the detail. Three sizes in that
 *            order, so the eye lands on the question first.
 *   Body   — the working area, and the only band that scrolls. A long form
 *            used to push the confirm button off the bottom of the screen.
 *   Footer — its own recessed ground behind a hairline. The commit action
 *            reads as a commitment rather than as one more inline control.
 *
 * Tone tints the header's mark, never the whole sheet: a destructive confirm
 * should be unmistakable at a glance without the dialog turning red.
 */

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root {...props} />;
}

function DialogTrigger(
  props: React.ComponentProps<typeof DialogPrimitive.Trigger>
) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Popup>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        data-slot="dialog-backdrop"
        className={cn(
          "fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] transition-opacity",
          "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0"
        )}
      />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        // A column with a ceiling, so the body is what scrolls and the footer
        // stays on screen. The sheet used to be pinned at 12% from the top with
        // no maximum height, so a tall form ran off the bottom of the window
        // and took its confirm button with it.
        className={cn(
          "glass glass-overlay text-popover-foreground fixed left-1/2 top-1/2 z-50 flex max-h-[min(48rem,calc(100dvh-3rem))] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl outline-none",
          "transition-[transform,opacity] data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0 data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0",
          className
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

const HEADER_TONES = {
  neutral: "text-muted-foreground",
  signal: "[--chip:var(--signal)] text-signal",
  success: "[--chip:var(--success)] text-success",
  warning: "[--chip:var(--warning)] text-warning",
  danger: "[--chip:var(--destructive)] text-destructive",
} as const;

export type DialogTone = keyof typeof HEADER_TONES;

function DialogHeader({
  icon: Icon,
  tone = "signal",
  eyebrow,
  title,
  description,
  dismissable = true,
  className,
  children,
}: {
  /** Optional mark. Carries the tone; without one the header is text only. */
  icon?: LucideIcon;
  tone?: DialogTone;
  /** The context the dialog acts on — a project, a client, a stage. */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Set false for a dialog that must be answered rather than dismissed. */
  dismissable?: boolean;
  className?: string;
  /** Anything that belongs beside the heading — a status badge, an action. */
  children?: React.ReactNode;
}) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex shrink-0 items-start gap-3 px-6 pt-6 pb-5", className)}
    >
      {Icon ? (
        <span
          className={cn(
            "glass-chip mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl",
            HEADER_TONES[tone]
          )}
          aria-hidden
        >
          <Icon className="size-[1.125rem]" strokeWidth={1.8} />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        {eyebrow ? (
          <p className="mb-1 truncate text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <DialogTitle>{title}</DialogTitle>
        {description ? (
          <DialogDescription className="mt-1.5">{description}</DialogDescription>
        ) : null}
      </div>
      {children}
      {dismissable ? (
        <DialogClose
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="-mr-1.5 -mt-1.5 shrink-0 text-muted-foreground"
            />
          }
        >
          <X className="size-4" strokeWidth={1.8} />
          <span className="sr-only">Close</span>
        </DialogClose>
      ) : null}
    </div>
  );
}

/** The working area — the only band that scrolls. */
function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn(
        "dialog-body min-h-0 flex-1 overflow-y-auto border-t border-border/70 px-6 py-5",
        className
      )}
      {...props}
    />
  );
}

/**
 * The commit band. Actions are right-aligned on a desktop and reverse-stacked
 * on a phone, so the confirm sits under the thumb and cancel above it.
 */
function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      // A translucent darkening layer rather than an opaque muted fill. The
      // sheet is glass, so an opaque light grey composites *lighter* than the
      // blurred backdrop showing through the body -- measured 252 against the
      // body's 240, which read as a raised band instead of a recessed one.
      className={cn(
        "flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-foreground/[0.035] px-6 py-4 sm:flex-row sm:items-center sm:justify-end",
        className
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-xl font-semibold leading-snug tracking-[-0.02em] text-foreground",
        className
      )}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  );
}

const DialogClose = DialogPrimitive.Close;

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
};
