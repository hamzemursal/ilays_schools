"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";
import { Input } from "./FormControls";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  tone = "danger",
  loading,
  onConfirm,
  onCancel,
  requireTypedConfirmation,
}: {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  // When set, the exact text the admin must type before Confirm enables —
  // for deletes destructive enough that a single misclick shouldn't be
  // enough (e.g. an Academic Year that's never blocked just for having
  // real history, unlike most other deletes in this app).
  requireTypedConfirmation?: string;
}) {
  const [typedValue, setTypedValue] = useState("");
  // Resetting during render (not in an effect) on the open->true edge is
  // React's own recommended pattern for "adjust state when a prop
  // changes" — avoids an extra render pass and the lint rule against
  // setState-in-effect.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setTypedValue("");
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmDisabled = requireTypedConfirmation !== undefined && typedValue !== requireTypedConfirmation;

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
            {description && <div className="mt-1 text-sm text-foreground-soft">{description}</div>}
          </div>
        </div>

        {requireTypedConfirmation !== undefined && (
          <div className="mt-4">
            <label className="mb-1 block text-xs font-medium text-foreground-soft">
              Type <span className="font-semibold text-foreground">{requireTypedConfirmation}</span> to confirm
            </label>
            <Input value={typedValue} onChange={(e) => setTypedValue(e.target.value)} autoFocus autoComplete="off" />
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            size="sm"
            onClick={onConfirm}
            loading={loading}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
