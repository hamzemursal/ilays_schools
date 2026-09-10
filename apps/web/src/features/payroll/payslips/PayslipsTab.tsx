"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Payslip, PayslipLineType, PayrollPeriod } from "@/lib/api";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/auth-context";
import { EmployeePicker } from "@/features/hr/EmployeePicker";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, Input, Select } from "@/components/ui/FormControls";
import { useToast } from "@/components/ui/Toast";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";

const STATUS_TONE: Record<Payslip["status"], "neutral" | "warning" | "accent" | "success"> = {
  DRAFT: "neutral",
  CALCULATED: "warning",
  REVIEWED: "accent",
  APPROVED: "accent",
  PAID: "success",
};

const LINE_LABEL: Record<PayslipLineType, string> = {
  ALLOWANCE: "Allowance",
  BONUS: "Bonus",
  DEDUCTION: "Deduction",
  ADVANCE_REPAYMENT: "Advance repayment",
  OTHER: "Other",
};

function employeeName(p: Payslip): string {
  const person = p.teacher ?? p.staff;
  return person ? `${person.firstName} ${person.lastName}` : "—";
}

export function PayslipsTab({
  accessToken,
  schoolId,
  payrollPeriods,
  canPrepare,
  canReview,
  canApprove,
  canPay,
}: {
  accessToken: string;
  schoolId: string;
  payrollPeriods: PayrollPeriod[];
  canPrepare: boolean;
  canReview: boolean;
  canApprove: boolean;
  canPay: boolean;
}) {
  const { show } = useToast();
  const [periodFilter, setPeriodFilter] = useState(payrollPeriods[0]?.id ?? "");
  const [payslips, setPayslips] = useState<Payslip[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    if (!periodFilter) return;
    api
      .listPayslips(accessToken, schoolId, periodFilter)
      .then(setPayslips)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load payslips"));
  }

  useEffect(load, [accessToken, schoolId, periodFilter]);

  function replace(updated: Payslip) {
    setPayslips((prev) => prev?.map((p) => (p.id === updated.id ? updated : p)) ?? prev);
  }

  async function onCalculate(id: string) {
    setBusyId(id);
    try {
      replace(await api.calculatePayslip(accessToken, schoolId, id));
      show("Payslip calculated.");
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to calculate payslip", "danger");
    } finally {
      setBusyId(null);
    }
  }
  async function onReview(id: string) {
    setBusyId(id);
    try {
      replace(await api.reviewPayslip(accessToken, schoolId, id));
      show("Payslip reviewed.");
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to review payslip", "danger");
    } finally {
      setBusyId(null);
    }
  }
  async function onApprove(id: string) {
    setBusyId(id);
    try {
      replace(await api.approvePayslip(accessToken, schoolId, id));
      show("Payslip approved.");
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to approve payslip", "danger");
    } finally {
      setBusyId(null);
    }
  }
  async function onPay(id: string) {
    setBusyId(id);
    try {
      replace(await api.payPayslip(accessToken, schoolId, id));
      show("Payslip marked paid.");
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to pay payslip", "danger");
    } finally {
      setBusyId(null);
    }
  }

  if (payrollPeriods.length === 0) {
    return <EmptyState title="Create a payroll period first" description="Payslips are prepared within a payroll period." />;
  }
  if (error) return <Alert tone="danger">{error}</Alert>;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FormField label="Payroll period" className="w-56">
          <Select value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)}>
            {payrollPeriods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </FormField>
        {canPrepare && !showCreate && (
          <Button icon={<Plus className="size-4" />} onClick={() => setShowCreate(true)}>
            New payslip
          </Button>
        )}
      </div>

      {showCreate && (
        <CreatePayslipForm
          accessToken={accessToken}
          schoolId={schoolId}
          payrollPeriodId={periodFilter}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {!payslips ? (
        <p className="text-sm text-foreground-muted">Loading…</p>
      ) : payslips.length === 0 ? (
        <EmptyState title="No payslips in this period yet" />
      ) : (
        <div className="space-y-2">
          {payslips.map((p) => (
            <Card key={p.id} padding="sm">
              <button
                className="flex w-full items-center justify-between p-2 text-left"
                onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
              >
                <div>
                  <p className="font-medium text-foreground">{employeeName(p)}</p>
                  <p className="text-sm text-foreground-soft">
                    Basic ${p.basicSalary} · Gross ${p.grossSalary} · Net ${p.netSalary}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>
                  {expandedId === p.id ? <ChevronUp className="size-4 text-foreground-muted" /> : <ChevronDown className="size-4 text-foreground-muted" />}
                </div>
              </button>

              {expandedId === p.id && (
                <PayslipDetail
                  accessToken={accessToken}
                  schoolId={schoolId}
                  payslip={p}
                  busy={busyId === p.id}
                  canPrepare={canPrepare}
                  canReview={canReview}
                  canApprove={canApprove}
                  canPay={canPay}
                  onLineItemAdded={load}
                  onCalculate={() => onCalculate(p.id)}
                  onReview={() => onReview(p.id)}
                  onApprove={() => onApprove(p.id)}
                  onPay={() => onPay(p.id)}
                />
              )}
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function PayslipDetail({
  accessToken,
  schoolId,
  payslip,
  busy,
  canPrepare,
  canReview,
  canApprove,
  canPay,
  onLineItemAdded,
  onCalculate,
  onReview,
  onApprove,
  onPay,
}: {
  accessToken: string;
  schoolId: string;
  payslip: Payslip;
  busy: boolean;
  canPrepare: boolean;
  canReview: boolean;
  canApprove: boolean;
  canPay: boolean;
  onLineItemAdded: () => void;
  onCalculate: () => void;
  onReview: () => void;
  onApprove: () => void;
  onPay: () => void;
}) {
  const { show } = useToast();
  const [type, setType] = useState<Exclude<PayslipLineType, "ADVANCE_REPAYMENT">>("ALLOWANCE");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onAddLineItem(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.addPayslipLineItem(accessToken, schoolId, payslip.id, { type, label, amount: Number(amount) });
      setLabel("");
      setAmount("");
      onLineItemAdded();
      show("Line item added.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add line item");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 border-t border-border p-2 pt-3">
      {payslip.lineItems.length > 0 && (
        <table className="w-full text-sm">
          <tbody>
            {payslip.lineItems.map((li) => (
              <tr key={li.id} className="border-b border-border last:border-0">
                <td className="py-1.5 text-foreground-soft">{LINE_LABEL[li.type]}</td>
                <td className="py-1.5 text-foreground-soft">{li.label}</td>
                <td className="py-1.5 text-right font-medium text-foreground">${li.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canPrepare && payslip.status === "DRAFT" && (
        <form onSubmit={onAddLineItem} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <Select value={type} onChange={(e) => setType(e.target.value as Exclude<PayslipLineType, "ADVANCE_REPAYMENT">)}>
            <option value="ALLOWANCE">Allowance</option>
            <option value="BONUS">Bonus</option>
            <option value="DEDUCTION">Deduction</option>
            <option value="OTHER">Other</option>
          </Select>
          <Input required value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Housing" />
          <Input required type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" />
          <Button type="submit" size="sm" variant="outline" loading={saving}>
            Add line
          </Button>
          {error && (
            <Alert tone="danger" className="sm:col-span-4">
              {error}
            </Alert>
          )}
        </form>
      )}

      <div className="flex justify-end gap-2">
        {canPrepare && payslip.status === "DRAFT" && (
          <Button size="sm" loading={busy} onClick={onCalculate}>
            Calculate
          </Button>
        )}
        {canReview && payslip.status === "CALCULATED" && (
          <Button size="sm" loading={busy} onClick={onReview}>
            Mark reviewed
          </Button>
        )}
        {canApprove && payslip.status === "REVIEWED" && (
          <Button size="sm" loading={busy} onClick={onApprove}>
            Approve
          </Button>
        )}
        {canPay && payslip.status === "APPROVED" && (
          <Button size="sm" loading={busy} onClick={onPay}>
            Mark paid
          </Button>
        )}
      </div>
    </div>
  );
}

function CreatePayslipForm({
  accessToken,
  schoolId,
  payrollPeriodId,
  onCreated,
  onCancel,
}: {
  accessToken: string;
  schoolId: string;
  payrollPeriodId: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [employee, setEmployee] = useState<{ teacherId?: string; staffId?: string }>({});
  const [basicSalary, setBasicSalary] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!employee.teacherId && !employee.staffId) {
      setError("Select an employee");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await api.createPayslip(accessToken, schoolId, payrollPeriodId, {
        ...employee,
        basicSalary: basicSalary ? Number(basicSalary) : undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create payslip");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="none">
      <CardHeader title="New payslip" description="Omit basic salary to pull the employee's current rate from Salary History." />
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-3">
        <FormField label="Employee" className="sm:col-span-2">
          <EmployeePicker accessToken={accessToken} schoolId={schoolId} value={employee} onChange={setEmployee} />
        </FormField>
        <FormField label="Basic salary (optional override)">
          <Input type="number" min={0.01} step="0.01" value={basicSalary} onChange={(e) => setBasicSalary(e.target.value)} />
        </FormField>
        <div className="flex gap-2 sm:col-span-3">
          <Button type="submit" size="sm" loading={saving}>
            Create draft
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
        {error && (
          <Alert tone="danger" className="sm:col-span-3">
            {error}
          </Alert>
        )}
      </form>
    </Card>
  );
}
