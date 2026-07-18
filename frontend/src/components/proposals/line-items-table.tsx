"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableCombobox, type ComboboxItem } from "@/components/shared";
import { parseEuroToCents } from "@/components/proposals/proposal-format";
import { catalogApi } from "@/lib/api/catalog";
import { BILLING_TYPES } from "@/lib/api/catalog-types";
import type { LineItem } from "@/lib/api/proposal-content-types";

const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function centsToEuro(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function blankLine(): LineItem {
  return {
    catalogItemId: null,
    name: "",
    unit: "unit",
    unitPrice: 0,
    taxRate: "23.00",
    billingType: "one_time",
    quantity: 1,
  };
}

export interface LineItemsTableProps {
  value: LineItem[];
  onChange: (lines: LineItem[]) => void;
}

/**
 * Editable priced line-item grid. A catalog picker snapshots the chosen item's
 * name/unit/price/tax/billing into a new row (later catalog edits never touch
 * it); rows can also be added and edited manually (ad-hoc). Emits the full list
 * on every change so the parent can recompute live totals.
 */
export function LineItemsTable({ value, onChange }: LineItemsTableProps) {
  const t = useTranslations("proposals.lineItems");
  const tBilling = useTranslations("catalog.billing");

  const { data: catalog } = useQuery({
    queryKey: ["catalog", "list"],
    queryFn: () => catalogApi.list({ pageSize: 100 }),
  });

  const catalogOptions: ComboboxItem[] = (catalog?.items ?? []).map((c) => ({
    value: c.id,
    label: `${c.name} · ${centsToEuro(c.unitPrice)} €`,
  }));

  const update = (index: number, patch: Partial<LineItem>) => {
    onChange(value.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const addFromCatalog = (catalogItemId: string | null) => {
    const item = (catalog?.items ?? []).find((c) => c.id === catalogItemId);
    if (!item) return;
    onChange([
      ...value,
      {
        catalogItemId: item.id,
        name: item.name,
        unit: item.unit,
        unitPrice: item.unitPrice,
        taxRate: item.taxRate,
        billingType: item.billingType,
        quantity: 1,
      },
    ]);
  };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-y-2">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-2">{t("name")}</th>
              <th className="w-20 px-2 text-right">{t("quantity")}</th>
              <th className="w-32 px-2 text-right">{t("unitPrice")}</th>
              <th className="w-20 px-2 text-right">{t("taxRate")}</th>
              <th className="w-28 px-2">{t("billing")}</th>
              <th className="w-10 px-2" aria-hidden />
            </tr>
          </thead>
          <tbody>
            {value.map((line, index) => (
              <tr key={index} className="align-top">
                <td className="px-2">
                  <Input
                    aria-label={t("name")}
                    value={line.name}
                    onChange={(e) => update(index, { name: e.target.value })}
                    placeholder={t("namePlaceholder")}
                  />
                </td>
                <td className="px-2">
                  <Input
                    aria-label={t("quantity")}
                    inputMode="decimal"
                    className="text-right"
                    value={String(line.quantity)}
                    onChange={(e) => update(index, { quantity: Number(e.target.value.replace(",", ".")) || 0 })}
                  />
                </td>
                <td className="px-2">
                  <Input
                    aria-label={t("unitPrice")}
                    inputMode="decimal"
                    className="text-right"
                    defaultValue={centsToEuro(line.unitPrice)}
                    onBlur={(e) => update(index, { unitPrice: parseEuroToCents(e.target.value) ?? 0 })}
                  />
                </td>
                <td className="px-2">
                  <Input
                    aria-label={t("taxRate")}
                    inputMode="decimal"
                    className="text-right"
                    value={line.taxRate}
                    onChange={(e) => update(index, { taxRate: e.target.value })}
                  />
                </td>
                <td className="px-2">
                  <select
                    aria-label={t("billing")}
                    className={SELECT_CLASS}
                    value={line.billingType}
                    onChange={(e) => update(index, { billingType: e.target.value as LineItem["billingType"] })}
                  >
                    {BILLING_TYPES.map((b) => (
                      <option key={b} value={b}>
                        {tBilling(b)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("remove")}
                    onClick={() => onChange(value.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="size-4 text-destructive" aria-hidden />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-72 max-w-full">
          <SearchableCombobox
            items={catalogOptions}
            value={null}
            placeholder={t("addFromCatalog")}
            emptyMessage={t("noCatalog")}
            onValueChange={addFromCatalog}
          />
        </div>
        <Button type="button" variant="outline" onClick={() => onChange([...value, blankLine()])}>
          <Plus aria-hidden />
          {t("addManual")}
        </Button>
      </div>
    </div>
  );
}
