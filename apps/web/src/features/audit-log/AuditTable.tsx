"use client";

import { Eye } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { pageNumbersFor } from "@/components/ui/DataTable";
import type { AuditEvent } from "@/lib/api";
import { AuditSeverityBadge, AuditStatusBadge } from "./AuditBadges";
import { formatActionLabel, formatAuditDateTime } from "./format";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function AuditTable({
  rows,
  pagination,
  onPageChange,
  onPageSizeChange,
  onRowClick,
  showSchoolColumn,
  schoolNameById,
}: {
  rows: AuditEvent[] | null;
  pagination: { page: number; pageSize: number; total: number; totalPages: number } | null;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onRowClick: (row: AuditEvent) => void;
  showSchoolColumn?: boolean;
  schoolNameById?: Map<string, string>;
}) {
  if (rows === null) {
    return <SkeletonTable rows={8} cols={showSchoolColumn ? 8 : 7} />;
  }

  if (rows.length === 0) {
    return <EmptyState icon={Eye} title="No audit events found" description="Try widening your filters or date range." />;
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-surface-soft">
            <tr>
              {[
                "Date & Time",
                "Who",
                "Action",
                "Module",
                "Resource",
                ...(showSchoolColumn ? ["School"] : []),
                "Status",
                "Severity",
                "",
              ].map((h) => (
                <th key={h} className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id} onClick={() => onRowClick(row)} className="cursor-pointer bg-background hover:bg-surface-hover">
                <td className="whitespace-nowrap px-4 py-3 align-middle text-foreground-soft">
                  {formatAuditDateTime(row.createdAt)}
                </td>
                <td className="px-4 py-3 align-middle text-foreground">
                  <p className="truncate font-medium">{row.actorNameSnapshot ?? row.actorEmailSnapshot ?? "(system)"}</p>
                  {row.actorNameSnapshot && row.actorEmailSnapshot && (
                    <p className="truncate text-xs text-foreground-muted">{row.actorEmailSnapshot}</p>
                  )}
                </td>
                <td className="px-4 py-3 align-middle text-foreground">{formatActionLabel(row.action)}</td>
                <td className="px-4 py-3 align-middle text-foreground-soft">{row.module ?? "—"}</td>
                <td className="px-4 py-3 align-middle text-foreground-soft">
                  {row.resource}
                  {row.resourceNameSnapshot ? ` · ${row.resourceNameSnapshot}` : row.resourceId ? ` · ${row.resourceId}` : ""}
                </td>
                {showSchoolColumn && (
                  <td className="px-4 py-3 align-middle text-foreground-soft">
                    {row.schoolId ? (schoolNameById?.get(row.schoolId) ?? row.schoolId) : "—"}
                  </td>
                )}
                <td className="px-4 py-3 align-middle">
                  <AuditStatusBadge status={row.status} />
                </td>
                <td className="px-4 py-3 align-middle">
                  <AuditSeverityBadge severity={row.severity} />
                </td>
                <td className="px-4 py-3 align-middle text-right">
                  <Button size="sm" variant="ghost" onClick={() => onRowClick(row)}>
                    View Details
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-foreground-soft">
            Showing {(pagination.page - 1) * pagination.pageSize + 1} to{" "}
            {Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total.toLocaleString()} events
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
