"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField, Select, Textarea } from "@/components/ui/FormControls";

const COMMON_REASONS = [
  "Required documents missing",
  "Class capacity unavailable",
  "Admission requirements not met",
  "Documents incomplete",
  "Parent withdrew request",
  "Other",
];

// Rejection always requires a reason — TransfersService.reject() rejects
// the request outright without one — so this dialog can't be dismissed
// with an empty confirm the way a plain ConfirmDialog would allow.
export function RejectTransferDialog({
  open,
  studentName,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  studentName: string;
  loading: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [preset, setPreset] = useState(COMMON_REASONS[0]);
  const [customReason, setCustomReason] = useState("");

  if (!open) return null;

  const reason = preset === "Other" ? customReason.trim() : preset;
  const canSubmit = reason.length > 0;

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
            <h2 className="font-semibold text-foreground">Reject this transfer?</h2>
            <p className="mt-1 text-sm text-foreground-soft">
              {studentName} stays enrolled at their current school. A reason is required.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <FormField label="Reason" required>
            <Select value={preset} onChange={(e) => setPreset(e.target.value)}>
              {COMMON_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </FormField>
          {preset === "Other" && (
            <Textarea
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="Describe the reason…"
              rows={3}
              autoFocus
            />
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={() => onConfirm(reason)} loading={loading} disabled={!canSubmit}>
            Reject Transfer
          </Button>
        </div>
      </div>
    </div>
  );
}
