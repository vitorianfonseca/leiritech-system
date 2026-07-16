import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CalendarClock, TriangleAlert, ListTodo } from "lucide-react";
import { getSession } from "@/lib/session";
import { PageHeader } from "@/components/shell/page-header";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("myWork") };
}

export default async function MyWorkPage() {
  const t = await getTranslations("foundation.myWork");
  const session = await getSession();
  const firstName = session?.name.split(" ")[0] ?? "";

  const columns = [
    { key: "today", icon: CalendarClock, count: 4, tone: "gold" as const },
    { key: "overdue", icon: TriangleAlert, count: 2, tone: "destructive" as const },
    { key: "thisWeek", icon: ListTodo, count: 9, tone: "neutral" as const },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("greeting", { name: firstName })}
        subtitle={t("subtitle")}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {columns.map((col) => {
          const Icon = col.icon;
          return (
            <Card key={col.key}>
              <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="size-4 text-muted-foreground" strokeWidth={1.8} aria-hidden />
                  {t(col.key)}
                </CardTitle>
                <Badge variant={col.tone === "neutral" ? "outline" : col.tone === "gold" ? "gold" : "destructive"}>
                  {col.count}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-border/70 bg-card px-3 py-2.5"
                  >
                    <div className="h-3.5 w-3/4 rounded bg-muted" />
                    <div className="mt-2 h-2.5 w-1/3 rounded bg-muted/60" />
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground/70">
        {t("placeholderNote")}
      </p>
    </div>
  );
}
