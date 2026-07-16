"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormAlert } from "./form-alert";

/**
 * Shared error boundary UI for auth routes. Each route's `error.tsx` (a Client
 * Component, as required) renders this with its `reset` handler.
 */
export function AuthErrorState({ reset }: { reset: () => void }) {
  const t = useTranslations("auth.errorBoundary");
  return (
    <Card className="shadow-md">
      <CardHeader>
        <FormAlert tone="error" title={t("title")} description={t("body")} />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button onClick={reset} className="h-10 w-full">
          {t("retry")}
        </Button>
        <Button
          variant="ghost"
          className="h-10 w-full"
          nativeButton={false}
          render={<Link href="/login" />}
        >
          {t("backToLogin")}
        </Button>
      </CardContent>
    </Card>
  );
}
