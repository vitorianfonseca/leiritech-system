"use client";

import { AuthErrorState } from "@/components/auth/auth-error-state";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <AuthErrorState reset={reset} />;
}
