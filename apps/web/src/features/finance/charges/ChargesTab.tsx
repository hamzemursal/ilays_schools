"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { BillingPeriod, ChargeStatus, FeeStructure, PaymentMethod, SchoolCharge } from "@/lib/api";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/auth-context";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, Input, Select } from "@/components/ui/FormControls";
import { useToast } from "@/components/ui/Toast";
import { Zap } from "lucide-react";

const STATUS_TONE: Record<ChargeStatus, "danger" | "warning" | "success" | "neutral"> = {
  OUTSTANDING: "danger",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  CANCELLED: "neutral",
};

export function ChargesTab({
  accessToken,
  schoolId,
  feeStructures,
  billingPeriods,
  canManage,
  canRecordPayments,
}: {
  accessToken: string;
  schoolId: string;
  feeStructures: FeeStructure[];
  billingPeriods: BillingPeriod[];
  canManage: boolean;
  canRecordPayments: boolean;
}) {
  const { show } = useToast();
  const [charges, setCharges] = useState<SchoolCharge[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feeStructureId, setFeeStructureId] = useState(feeStructures[0]?.id ?? "");
  const [billingPeriodId, setBillingPeriodId] = useState(billingPeriods[0]?.id ?? "");
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<string | null>(null);
  const [openChargeId, setOpenChargeId] = useState<string | null>(null);

  function load() {
    api
      .listCharges(accessToken, schoolId)
      .then(setCharges)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load charges"));
  }

  useEffect(load, [accessToken, schoolId]);

  async function onGenerate(e: FormEvent) {
    e.preventDefault();
    setGenerating(true);
    setGenerateResult(null);
    try {
      const result = await api.generateCharges(accessToken, schoolId, feeStructureId, billingPeriodId);
      setGenerateResult(`${result.createdCount} charge(s) created (${result.eligibleEnrollments} eligible)`);
      load();
    } catch (err) {
      setGenerateResult(err instanceof ApiError ? err.message : "Failed to generate charges");
    } finally {
      setGenerating(false);
    }
  }

  if (error) return <Alert tone="danger">{error}</Alert>;

  return (
    <section>
      {canManage && feeStructures.length > 0 && billingPeriods.length > 0 && (
        <Card className="mb-4">
          <h3 className="text-sm font-semibold text-foreground">Generate charges</h3>
          <p className="mt-1 text-sm text-foreground-soft">
            Creates a charge for every eligible enrollment, for one fee structure in one billing period. Re-running is safe
            — an enrollment already charged for that combination is left untouched.
          </p>
          <form onSubmit={onGenerate} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="Fee structure">
              <Select value={feeStructureId} onChange={(e) => setFeeStructureId(e.target.value)}>
                {feeStructures.map((fs) => (
                  <option key={fs.id} value={fs.id}>
                    {fs.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Billing period">
              <Select value={billingPeriodId} onChange={(e) => setBillingPeriodId(e.target.value)}>
                {billingPeriods.map((bp) => (
                  <option key={bp.id} value={bp.id}>
                    {bp.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <div className="flex items-end">
              <Button type="submit" icon={<Zap className="size-4" />} loading={generating} className="w-full">
                Generate charges
              </Button>
            </div>
          </form>
          {generateResult && <p className="mt-2 text-sm text-foreground-soft">{generateResult}</p>}
        </Card>
      )}

      <h2 className="mb-3 text-sm font-semibold text-foreground">Charges</h2>
      {!charges ? (
        <p className="text-sm text-foreground-muted">Loading…</p>
      ) : charges.length === 0 ? (
        <EmptyState title="No charges yet" description="Generate charges from a fee structure and billing period above." />
      ) : (
        <div className="space-y-2">
          {charges.map((c) => (
            <Card key={c.id} padding="sm">
              <div className="flex flex-col gap-2 p-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-foreground">
                    {c.firstName} {c.lastName}
                  </p>
                  <p className="text-sm text-foreground-soft">
                    {c.feeStructure.name}
                    {c.billingPeriod ? ` · ${c.billingPeriod.name}` : ""} · ${c.amount} · balance $
                    {(c.amount - c.paid).toFixed(2)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={STATUS_TONE[c.status]}>{c.status.replace("_", " ")}</Badge>
                  {canRecordPayments && c.status !== "PAID" && c.status !== "CANCELLED" && (
                    <Button size="sm" variant="outline" onClick={() => setOpenChargeId(openChargeId === c.id ? null : c.id)}>
                      {openChargeId === c.id ? "Cancel" : "Record payment"}
                    </Button>
                  )}
                </div>
              </div>

              {openChargeId === c.id && (
                <div className="px-2 pb-2">
                  <RecordChargePaymentForm
                    accessToken={accessToken}
                    charge={c}
                    onRecorded={(patch) => {
                      setCharges((prev) => prev?.map((x) => (x.id === c.id ? { ...x, ...patch } : x)) ?? prev);
                      setOpenChargeId(null);
                    }}
                  />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function RecordChargePaymentForm({
  accessToken,
  charge,
  onRecorded,
}: {
  accessToken: string;
  charge: SchoolCharge;
  onRecorded: (patch: Partial<SchoolCharge>) => void;
}) {
  const remaining = charge.amount - charge.paid;
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
      await api.recordChargePayment(accessToken, charge.id, { amount: Number(amount), method, reference: reference || undefined });
      const paid = charge.paid + Number(amount);
      onRecorded({ paid, status: paid >= charge.amount ? "PAID" : "PARTIALLY_PAID" });
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
