"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, CheckCircle2, Loader2, ShieldCheck, X, XCircle } from "lucide-react";
import { useAuth, ApiError } from "@/lib/auth-context";
import type { ImportBatchDetail, ImportRow } from "@/lib/api";
import { importsApi } from "../api";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { StatCard } from "@/components/ui/StatCard";
import { useToast } from "@/components/ui/Toast";

const STATUS_TONE: Record<ImportRow["status"], "neutral" | "accent" | "success" | "warning" | "danger"> = {
  PENDING: "neutral",
  READY: "accent",
  CREATED: "success",
  DUPLICATE_PENDING: "warning",
  ERROR: "danger",
  SKIPPED: "neutral",
};

const IN_PROGRESS_STATUSES: ImportBatchDetail["status"][] = ["STAGING", "COMMITTING"];
const POLL_INTERVAL_MS = 2000;

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
  const [committing, setCommitting] = useState(false);
  // Always current inside the polling interval's closure without needing
  // onUpdated itself in the effect's dependency array (the caller passes a
  // fresh function identity every render).
  const onUpdatedRef = useRef(onUpdated);
  onUpdatedRef.current = onUpdated;

  const inProgress = IN_PROGRESS_STATUSES.includes(batch.status);

  useEffect(() => {
    if (!accessToken || !inProgress) return;
    const interval = setInterval(() => {
      importsApi
        .getOne(accessToken, schoolId, batch.id)
        .then((updated) => onUpdatedRef.current(updated))
        .catch(() => undefined);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [accessToken, schoolId, batch.id, inProgress]);

  async function resolve(rowId: string, action: "confirm" | "skip") {
    if (!accessToken) return;
    setResolvingRowId(rowId);
    try {
      const updated = await importsApi.resolveRow(accessToken, schoolId, batch.id, rowId, action);
      onUpdated(updated);
      show(action === "confirm" ? "Marked ready to create." : "Row skipped.");
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to resolve row", "danger");
    } finally {
      setResolvingRowId(null);
    }
  }

  async function commit() {
    if (!accessToken) return;
    setCommitting(true);
    try {
      const updated = await importsApi.commit(accessToken, schoolId, batch.id);
      onUpdated(updated);
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to commit import", "danger");
    } finally {
      setCommitting(false);
    }
  }

  const readyCount = batch.rows.filter((r) => r.status === "READY").length;
  const canCommit = batch.status === "READY_FOR_REVIEW" && batch.pendingCount === 0 && readyCount > 0;

  return (
    <div className="space-y-5">
      {batch.status === "STAGING" && (
        <Alert tone="info">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            Checking each row for missing data and possible duplicates — this page updates automatically.
          </span>
        </Alert>
      )}
      {batch.status === "COMMITTING" && (
        <Alert tone="info">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            Creating students — this page updates automatically.
          </span>
        </Alert>
      )}
      {batch.status === "FAILED" && (
        <Alert tone="danger">Something went wrong processing this import. Try uploading the file again.</Alert>
      )}
      {batch.status === "READY_FOR_REVIEW" && batch.pendingCount > 0 && (
        <Alert tone="warning">
          {batch.pendingCount} row(s) need a duplicate decision below before this import can be committed.
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard icon={ShieldCheck} label="Ready" value={readyCount} tone={readyCount > 0 ? "violet" : "neutral"} />
        <StatCard icon={CheckCircle2} label="Created" value={batch.createdCount} tone="success" />
        <StatCard icon={AlertTriangle} label="Needs review" value={batch.pendingCount} tone="warning" />
        <StatCard icon={XCircle} label="Errors" value={batch.errorCount} tone="danger" />
        <StatCard icon={X} label="Skipped" value={batch.skippedCount} />
      </div>

      {batch.status === "READY_FOR_REVIEW" && (
        <div className="flex items-center gap-3">
          <Button loading={committing} disabled={!canCommit} onClick={commit}>
            Commit import — create {readyCount} student{readyCount === 1 ? "" : "s"}
          </Button>
          {readyCount === 0 && batch.pendingCount === 0 && (
            <span className="text-sm text-foreground-muted">Nothing to create — every row was skipped or errored.</span>
          )}
        </div>
      )}

      <Card padding="none">
        <CardHeader title={batch.fileName} description={`${batch.totalRows} row(s) · ${batchStatusLabel(batch)}`} />
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

function batchStatusLabel(batch: ImportBatchDetail): string {
  switch (batch.status) {
    case "STAGING":
    case "PROCESSING":
      return "Validating rows…";
    case "READY_FOR_REVIEW":
    case "NEEDS_REVIEW":
      return batch.pendingCount > 0 ? "Awaiting your review" : "Ready to commit";
    case "COMMITTING":
      return "Creating students…";
    case "COMPLETED":
      return "Completed";
    case "FAILED":
      return "Failed";
    default:
      return batch.status;
  }
}
