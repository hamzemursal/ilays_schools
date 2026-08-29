"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, CheckCircle2, Loader2, X, XCircle } from "lucide-react";
import { useAuth, ApiError } from "@/lib/auth-context";
import type { ImportBatchDetail, ImportRow } from "@/lib/api";
import { importsApi } from "../api";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { StatCard } from "@/components/ui/StatCard";
import { useToast } from "@/components/ui/Toast";

const STATUS_TONE: Record<ImportRow["status"], "neutral" | "success" | "warning" | "danger"> = {
  PENDING: "neutral",
  CREATED: "success",
  DUPLICATE_PENDING: "warning",
  ERROR: "danger",
  SKIPPED: "neutral",
};

export function ImportBatchReview({
  schoolId,
  batch,
  onUpdated,
}: {
  schoolId: string;
  batch: ImportBatchDetail;
  onUpdated: (batch: ImportBatchDetail) => void;
}) {
  const { accessToken } = useAuth();
  const { show } = useToast();
  const [resolvingRowId, setResolvingRowId] = useState<string | null>(null);

  async function resolve(rowId: string, action: "confirm" | "skip") {
    if (!accessToken) return;
    setResolvingRowId(rowId);
    try {
      const updated = await importsApi.resolveRow(accessToken, schoolId, batch.id, rowId, action);
      onUpdated(updated);
      show(action === "confirm" ? "Student created." : "Row skipped.");
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to resolve row", "danger");
    } finally {
      setResolvingRowId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={CheckCircle2} label="Created" value={batch.createdCount} tone="success" />
        <StatCard icon={AlertTriangle} label="Needs review" value={batch.pendingCount} tone="warning" />
        <StatCard icon={XCircle} label="Errors" value={batch.errorCount} tone="danger" />
        <StatCard icon={X} label="Skipped" value={batch.skippedCount} />
      </div>

      <Card padding="none">
        <CardHeader
          title={batch.fileName}
          description={`${batch.totalRows} row(s) · ${batch.status === "NEEDS_REVIEW" ? "Awaiting your review" : "Completed"}`}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-surface-soft text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              <tr>
                <th className="px-4 py-2.5">Row</th>
                <th className="px-4 py-2.5">Student</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {batch.rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 text-foreground-muted">{row.rowNumber}</td>
                  <td className="px-4 py-3 text-foreground">
                    {row.rawData.firstName} {row.rawData.lastName}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[row.status]}>{row.status.replace("_", " ")}</Badge>
                  </td>
                  <td className="px-4 py-3 text-foreground-soft">
                    {row.status === "CREATED" && row.studentId && (
                      <Link
                        href={`/schools/${schoolId}/students/${row.studentId}`}
                        className="text-accent hover:underline"
                      >
                        View student
                      </Link>
                    )}
                    {row.status === "ERROR" && <span className="text-danger">{row.errorMessage}</span>}
                    {row.status === "DUPLICATE_PENDING" && (
                      <div className="space-y-2">
                        <p>
                          Matches existing record(s):{" "}
                          {row.duplicateCandidates?.map((d) => `${d.firstName} ${d.lastName}`).join(", ")}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            icon={
                              resolvingRowId === row.id ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Check className="size-4" />
                              )
                            }
                            disabled={resolvingRowId === row.id}
                            onClick={() => resolve(row.id, "confirm")}
                          >
                            Different person — create
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={resolvingRowId === row.id}
                            onClick={() => resolve(row.id, "skip")}
                          >
                            Skip
                          </Button>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
