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

interface FormFieldProps {
  /** Field name — used to derive stable ids for label/error wiring. */
  name: string;
  label: string;
  error?: string;
  /** Optional helper text shown below the control when there is no error. */
  hint?: string;
  className?: string;
  /** Render the control, spreading `controlProps` for correct a11y wiring. */
  children: (control: { controlProps: ControlProps }) => React.ReactNode;
}

/**
 * Accessible field wrapper: associates the label with the control, exposes
 * `aria-invalid` / `aria-describedby`, and renders an inline error with
 * `role="alert"` so assistive tech announces validation failures.
 */
export function FormField({
  name,
  label,
  error,
  hint,
  className,
  children,
}: FormFieldProps) {
  const id = `field-${name}`;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
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
          <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
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
