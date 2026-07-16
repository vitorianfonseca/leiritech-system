"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared";
import type { badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];

export interface TaskGroupProps {
  title: string;
  icon: LucideIcon;
  /** Real count shown in the header badge. */
  count: number;
  badgeVariant?: BadgeVariant;
  /** Empty-state copy shown when there are no items. */
  emptyTitle: string;
  emptyDescription?: string;
  children?: React.ReactNode;
  className?: string;
}

/**
 * A titled group card for the daily hub. Renders an icon + title + count badge,
 * then its children — or a bare empty state when the group has no items. The
 * count is always driven by real data.
 */
export function TaskGroup({
  title,
  icon: Icon,
  count,
  badgeVariant = "outline",
  emptyTitle,
  emptyDescription,
  children,
  className,
}: TaskGroupProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon
            className="size-[18px] text-muted-foreground"
            strokeWidth={1.8}
            aria-hidden
          />
          {title}
        </CardTitle>
        <Badge variant={count > 0 ? badgeVariant : "outline"} aria-hidden>
          {count}
        </Badge>
      </CardHeader>
      <CardContent>
        {count === 0 ? (
          <EmptyState
            variant="bare"
            title={emptyTitle}
            description={emptyDescription}
            className="py-8"
          />
        ) : (
          <div className="space-y-2">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}
