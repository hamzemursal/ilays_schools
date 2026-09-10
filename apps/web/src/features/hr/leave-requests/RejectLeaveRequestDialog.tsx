"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField, Textarea } from "@/components/ui/FormControls";

// Rejection always requires a reason — same idiom as RejectTransferDialog —
// so this can't be dismissed with an empty confirm the way a plain
// ConfirmDialog would allow.
export function RejectLeaveRequestDialog({
  open,
  employeeName,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  employeeName: string;
  loading: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");

  if (!open) return null;

  const canSubmit = reason.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-border bg-background p-5 shadow-lg"
      >
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
            <AlertTriangle className="size-4.5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground">Reject this leave request?</h2>
            <p className="mt-1 text-sm text-foreground-soft">{employeeName}&apos;s request will be marked rejected. A reason is required.</p>
          </div>
        </div>

        <div className="mt-4">
          <FormField label="Reason" required>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus />
          </FormField>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={() => onConfirm(reason.trim())} loading={loading} disabled={!canSubmit}>
            Reject
          </Button>
        </div>
      </div>
    </div>
  );
}
