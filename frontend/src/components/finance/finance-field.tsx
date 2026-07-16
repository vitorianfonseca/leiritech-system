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

interface FinanceFieldProps {
  label: string;
  error?: string;
  hint?: string;
  /** Marks the label with a required indicator (e.g. completion criteria). */
  required?: boolean;
  className?: string;
  children: (control: { controlProps: ControlProps }) => React.ReactNode;
}

/**
 * Accessible field wrapper for the finance dialogs. Uses `useId` so multiple
 * fields (and multiple dialogs) never collide, wires label/aria-describedby,
 * and renders inline `role="alert"` validation errors.
 */
export function FinanceField({
  label,
  error,
  hint,
  required,
  className,
  children,
}: FinanceFieldProps) {
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
            *
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
        <p
          id={errorId}
          role="alert"
          className="flex items-center gap-1.5 text-sm text-destructive"
        >
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
