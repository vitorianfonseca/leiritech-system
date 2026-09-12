"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Search,
  SlidersHorizontal,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  MoreHorizontal,
  Check,
  ChevronLeft,
  ChevronRight,
  SearchX,
  Filter,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "./empty-state";
import { SkeletonTable } from "./skeletons";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * Public types
 * ------------------------------------------------------------------ */

type Primitive = string | number | boolean | null | undefined;

export interface SmartTableColumn<T> {
  /** Stable column id. */
  id: string;
  /** Localized header label. */
  header: string;
  /** Cell renderer. */
  cell: (row: T) => React.ReactNode;
  /**
   * Value accessor used for search, filtering and sorting. Required for those
   * features on a given column; purely presentational columns can omit it.
   */
  accessor?: (row: T) => Primitive;
  sortable?: boolean;
  /** Provide options to render a per-column multi-select filter. */
  filterOptions?: { label: string; value: string }[];
  align?: "left" | "right" | "center";
  /** Hidden by default (still user-toggleable unless `hideable` is false). */
  defaultHidden?: boolean;
  /** Whether the user may toggle visibility. Default true. */
  hideable?: boolean;
  /**
   * Priority for the mobile compact-card layout. Columns with lower numbers
   * are shown more prominently; omit to hide from cards.
   */
  cardPriority?: number;
  className?: string;
  headerClassName?: string;
}

export interface RowAction<T> {
  label: string;
  icon?: LucideIcon;
  onSelect: (row: T) => void;
  variant?: "default" | "destructive";
  disabled?: (row: T) => boolean;
}

export interface SmartTableProps<T> {
  data: T[];
  columns: SmartTableColumn<T>[];
  getRowId: (row: T) => string;
  loading?: boolean;
  /** Show the search input. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Row-level actions rendered in a per-row menu. */
  rowActions?: (row: T) => RowAction<T>[];
  onRowClick?: (row: T) => void;
  /** Client-side page size. Ignored when `manualPagination` is set. */
  pageSize?: number;
  /** Server pagination: `data` is treated as the current page as-is. */
  manualPagination?: boolean;
  pageIndex?: number;
  pageCount?: number;
  totalCount?: number;
  onPageChange?: (index: number) => void;
  /** Extra toolbar content (rendered on the right of the toolbar). */
  toolbar?: React.ReactNode;
  emptyIcon?: LucideIcon;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

type SortState = { columnId: string; direction: "asc" | "desc" } | null;

/* ------------------------------------------------------------------ *
 * Component
 * ------------------------------------------------------------------ */

export function SmartTable<T>({
  data,
  columns,
  getRowId,
  loading = false,
  searchable = true,
  searchPlaceholder,
  rowActions,
  onRowClick,
  pageSize = 10,
  manualPagination = false,
  pageIndex,
  pageCount,
  totalCount,
  onPageChange,
  toolbar,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  className,
}: SmartTableProps<T>) {
  const t = useTranslations("shared.table");

  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<SortState>(null);
  const [filters, setFilters] = React.useState<Record<string, string[]>>({});
  const [hidden, setHidden] = React.useState<Set<string>>(
    () => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.id))
  );
  const [clientPage, setClientPage] = React.useState(0);

  const visibleColumns = columns.filter((c) => !hidden.has(c.id));
  const hasActions = typeof rowActions === "function";

  // Derived client-side view (search → filter → sort).
  const processed = React.useMemo(() => {
    if (manualPagination) return data;
    let rows = data;

    const q = query.trim().toLowerCase();
    if (q) {
      rows = rows.filter((row) =>
        columns.some((c) => {
          const v = c.accessor?.(row);
          return v != null && String(v).toLowerCase().includes(q);
        })
      );
    }

    for (const [colId, values] of Object.entries(filters)) {
      if (!values.length) continue;
      const col = columns.find((c) => c.id === colId);
      if (!col?.accessor) continue;
      rows = rows.filter((row) => {
        const v = col.accessor!(row);
        return v != null && values.includes(String(v));
      });
    }

    if (sort) {
      const col = columns.find((c) => c.id === sort.columnId);
      if (col?.accessor) {
        const dir = sort.direction === "asc" ? 1 : -1;
        rows = [...rows].sort((a, b) => {
          const av = col.accessor!(a);
          const bv = col.accessor!(b);
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
          return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir;
        });
      }
    }
    return rows;
  }, [data, columns, query, filters, sort, manualPagination]);

  // Pagination. Client page is clamped during render so a shrinking result set
  // (after search/filter) never leaves us on an out-of-range page.
  const totalPages = manualPagination
    ? pageCount ?? 1
    : Math.max(1, Math.ceil(processed.length / pageSize));
  const effectivePage = manualPagination
    ? pageIndex ?? 0
    : Math.min(clientPage, totalPages - 1);
  const pageRows = manualPagination
    ? processed
    : processed.slice(effectivePage * pageSize, effectivePage * pageSize + pageSize);
  const resultCount = manualPagination ? totalCount ?? processed.length : processed.length;

  function goToPage(next: number) {
    const clamped = Math.max(0, Math.min(next, totalPages - 1));
    if (manualPagination) onPageChange?.(clamped);
    else setClientPage(clamped);
  }

  function toggleSort(col: SmartTableColumn<T>) {
    if (!col.sortable) return;
    setSort((prev) => {
      if (prev?.columnId !== col.id) return { columnId: col.id, direction: "asc" };
      if (prev.direction === "asc") return { columnId: col.id, direction: "desc" };
      return null;
    });
  }

  function setColumnFilter(colId: string, value: string) {
    setFilters((prev) => {
      const current = prev[colId] ?? [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      if (!manualPagination) setClientPage(0);
      return { ...prev, [colId]: next };
    });
  }

  function clearFilters() {
    setFilters({});
    setQuery("");
    if (!manualPagination) setClientPage(0);
  }

  const filterableColumns = columns.filter((c) => c.filterOptions?.length);

  // Roving keyboard navigation between rows.
  function onRowKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>, row: T) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const target = e.currentTarget;
      const sibling =
        e.key === "ArrowDown"
          ? (target.nextElementSibling as HTMLElement | null)
          : (target.previousElementSibling as HTMLElement | null);
      sibling?.focus();
    } else if ((e.key === "Enter" || e.key === " ") && onRowClick) {
      e.preventDefault();
      onRowClick(row);
    }
  }

  const colSpan = visibleColumns.length + (hasActions ? 1 : 0);

  /* ---------- toolbar ---------- */
  const toolbarEl = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      {searchable ? (
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!manualPagination) setClientPage(0);
            }}
            placeholder={searchPlaceholder ?? t("search")}
            aria-label={t("search")}
            className="h-9 pl-9"
          />
        </div>
      ) : null}

      <div className="flex items-center gap-2 sm:ml-auto">
        {toolbar}

        {filterableColumns.map((col) => {
          const selected = filters[col.id] ?? [];
          return (
            <Popover key={col.id}>
              <PopoverTrigger
                render={
                  <Button variant="outline" size="sm">
                    <Filter aria-hidden />
                    {col.header}
                    {selected.length ? (
                      <span className="ml-1 rounded-full bg-signal-muted px-1.5 text-[0.6875rem] font-semibold text-signal">
                        {selected.length}
                      </span>
                    ) : null}
                  </Button>
                }
              />
              <PopoverContent align="start" className="w-56 p-1.5">
                <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  {col.header}
                </p>
                <div className="max-h-64 overflow-y-auto">
                  {col.filterOptions!.map((opt) => {
                    const checked = selected.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        onClick={() => setColumnFilter(col.id, opt.value)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
                      >
                        <span
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded border",
                            checked
                              ? "border-signal bg-signal text-signal-foreground"
                              : "border-input"
                          )}
                        >
                          {checked ? <Check className="size-3" strokeWidth={2.5} aria-hidden /> : null}
                        </span>
                        <span className="truncate">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          );
        })}

        {/* Column visibility */}
        <Popover>
          <PopoverTrigger
            render={
              <Button variant="outline" size="sm" aria-label={t("columnsLabel")}>
                <SlidersHorizontal aria-hidden />
                <span className="hidden sm:inline">{t("columns")}</span>
              </Button>
            }
          />
          <PopoverContent align="end" className="w-52 p-1.5">
            <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              {t("columnsLabel")}
            </p>
            {columns
              .filter((c) => c.hideable !== false)
              .map((col) => {
                const visible = !hidden.has(col.id);
                return (
                  <button
                    key={col.id}
                    type="button"
                    role="checkbox"
                    aria-checked={visible}
                    onClick={() =>
                      setHidden((prev) => {
                        const next = new Set(prev);
                        if (next.has(col.id)) next.delete(col.id);
                        else next.add(col.id);
                        return next;
                      })
                    }
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded border",
                        visible ? "border-signal bg-signal text-signal-foreground" : "border-input"
                      )}
                    >
                      {visible ? <Check className="size-3" strokeWidth={2.5} aria-hidden /> : null}
                    </span>
                    <span className="truncate">{col.header}</span>
                  </button>
                );
              })}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );

  /* ---------- body states ---------- */
  let body: React.ReactNode;
  if (loading) {
    body = <SkeletonTable rows={pageSize > 8 ? 8 : pageSize} columns={colSpan || 4} />;
  } else if (data.length === 0) {
    body = (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle ?? t("empty")}
        description={emptyDescription ?? t("emptyDescription")}
      />
    );
  } else if (pageRows.length === 0) {
    body = (
      <EmptyState
        icon={SearchX}
        title={t("noResults")}
        description={t("noResultsDescription")}
        action={
          <Button variant="outline" size="sm" onClick={clearFilters}>
            {t("clearFilters")}
          </Button>
        }
      />
    );
  } else {
    body = (
      <>
        {/* Desktop / tablet table */}
        <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
          <table className="w-full caption-bottom text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {visibleColumns.map((col) => {
                  const active = sort?.columnId === col.id;
                  const SortIcon = !active
                    ? ChevronsUpDown
                    : sort!.direction === "asc"
                      ? ArrowUp
                      : ArrowDown;
                  return (
                    <th
                      key={col.id}
                      scope="col"
                      aria-sort={
                        active ? (sort!.direction === "asc" ? "ascending" : "descending") : undefined
                      }
                      className={cn(
                        "px-4 py-3 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                        col.align === "right" && "text-right",
                        col.align === "center" && "text-center",
                        col.headerClassName
                      )}
                    >
                      {col.sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(col)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                            col.align === "right" && "flex-row-reverse",
                            active && "text-foreground"
                          )}
                          aria-label={
                            active && sort!.direction === "asc"
                              ? t("sortDesc")
                              : active && sort!.direction === "desc"
                                ? t("sortNone")
                                : t("sortAsc")
                          }
                        >
                          {col.header}
                          <SortIcon className="size-3.5" strokeWidth={1.8} aria-hidden />
                        </button>
                      ) : (
                        col.header
                      )}
                    </th>
                  );
                })}
                {hasActions ? (
                  <th scope="col" className="w-12 px-2 py-3">
                    <span className="sr-only">{t("rowActions")}</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr
                  key={getRowId(row)}
                  data-row
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={(e) => onRowKeyDown(e, row)}
                  className={cn(
                    "border-b border-border outline-none transition-colors last:border-0",
                    onRowClick &&
                      "cursor-pointer hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  )}
                >
                  {visibleColumns.map((col) => (
                    <td
                      key={col.id}
                      className={cn(
                        "px-4 py-3 align-middle",
                        col.align === "right" && "text-right",
                        col.align === "center" && "text-center",
                        col.className
                      )}
                    >
                      {col.cell(row)}
                    </td>
                  ))}
                  {hasActions ? (
                    <td className="px-2 py-3 text-right">
                      <RowActionsMenu row={row} actions={rowActions!(row)} label={t("rowActions")} />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile compact cards */}
        <div className="space-y-2 md:hidden">
          {pageRows.map((row) => {
            const cardCols = visibleColumns
              .filter((c) => c.cardPriority != null)
              .sort((a, b) => (a.cardPriority ?? 0) - (b.cardPriority ?? 0));
            const shown = cardCols.length ? cardCols : visibleColumns;
            return (
              <div
                key={getRowId(row)}
                role={onRowClick ? "button" : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={(e) => {
                  if (onRowClick && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onRowClick(row);
                  }
                }}
                className={cn(
                  "rounded-xl border border-border bg-card p-4 outline-none",
                  onRowClick &&
                    "cursor-pointer transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    {shown.map((col, i) => (
                      <div key={col.id} className={cn(i === 0 && "font-medium text-foreground")}>
                        {i > 0 ? (
                          <span className="mr-1 text-xs uppercase tracking-wide text-muted-foreground">
                            {col.header}:
                          </span>
                        ) : null}
                        {col.cell(row)}
                      </div>
                    ))}
                  </div>
                  {hasActions ? (
                    <RowActionsMenu row={row} actions={rowActions!(row)} label={t("rowActions")} />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  /* ---------- footer ---------- */
  const showFooter = !loading && data.length > 0 && pageRows.length > 0;

  return (
    <div className={cn("space-y-4", className)}>
      {toolbarEl}
      {body}
      {showFooter ? (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {t("resultCount", { count: resultCount })}
          </p>
          {totalPages > 1 ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={effectivePage <= 0}
                onClick={() => goToPage(effectivePage - 1)}
              >
                <ChevronLeft aria-hidden />
                <span className="hidden sm:inline">{t("previous")}</span>
              </Button>
              <span className="text-sm tabular-nums text-muted-foreground">
                {t("pageStatus", { page: effectivePage + 1, total: totalPages })}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={effectivePage >= totalPages - 1}
                onClick={() => goToPage(effectivePage + 1)}
              >
                <span className="hidden sm:inline">{t("next")}</span>
                <ChevronRight aria-hidden />
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Row actions menu
 * ------------------------------------------------------------------ */

function RowActionsMenu<T>({
  row,
  actions,
  label,
}: {
  row: T;
  actions: RowAction<T>[];
  label: string;
}) {
  if (!actions.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            onClick={(e) => e.stopPropagation()}
          />
        }
      >
        <MoreHorizontal aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((action, i) => {
          const Icon = action.icon;
          const disabled = action.disabled?.(row) ?? false;
          return (
            <DropdownMenuItem
              key={i}
              variant={action.variant}
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                action.onSelect(row);
              }}
            >
              {Icon ? <Icon aria-hidden /> : null}
              {action.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
