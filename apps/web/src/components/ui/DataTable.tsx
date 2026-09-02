"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Search, X } from "lucide-react";
import { Input } from "./FormControls";
import { Button } from "./Button";
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

// Opt-in — omitting this prop keeps every existing DataTable caller
// (Teachers, Parents, Audit log) exactly as it behaved before: every row
// from `data` rendered at once, no page controls. Only a caller that passes
// this gets pagination, so enabling it for Students can't affect anyone else.
export interface PaginationConfig {
  pageSizeOptions: number[];
  defaultPageSize: number;
  // What a row is called in "Showing 1 to 10 of 50 {itemLabel}" — defaults
  // to something generic since DataTable itself doesn't know the type.
  itemLabel?: string;
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
  searchEmptyTitle = "No matches",
  onRowClick,
  toolbar,
  selection,
  pagination,
}: {
  data: T[] | null;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  searchPlaceholder?: string;
  searchFilter?: (row: T, query: string) => boolean;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  searchEmptyTitle?: string;
  onRowClick?: (row: T) => void;
  toolbar?: React.ReactNode;
  selection?: TableSelection;
  pagination?: PaginationConfig;
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(pagination?.defaultPageSize ?? 10);

  const isSearching = searchFilter !== undefined && query.trim().length > 0;

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

  // A new search query or a changed page size both invalidate whatever page
  // the admin was on — e.g. page 4 of an unfiltered list may not exist at
  // all once a search narrows the result set. Reset during render (React's
  // own recommended pattern for "adjust state when a value changes")
  // instead of an effect, to avoid an extra render pass.
  const [prevQuery, setPrevQuery] = useState(query);
  const [prevPageSize, setPrevPageSize] = useState(pageSize);
  if (query !== prevQuery || pageSize !== prevPageSize) {
    setPrevQuery(query);
    setPrevPageSize(pageSize);
    setPage(1);
  }

  const totalItems = sorted.length;
  const totalPages = pagination ? Math.max(1, Math.ceil(totalItems / pageSize)) : 1;
  const clampedPage = Math.min(page, totalPages);
  const paged = pagination ? sorted.slice((clampedPage - 1) * pageSize, clampedPage * pageSize) : sorted;

  function toggleSort(key: string) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    }
  }

  const itemLabel = pagination?.itemLabel ?? "items";

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
                className="!bg-surface pl-9 pr-9"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-hover hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          )}
          {toolbar}
        </div>
      )}

      {loading ? (
        <SkeletonTable cols={columns.length} />
      ) : sorted.length === 0 ? (
        <EmptyState
          title={query ? searchEmptyTitle : emptyTitle}
          description={query ? "Try a different search term." : emptyDescription}
          action={
            query ? (
              <Button size="sm" variant="outline" onClick={() => setQuery("")}>
                Clear search
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-surface-soft">
                <tr>
                  {selection && (
                    <th className="w-10 px-4 py-2.5">
                      <SelectCheckbox
                        checked={paged.length > 0 && paged.every((row) => selection.selectedKeys.has(rowKey(row)))}
                        indeterminate={
                          paged.some((row) => selection.selectedKeys.has(rowKey(row))) &&
                          !paged.every((row) => selection.selectedKeys.has(rowKey(row)))
                        }
                        onChange={(checked) => selection.onToggleAll(paged.map(rowKey), checked)}
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
                {paged.map((row) => (
                  <tr
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={`${isSearching ? "bg-accent-soft/40" : "bg-background"} ${onRowClick ? "cursor-pointer hover:bg-surface-hover" : ""}`}
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

          {pagination && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-foreground-soft">
                Showing {(clampedPage - 1) * pageSize + 1} to {Math.min(clampedPage * pageSize, totalItems)} of{" "}
                {totalItems} {itemLabel}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={clampedPage === 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  {pageNumbersFor(clampedPage, totalPages).map((n, i) =>
                    n === "…" ? (
                      <span key={`ellipsis-${i}`} className="px-1.5 text-sm text-foreground-muted">
                        …
                      </span>
                    ) : (
                      <button
                        key={n}
                        onClick={() => setPage(n)}
                        aria-current={n === clampedPage ? "page" : undefined}
                        className={`flex size-8 items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                          n === clampedPage
                            ? "bg-accent text-white"
                            : "text-foreground-soft hover:bg-surface-hover hover:text-foreground"
                        }`}
                      >
                        {n}
                      </button>
                    ),
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={clampedPage === totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
                <label className="flex items-center gap-1.5 text-sm text-foreground-soft">
                  Rows per page:
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
                  >
                    {pagination.pageSizeOptions.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Keeps the page-number row from growing unbounded on a large list: always
// shows the first and last page, the current page and its immediate
// neighbors, and collapses the rest behind "…".
function pageNumbersFor(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);

  const result: (number | "…")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push("…");
    result.push(sorted[i]);
  }
  return result;
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
