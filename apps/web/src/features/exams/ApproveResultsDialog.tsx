"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function ApproveResultsDialog({
  open,
  examName,
  className,
  sectionName,
  subjectName,
  teacherName,
  studentCount,
  completedCount,
  average,
  highest,
  lowest,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  examName: string;
  className: string;
  sectionName: string;
  subjectName: string;
  teacherName: string | null;
  studentCount: number;
  completedCount: number;
  average: number | null;
  highest: number | null;
  lowest: number | null;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setConfirmed(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-border bg-background p-5 shadow-lg"
      >
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
            <CheckCircle2 className="size-4.5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground">Approve Results?</h2>
            <p className="mt-1 text-sm text-foreground-soft">
              {examName} · {className} · Section {sectionName} · {subjectName}
              {teacherName ? ` · ${teacherName}` : ""}
            </p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg border border-border p-3 text-sm">
          <dt className="text-foreground-muted">Students</dt>
          <dd className="text-right font-medium text-foreground">{studentCount}</dd>
          <dt className="text-foreground-muted">Results completed</dt>
          <dd className="text-right font-medium text-foreground">{completedCount}</dd>
          <dt className="text-foreground-muted">Average</dt>
          <dd className="text-right font-medium text-foreground">{average ?? "—"}</dd>
          <dt className="text-foreground-muted">Highest</dt>
          <dd className="text-right font-medium text-foreground">{highest ?? "—"}</dd>
          <dt className="text-foreground-muted">Lowest</dt>
          <dd className="text-right font-medium text-foreground">{lowest ?? "—"}</dd>
        </dl>

        <label className="mt-4 flex items-start gap-2 text-sm text-foreground-soft">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 size-4 rounded border-border text-accent focus:ring-accent/30"
          />
          I have reviewed these results.
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button size="sm" icon={<CheckCircle2 className="size-4" />} onClick={onConfirm} loading={loading} disabled={!confirmed}>
            Approve Results
          </Button>
        </div>
      </div>
    </div>
  );
}
