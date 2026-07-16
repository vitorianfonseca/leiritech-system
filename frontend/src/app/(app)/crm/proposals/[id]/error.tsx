"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { TriangleAlert, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("proposals.errorBoundary");
  return (
    <div className="py-8">
      <EmptyState
        icon={TriangleAlert}
        title={t("title")}
        description={t("description")}
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" size="lg" onClick={reset}>
              <RefreshCw aria-hidden />
              {t("retry")}
            </Button>
            <Button variant="ghost" size="lg" nativeButton={false} render={<Link href="/crm/proposals" />}>
              {t("backToList")}
            </Button>
          </div>
        }
      />
    </div>
  );
}
