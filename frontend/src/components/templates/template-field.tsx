"use client";

import * as React from "react";
import { AlertCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface ControlProps {
  id: string;
  "aria-invalid": boolean | undefined;
  "aria-describedby": string | undefined;
}

interface TemplateFieldProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: (control: { controlProps: ControlProps }) => React.ReactNode;
}

/**
 * Accessible field wrapper for the template dialogs. Uses `useId` so multiple
 * fields never collide, wires label/aria-describedby, and renders inline
 * `role="alert"` validation errors (WCAG AA — never colour alone).
 */
export function TemplateField({
  label,
  error,
  hint,
  required,
  className,
  children,
}: TemplateFieldProps) {
  const id = React.useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden>
            {" *"}
          </span>
        ) : null}
      </Label>
      {children({
        controlProps: {
          id,
          "aria-invalid": error ? true : undefined,
          "aria-describedby": describedBy,
        },
      })}
      {error ? (
        <p id={errorId} role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Styled native select used across the template dialogs. */
export const TemplateSelect = React.forwardRef<
  HTMLSelectElement,
  React.ComponentProps<"select">
>(function TemplateSelect({ className, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        "flex h-9 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-sm shadow-sm outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        className,
      )}
      {...props}
    />
  );
});
