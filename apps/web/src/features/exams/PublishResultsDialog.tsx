"use client";

import { useState } from "react";
import { Megaphone, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

// Publishing is the one action in this whole workflow that a Student/Parent
// can actually see the effect of (StudentPortalService.myResults and
// GuardianPortalService.myChildResults both gate on this), so the
// confirmation here is deliberately stronger than Approve's.
export function PublishResultsDialog({
  open,
  examName,
  className,
  sectionName,
  subjectName,
  studentCount,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  examName: string;
  className: string;
  sectionName: string;
  subjectName: string;
  studentCount: number;
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
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Megaphone className="size-4.5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground">Publish Results?</h2>
            <p className="mt-1 text-sm text-foreground-soft">
              {examName} · {className} · Section {sectionName} · {subjectName} · {studentCount} student(s)
            </p>
          </div>
        </div>

        <Alert tone="warning" className="mt-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>Once published, these results will become visible to students and parents.</span>
          </div>
        </Alert>

        <label className="mt-4 flex items-start gap-2 text-sm text-foreground-soft">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 size-4 rounded border-border text-accent focus:ring-accent/30"
          />
          I have reviewed these results and authorize publication.
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button size="sm" icon={<Megaphone className="size-4" />} onClick={onConfirm} loading={loading} disabled={!confirmed}>
            Publish Results
          </Button>
        </div>
      </div>
    </div>
  );
}
