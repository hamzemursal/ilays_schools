"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Select, Textarea } from "@/components/ui/FormControls";
import { markError } from "./markValidation";

export interface AdminEditResultTarget {
  enrollmentId: string;
  studentName: string;
  // The exact value ResultRow.marksObtained already carries (a string, or
  // null when nothing is recorded yet) — never re-derived or guessed here.
  currentMark: string | null;
  isAbsent: boolean;
}

// The Admin-only single-result override dialog — the UI for
// ExamsService.adminEditResult (see apps/api/src/exams/exams.service.ts),
// the one path that can correct a mark regardless of the ResultSubmission's
// status, including APPROVED and PUBLISHED, with no unpublish/resubmit/
// republish round trip. Reachable from the results entry/review page's own
// per-row "Edit" action, visible only to results.approve holders.
export function AdminEditResultDialog({
  open,
  target,
  examName,
  termName,
  subjectName,
  maxMarks,
  loading,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  target: AdminEditResultTarget | null;
  examName: string;
  termName?: string | null;
  subjectName: string;
  maxMarks: number;
  loading: boolean;
  error: string | null;
  onConfirm: (input: { marksObtained?: number; isAbsent?: boolean; reason?: string }) => void;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState<"COMPLETED" | "INCOMPLETE">("COMPLETED");
  const [mark, setMark] = useState("");
  const [reason, setReason] = useState("");
  // Re-seed the form from `target` on the open edge and whenever a DIFFERENT
  // row is opened — during render, same pattern ConfirmDialog's own
  // open-edge reset uses, so switching rows never shows a stale value.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const key = open && target ? target.enrollmentId : null;
  if (key !== seededFor) {
    setSeededFor(key);
    if (target) {
      setStatus(target.isAbsent ? "INCOMPLETE" : "COMPLETED");
      setMark(target.isAbsent ? "" : (target.currentMark ?? ""));
      setReason("");
    }
  }

  if (!open || !target) return null;

  // Completed requires a real, in-range mark (0 included); Incomplete never
  // carries one at all — the same one-or-the-other rule
  // ExamsService.adminEditResult enforces server-side, mirrored here so a
  // mistake is visible before it's ever sent.
  const validationError = status === "COMPLETED" ? markError(mark, maxMarks) : null;
  const markMissing = status === "COMPLETED" && mark.trim() === "";
  const canSubmit = status === "INCOMPLETE" || (!markMissing && !validationError);

  function submit() {
    if (!canSubmit) return;
    const trimmedReason = reason.trim() || undefined;
    if (status === "INCOMPLETE") {
      onConfirm({ isAbsent: true, reason: trimmedReason });
    } else {
      onConfirm({ marksObtained: Number(mark), reason: trimmedReason });
    }
  }

  const currentLabel = target.isAbsent ? "Incomplete" : target.currentMark !== null ? `${target.currentMark} / ${maxMarks}` : "Missing";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit Result"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-border bg-background p-5 shadow-lg"
      >
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Pencil className="size-4.5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground">Edit Result</h2>
            <p className="mt-1 text-sm text-foreground-soft">
              {target.studentName} · {subjectName}
            </p>
            <p className="text-xs text-foreground-muted">
              {examName}
              {termName ? ` · ${termName}` : ""}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div className="rounded-lg bg-surface-soft px-3 py-2 text-sm">
            <span className="text-foreground-muted">Current: </span>
            <span className="font-medium text-foreground">{currentLabel}</span>
          </div>

          <FormField label="Status" htmlFor="admin-edit-status">
            <Select id="admin-edit-status" value={status} onChange={(e) => setStatus(e.target.value as "COMPLETED" | "INCOMPLETE")}>
              <option value="COMPLETED">Completed</option>
              <option value="INCOMPLETE">Incomplete</option>
            </Select>
          </FormField>

          {status === "COMPLETED" ? (
            <FormField label="New mark" htmlFor="admin-edit-mark" required error={mark.trim() !== "" ? (validationError ?? undefined) : undefined}>
              <Input
                id="admin-edit-mark"
                type="number"
                min={0}
                max={maxMarks}
                value={mark}
                onChange={(e) => setMark(e.target.value)}
                autoFocus
              />
            </FormField>
          ) : (
            // Incomplete never shows a mark field at all — structurally
            // impossible to combine Incomplete with a mark (0 included).
            <p className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground-muted">
              Incomplete has no mark — {target.studentName} did not complete or attend this assessment.
            </p>
          )}

          <FormField label="Reason for change (optional)" htmlFor="admin-edit-reason">
            <Textarea
              id="admin-edit-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. Re-marked after a student appeal"
            />
          </FormField>

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} loading={loading} disabled={!canSubmit}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
