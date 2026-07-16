"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SubmitButtonProps extends React.ComponentProps<typeof Button> {
  pending: boolean;
  pendingLabel: string;
}

/**
 * Full-width primary submit button with an inline pending state. Sets
 * `aria-busy` and swaps the label so both sighted and AT users know a request
 * is in flight; disabled while pending to prevent double submission.
 */
export function SubmitButton({
  pending,
  pendingLabel,
  children,
  className,
  disabled,
  ...props
}: SubmitButtonProps) {
  return (
    <Button
      type="submit"
      size="lg"
      aria-busy={pending}
      disabled={pending || disabled}
      className={cn("h-10 w-full", className)}
      {...props}
    >
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
