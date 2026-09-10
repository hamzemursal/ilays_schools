"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";
import { FormField, Textarea } from "./FormControls";

// A confirm dialog that requires a typed reason before it can be confirmed —
// same shape as the pre-existing RejectTransferDialog/RejectLeaveRequestDialog,
// generalized here since a third near-identical call site (ZAAD, Expenses)
// is what makes extracting it worthwhile rather than premature.
export function ReasonPromptDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
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
            <h2 className="font-semibold text-foreground">{title}</h2>
            {description && <p className="mt-1 text-sm text-foreground-soft">{description}</p>}
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
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
