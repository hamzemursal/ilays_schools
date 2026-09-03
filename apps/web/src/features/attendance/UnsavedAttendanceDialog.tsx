"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

// Attendance marking has no autosave — a teacher who taps away mid-session
// (sidebar link, browser back, closing the tab) would otherwise lose every
// mark with no warning. This is the three-way choice that replaces that
// silent loss: keep editing, leave and lose the changes, or save what's
// been marked so far as a draft (see AttendanceService.saveDraft) and come
// back to it later.
export function UnsavedAttendanceDialog({
  open,
  savingDraft,
  onKeepEditing,
  onDiscard,
  onSaveDraftAndLeave,
}: {
  open: boolean;
  savingDraft: boolean;
  onKeepEditing: () => void;
  onDiscard: () => void;
  onSaveDraftAndLeave: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4" onClick={onKeepEditing}>
      <div
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-border bg-background p-5 shadow-lg"
      >
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
            <AlertTriangle className="size-4.5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground">Attendance isn&apos;t saved yet</h2>
            <p className="mt-1 text-sm text-foreground-soft">
              You have marks that haven&apos;t been saved. Save them as a draft to continue later, or discard them.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <Button variant="primary" size="sm" onClick={onSaveDraftAndLeave} loading={savingDraft} className="w-full">
            Save as draft &amp; leave
          </Button>
          <Button variant="outline" size="sm" onClick={onDiscard} disabled={savingDraft} className="w-full">
            Discard changes &amp; leave
          </Button>
          <Button variant="ghost" size="sm" onClick={onKeepEditing} disabled={savingDraft} className="w-full">
            Keep editing
          </Button>
        </div>
      </div>
    </div>
  );
}
