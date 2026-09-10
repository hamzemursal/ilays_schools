"use client";

import { useState, type FormEvent } from "react";
import type { PaymentMethod, StudentLedgerEntry } from "@/lib/api";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/auth-context";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { FormField, Input, Select } from "@/components/ui/FormControls";
import { useToast } from "@/components/ui/Toast";

// Works against either an Invoice or a Charge — the two "billable item"
// shapes in this system (see the schema comment on Charge for why they're
// separate models) — routing to the right endpoint by `entry.kind`.
export function RecordEntryPaymentForm({
  accessToken,
  entry,
  onRecorded,
}: {
  accessToken: string;
  entry: StudentLedgerEntry;
  onRecorded: (patch: Partial<StudentLedgerEntry>) => void;
}) {
  const remaining = entry.amount - entry.paid;
  const [amount, setAmount] = useState(remaining.toString());
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { show } = useToast();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body = { amount: Number(amount), method, reference: reference || undefined };
      if (entry.kind === "INVOICE") {
        await api.recordPayment(accessToken, entry.id, body);
      } else {
        await api.recordChargePayment(accessToken, entry.id, body);
      }
      const paid = entry.paid + Number(amount);
      onRecorded({ paid, status: paid >= entry.amount ? "PAID" : "PARTIALLY_PAID" });
      show("Payment recorded.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record payment");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-4">
      <FormField label="Amount">
        <Input required type="number" min={0.01} step="0.01" max={remaining} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </FormField>
      <FormField label="Method">
        <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          <option value="CASH">Cash</option>
          <option value="BANK_TRANSFER">Bank transfer</option>
          <option value="MOBILE_MONEY">Mobile money</option>
          <option value="CARD">Card</option>
          <option value="OTHER">Other</option>
        </Select>
      </FormField>
      <FormField label="Reference (optional)">
        <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Receipt #" />
      </FormField>
      <div className="flex items-end">
        <Button type="submit" loading={submitting} className="w-full">
          Save payment
        </Button>
      </div>
      {error && (
        <Alert tone="danger" className="sm:col-span-4">
          {error}
        </Alert>
      )}
    </form>
  );
}
