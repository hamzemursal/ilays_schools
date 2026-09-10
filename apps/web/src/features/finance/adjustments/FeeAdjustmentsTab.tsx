"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { FeeAdjustment, FeeAdjustmentType, SchoolCharge, SchoolInvoice } from "@/lib/api";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/auth-context";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, Input, Select } from "@/components/ui/FormControls";
import { useToast } from "@/components/ui/Toast";
import { Plus } from "lucide-react";

const TYPE_LABEL: Record<FeeAdjustmentType, string> = {
  DISCOUNT: "Discount",
  SCHOLARSHIP: "Scholarship",
  CORRECTION: "Correction",
  WAIVER: "Waiver",
};

const STATUS_TONE: Record<FeeAdjustment["status"], "success" | "warning" | "danger"> = {
  APPROVED: "success",
  PENDING: "warning",
  REJECTED: "danger",
};

type Target = { kind: "invoice" | "charge"; id: string; enrollmentId: string; label: string };

export function FeeAdjustmentsTab({
  accessToken,
  schoolId,
  invoices,
  charges,
  canManage,
}: {
  accessToken: string;
  schoolId: string;
  invoices: SchoolInvoice[];
  charges: SchoolCharge[];
  canManage: boolean;
}) {
  const { show } = useToast();
  const [adjustments, setAdjustments] = useState<FeeAdjustment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const targets: Target[] = [
    ...invoices.map((i) => ({
      kind: "invoice" as const,
      id: i.id,
      enrollmentId: i.enrollmentId,
      label: `${i.firstName} ${i.lastName} — ${i.feeStructure.name} (Invoice, $${i.amount})`,
    })),
    ...charges.map((c) => ({
      kind: "charge" as const,
      id: c.id,
      enrollmentId: c.enrollmentId,
      label: `${c.firstName} ${c.lastName} — ${c.feeStructure.name} (Charge, $${c.amount})`,
    })),
  ];

  const [targetKey, setTargetKey] = useState(targets[0] ? `${targets[0].kind}:${targets[0].id}` : "");
  const [type, setType] = useState<FeeAdjustmentType>("DISCOUNT");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function load() {
    api
      .listFeeAdjustments(accessToken, schoolId)
      .then(setAdjustments)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load fee adjustments"));
  }

  useEffect(load, [accessToken, schoolId]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const target = targets.find((t) => `${t.kind}:${t.id}` === targetKey);
    if (!target) {
      setFormError("Select an invoice or charge to apply this to");
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      await api.createFeeAdjustment(accessToken, schoolId, {
        enrollmentId: target.enrollmentId,
        invoiceId: target.kind === "invoice" ? target.id : undefined,
        chargeId: target.kind === "charge" ? target.id : undefined,
        type,
        amount: Number(amount),
        reason,
      });
      setAmount("");
      setReason("");
      load();
      show("Adjustment applied.");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create adjustment");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <Alert tone="danger">{error}</Alert>;

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-foreground">Fee adjustments</h2>
      <p className="mb-3 text-sm text-foreground-soft">
        Discounts, scholarships, waivers, and corrections — never edits a charge or invoice amount directly; every
        adjustment is its own auditable record.
      </p>

      {!adjustments ? (
        <p className="text-sm text-foreground-muted">Loading…</p>
      ) : adjustments.length === 0 ? (
        <EmptyState title="No adjustments yet" />
      ) : (
        <div className="space-y-2">
          {adjustments.map((a) => (
            <Card key={a.id} padding="sm">
              <div className="flex items-center justify-between p-2">
                <div>
                  <p className="font-medium text-foreground">
                    {TYPE_LABEL[a.type]} · ${a.amount}
                  </p>
                  <p className="text-sm text-foreground-soft">{a.reason}</p>
                </div>
                <Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}

      {canManage && targets.length > 0 && (
        <Card className="mt-4">
          <h3 className="text-sm font-semibold text-foreground">Add adjustment</h3>
          <form onSubmit={onCreate} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Apply to" className="sm:col-span-2">
              <Select value={targetKey} onChange={(e) => setTargetKey(e.target.value)}>
                {targets.map((t) => (
                  <option key={`${t.kind}:${t.id}`} value={`${t.kind}:${t.id}`}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Type">
              <Select value={type} onChange={(e) => setType(e.target.value as FeeAdjustmentType)}>
                <option value="DISCOUNT">Discount</option>
                <option value="SCHOLARSHIP">Scholarship</option>
                <option value="WAIVER">Waiver</option>
                <option value="CORRECTION">Correction</option>
              </Select>
            </FormField>
            <FormField label="Amount">
              <Input required type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </FormField>
            <FormField label="Reason" className="sm:col-span-2">
              <Input required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Sibling discount" />
            </FormField>
            <div className="sm:col-span-2">
              <Button type="submit" icon={<Plus className="size-4" />} loading={saving}>
                Apply adjustment
              </Button>
            </div>
            {formError && (
              <Alert tone="danger" className="sm:col-span-2">
                {formError}
              </Alert>
            )}
          </form>
        </Card>
      )}
    </section>
  );
}
