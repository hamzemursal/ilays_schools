"use client";

import { useState } from "react";
import { Send, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { ExamContextGrid, type ExamContext } from "./ExamContextGrid";

// Missing marks hard-block submission — there's no business rule anywhere
// in this codebase that allows submitting a partial set of results, so this
// dialog never offers a way around it (see ExamsService.submitForReview,
// which enforces the same rule server-side regardless of what this shows).
//
// The counts add up: Students = Completed marks + Absent + Missing marks.
// "Completed marks" are students with an actual mark; an absent student is
// counted on their own line (absent is a status, never a mark of 0).
export function SubmitResultsDialog({
  open,
  context,
  studentCount,
  completedCount,
  absentCount,
  missingCount,
  isResubmit,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  context: ExamContext;
  studentCount: number;
  completedCount: number;
  absentCount: number;
  missingCount: number;
  isResubmit: boolean;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);

  // Reset the checkbox each time the dialog opens — during render, React's
  // own recommended pattern, same convention as ConfirmDialog.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setConfirmed(false);
  }

  if (!open) return null;

  const canSubmit = missingCount === 0 && confirmed;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="submit-results-title"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-background p-5 shadow-lg"
      >
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Send className="size-4.5" />
          </div>
          <div className="min-w-0">
            <h2 id="submit-results-title" className="font-semibold text-foreground">
              {isResubmit ? "Resubmit Results for Review?" : "Submit Results for Review?"}
            </h2>
            <p className="mt-1 text-sm text-foreground-soft">Check the exam and the counts below, then confirm.</p>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border p-3">
          <ExamContextGrid context={context} compact />
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg border border-border p-3 text-sm">
          <dt className="text-foreground-muted">Students</dt>
          <dd className="text-right font-medium text-foreground">{studentCount}</dd>
          <dt className="text-foreground-muted">Completed marks</dt>
          <dd className="text-right font-medium text-foreground">{completedCount}</dd>
          <dt className="text-foreground-muted">Absent</dt>
          <dd className="text-right font-medium text-foreground">{absentCount}</dd>
          <dt className="text-foreground-muted">Missing marks</dt>
          <dd className={`text-right font-medium ${missingCount > 0 ? "text-danger" : "text-foreground"}`}>{missingCount}</dd>
        </dl>

        {missingCount > 0 ? (
          <Alert tone="danger" className="mt-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                {missingCount} student{missingCount === 1 ? "" : "s"} still need{missingCount === 1 ? "s" : ""} a mark (or to be
                marked Absent). Enter every student&apos;s mark before submitting.
              </span>
            </div>
          </Alert>
        ) : (
          <label className="mt-4 flex items-start gap-2 text-sm text-foreground-soft">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 size-4 rounded border-border text-accent focus:ring-accent/30"
            />
            I confirm that I have reviewed these marks.
          </label>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button size="sm" icon={<Send className="size-4" />} onClick={onConfirm} loading={loading} disabled={!canSubmit}>
            {isResubmit ? "Resubmit for Review" : "Submit for Review"}
          </Button>
        </div>
      </div>
    </div>
  );
}
