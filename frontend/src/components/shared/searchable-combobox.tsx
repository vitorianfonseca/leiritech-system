"use client";

import * as React from "react";
import { Combobox } from "@base-ui/react/combobox";
import { useTranslations } from "next-intl";
import { Check, ChevronDown, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComboboxItem {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SearchableComboboxProps {
  items: ComboboxItem[];
  /** Selected value (controlled). */
  value?: string | null;
  onValueChange?: (value: string | null) => void;
  /** Uncontrolled initial value. */
  defaultValue?: string | null;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  clearable?: boolean;
  /**
   * Called on input changes. Provide when items are fetched remotely — the
   * caller updates `items` and toggles `loading`. Client-side filtering is
   * disabled when this is set (results are assumed pre-filtered by the caller).
   */
  onSearch?: (query: string) => void;
  loading?: boolean;
  id?: string;
  name?: string;
  "aria-label"?: string;
  className?: string;
  /** Popup width; defaults to matching the trigger. */
  popupClassName?: string;
}

/**
 * Accessible, keyboard-navigable combobox built on the base-ui Combobox
 * primitive. Works client-side (built-in filtering) or async (pass `onSearch`
 * + `loading` and update `items` yourself). Consumes design tokens only.
 */
export function SearchableCombobox({
  items,
  value,
  onValueChange,
  defaultValue,
  placeholder,
  emptyMessage,
  disabled,
  clearable = true,
  onSearch,
  loading = false,
  id,
  name,
  "aria-label": ariaLabel,
  className,
  popupClassName,
}: SearchableComboboxProps) {
  const t = useTranslations("shared.combobox");
  const isAsync = typeof onSearch === "function";

  const selectedItem = React.useMemo(
    () => (value != null ? items.find((i) => i.value === value) ?? null : value === null ? null : undefined),
    [items, value]
  );
  const defaultItem = React.useMemo(
    () => (defaultValue != null ? items.find((i) => i.value === defaultValue) ?? null : undefined),
    [items, defaultValue]
  );

  return (
    <Combobox.Root<ComboboxItem>
      items={items}
      value={selectedItem}
      defaultValue={defaultItem}
      onValueChange={(item) => onValueChange?.(item ? item.value : null)}
      isItemEqualToValue={(a, b) => a.value === b.value}
      onInputValueChange={isAsync ? (q) => onSearch!(q) : undefined}
      // When async, results are already filtered upstream — disable built-in filtering.
      filter={isAsync ? null : undefined}
      disabled={disabled}
      name={name}
    >
      <Combobox.InputGroup
        className={cn(
          "relative flex h-9 w-full items-center rounded-lg border border-input bg-background text-sm transition-colors",
          "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
          "aria-disabled:opacity-50",
          className
        )}
      >
        <Combobox.Input
          id={id}
          aria-label={ariaLabel}
          placeholder={placeholder ?? t("placeholder")}
          className="h-full w-full rounded-lg bg-transparent pl-3 pr-16 text-foreground outline-none placeholder:text-muted-foreground"
        />
        <div className="absolute right-1 flex h-full items-center gap-0.5 text-muted-foreground">
          {loading ? (
            <Loader2 className="mr-1 size-4 animate-spin motion-reduce:animate-none" aria-hidden />
          ) : null}
          {clearable ? (
            <Combobox.Clear
              aria-label={t("clear")}
              className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" strokeWidth={1.8} aria-hidden />
            </Combobox.Clear>
          ) : null}
          <Combobox.Trigger
            aria-label={t("placeholder")}
            className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronDown className="size-4" strokeWidth={1.8} aria-hidden />
          </Combobox.Trigger>
        </div>
      </Combobox.InputGroup>

      <Combobox.Portal>
        <Combobox.Positioner sideOffset={6} className="z-50 outline-none">
          <Combobox.Popup
            className={cn(
              "max-h-[min(22rem,var(--available-height))] w-[var(--anchor-width)] max-w-[var(--available-width)] overflow-y-auto overscroll-contain rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg",
              "origin-[var(--transform-origin)] transition-[transform,opacity] duration-150 ease-out motion-reduce:transition-none data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
              popupClassName
            )}
          >
            <Combobox.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
              {loading ? t("loading") : emptyMessage ?? t("empty")}
            </Combobox.Empty>
            <Combobox.List>
              {(item: ComboboxItem) => (
                <Combobox.Item
                  key={item.value}
                  value={item}
                  disabled={item.disabled}
                  className={cn(
                    "flex cursor-default select-none items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none",
                    "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
                    "data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                  )}
                >
                  <span className="flex size-4 shrink-0 items-center justify-center text-gold">
                    <Combobox.ItemIndicator>
                      <Check className="size-4" strokeWidth={2} aria-hidden />
                    </Combobox.ItemIndicator>
                  </span>
                  <span className="truncate">{item.label}</span>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
