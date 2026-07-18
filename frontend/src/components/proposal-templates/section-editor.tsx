"use client";

import { useTranslations } from "next-intl";
import { ChevronUp, ChevronDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SectionData } from "@/lib/api/proposal-content-types";

const TEXTAREA_CLASS =
  "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

export interface SectionEditorProps {
  value: SectionData[];
  onChange: (sections: SectionData[]) => void;
}

/**
 * Ordered rich-text section blocks (heading + body). Bodies accept
 * placeholders like {{cliente}}, {{empresa}}, {{data}}, {{validade}} resolved
 * at instantiation. Sections can be reordered and removed.
 */
export function SectionEditor({ value, onChange }: SectionEditorProps) {
  const t = useTranslations("proposalTemplates.sections");

  const update = (index: number, patch: Partial<SectionData>) =>
    onChange(value.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const move = (index: number, delta: number) => {
    const next = [...value];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {value.map((section, index) => (
        <div key={index} className="space-y-2 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Input
              aria-label={t("heading")}
              value={section.heading}
              onChange={(e) => update(index, { heading: e.target.value })}
              placeholder={t("headingPlaceholder")}
              className="flex-1 font-medium"
            />
            <Button type="button" variant="ghost" size="icon" aria-label={t("moveUp")} disabled={index === 0} onClick={() => move(index, -1)}>
              <ChevronUp className="size-4" aria-hidden />
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label={t("moveDown")} disabled={index === value.length - 1} onClick={() => move(index, 1)}>
              <ChevronDown className="size-4" aria-hidden />
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label={t("remove")} onClick={() => onChange(value.filter((_, i) => i !== index))}>
              <Trash2 className="size-4 text-destructive" aria-hidden />
            </Button>
          </div>
          <textarea
            aria-label={t("body")}
            value={section.body}
            onChange={(e) => update(index, { body: e.target.value })}
            rows={4}
            placeholder={t("bodyPlaceholder")}
            className={TEXTAREA_CLASS}
          />
        </div>
      ))}

      <Button type="button" variant="outline" onClick={() => onChange([...value, { heading: "", body: "" }])}>
        <Plus aria-hidden />
        {t("add")}
      </Button>
      <p className="text-xs text-muted-foreground">{t("placeholderHint")}</p>
    </div>
  );
}
