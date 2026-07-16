import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatTile({
  label,
  value,
  icon: Icon,
  delta,
  tone = "neutral",
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  delta?: { value: string; direction: "up" | "down"; positive?: boolean };
  tone?: "neutral" | "gold" | "success" | "warning" | "destructive";
}) {
  const toneRing: Record<string, string> = {
    neutral: "bg-secondary text-secondary-foreground",
    gold: "bg-gold-muted text-gold",
    success: "bg-success-muted text-success",
    warning: "bg-warning-muted text-warning-foreground",
    destructive: "bg-destructive-muted text-destructive",
  };

  return (
    <Card className="gap-0 py-5">
      <div className="flex items-start justify-between px-5">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-lg",
            toneRing[tone]
          )}
        >
          <Icon className="size-[18px]" strokeWidth={1.8} aria-hidden />
        </span>
      </div>
      <div className="mt-3 flex items-end gap-2 px-5">
        <span className="font-heading text-3xl font-semibold tracking-tight tabular-nums">
          {value}
        </span>
        {delta && (
          <span
            className={cn(
              "mb-1 inline-flex items-center gap-0.5 text-xs font-medium",
              delta.positive === false ? "text-destructive" : "text-success"
            )}
          >
            {delta.direction === "up" ? (
              <TrendingUp className="size-3.5" aria-hidden />
            ) : (
              <TrendingDown className="size-3.5" aria-hidden />
            )}
            {delta.value}
          </span>
        )}
      </div>
    </Card>
  );
}
