"use client";

import { useEffect, useRef } from "react";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { pageNumbersFor } from "@/components/ui/DataTable";
import type { LifecycleEnrollmentRow } from "@/lib/api";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export interface LifecycleColumn {
  key: string;
  header: string;
  render: (row: LifecycleEnrollmentRow) => React.ReactNode;
  className?: string;
}

export interface LifecycleTableSelection {
  selectedIds: Set<string>;
  onToggle: (enrollmentId: string, checked: boolean) => void;
  onToggleAll: (enrollmentIds: string[], checked: boolean) => void;
}

// Server-paginated, same convention as AuditTable — these lists (unlike
// most tables in this app) come from a backend that already paginates, so
// page/pageSize are real requests, not a client-side slice.
export function LifecycleTable({
  rows,
  pagination,
  onPageChange,
  onPageSizeChange,
  columns,
  emptyTitle,
  emptyDescription,
  selection,
  itemLabel = "students",
}: {
  rows: LifecycleEnrollmentRow[] | null;
  pagination: { page: number; pageSize: number; total: number; totalPages: number } | null;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  columns: LifecycleColumn[];
  emptyTitle: string;
  emptyDescription?: string;
  selection?: LifecycleTableSelection;
  itemLabel?: string;
}) {
  if (rows === null) {
    return <SkeletonTable rows={8} cols={selection ? columns.length + 1 : columns.length} />;
  }

  if (rows.length === 0) {
    return <EmptyState icon={Users} title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-surface-soft">
            <tr>
              {selection && (
                <th className="w-10 px-4 py-2.5">
                  <SelectCheckbox
                    checked={rows.length > 0 && rows.every((r) => selection.selectedIds.has(r.enrollmentId))}
                    indeterminate={
                      rows.some((r) => selection.selectedIds.has(r.enrollmentId)) &&
                      !rows.every((r) => selection.selectedIds.has(r.enrollmentId))
                    }
                    onChange={(checked) => selection.onToggleAll(rows.map((r) => r.enrollmentId), checked)}
                    ariaLabel="Select all rows on this page"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th key={col.key} className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.enrollmentId} className="bg-background">
                {selection && (
                  <td className="px-4 py-3 align-middle">
                    <SelectCheckbox
                      checked={selection.selectedIds.has(row.enrollmentId)}
                      onChange={(checked) => selection.onToggle(row.enrollmentId, checked)}
                      ariaLabel={`Select ${row.firstName} ${row.lastName}`}
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
            Showing {(pagination.page - 1) * pagination.pageSize + 1} to{" "}
            {Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total.toLocaleString()}{" "}
            {itemLabel}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={pagination.page === 1}
                onClick={() => onPageChange(pagination.page - 1)}
              >
                Previous
              </Button>
              {pageNumbersFor(pagination.page, pagination.totalPages).map((n, i) =>
                n === "…" ? (
                  <span key={`ellipsis-${i}`} className="px-1.5 text-sm text-foreground-muted">
                    …
                  </span>
                ) : (
                  <button
                    key={n}
                    onClick={() => onPageChange(n)}
                    aria-current={n === pagination.page ? "page" : undefined}
                    className={`flex size-8 items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                      n === pagination.page
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
                disabled={pagination.page === pagination.totalPages}
                onClick={() => onPageChange(pagination.page + 1)}
              >
                Next
              </Button>
            </div>
            <label className="flex items-center gap-1.5 text-sm text-foreground-soft">
              Rows per page:
              <select
                value={pagination.pageSize}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                className="rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
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
