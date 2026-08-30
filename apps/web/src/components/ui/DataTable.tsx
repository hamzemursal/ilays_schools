"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { Input } from "./FormControls";
import { EmptyState } from "./EmptyState";
import { SkeletonTable } from "./Skeleton";

export interface TableSelection {
  selectedKeys: Set<string>;
  onToggle: (key: string, checked: boolean) => void;
  onToggleAll: (keys: string[], checked: boolean) => void;
}

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
  className?: string;
  headerClassName?: string;
}

export function DataTable<T>({
  data,
  columns,
  rowKey,
  searchPlaceholder = "Search…",
  searchFilter,
  loading,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  onRowClick,
  toolbar,
  selection,
}: {
  data: T[] | null;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  searchPlaceholder?: string;
  searchFilter?: (row: T, query: string) => boolean;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
  toolbar?: React.ReactNode;
  selection?: TableSelection;
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!query.trim() || !searchFilter) return data;
    return data.filter((row) => searchFilter(row, query.trim().toLowerCase()));
  }, [data, query, searchFilter]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortDir, columns]);

  function toggleSort(key: string) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    }
  }

  return (
    <div>
      {(searchFilter || toolbar) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {searchFilter && (
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="pl-9"
              />
            </div>
          )}
          {toolbar}
        </div>
      )}

      {loading ? (
        <SkeletonTable cols={columns.length} />
      ) : sorted.length === 0 ? (
        <EmptyState
          title={query ? "No matches" : emptyTitle}
          description={query ? "Try a different search term." : emptyDescription}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-surface-soft">
              <tr>
                {selection && (
                  <th className="w-10 px-4 py-2.5">
                    <SelectCheckbox
                      checked={sorted.length > 0 && sorted.every((row) => selection.selectedKeys.has(rowKey(row)))}
                      indeterminate={
                        sorted.some((row) => selection.selectedKeys.has(rowKey(row))) &&
                        !sorted.every((row) => selection.selectedKeys.has(rowKey(row)))
                      }
                      onChange={(checked) => selection.onToggleAll(sorted.map(rowKey), checked)}
                      ariaLabel="Select all rows"
                    />
                  </th>
                )}
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-foreground-muted ${col.headerClassName ?? ""}`}
                  >
                    {col.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        {col.header}
                        {sortKey === col.key ? (
                          sortDir === "asc" ? (
                            <ArrowUp className="size-3" />
                          ) : (
                            <ArrowDown className="size-3" />
                          )
                        ) : (
                          <ArrowUpDown className="size-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`bg-background ${onRowClick ? "cursor-pointer hover:bg-surface-hover" : ""}`}
                >
                  {selection && (
                    <td className="px-4 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
                      <SelectCheckbox
                        checked={selection.selectedKeys.has(rowKey(row))}
                        onChange={(checked) => selection.onToggle(rowKey(row), checked)}
                        ariaLabel="Select row"
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className={`px-4 py-3 align-middle text-foreground ${col.className ?? ""}`}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SelectCheckbox({
  checked,
  indeterminate,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={ariaLabel}
      className="size-4 rounded border-border text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    />
  );
}
