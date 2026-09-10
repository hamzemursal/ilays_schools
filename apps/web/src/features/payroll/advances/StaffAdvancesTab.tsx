"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { StaffAdvance } from "@/lib/api";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/auth-context";
import { EmployeePicker } from "@/features/hr/EmployeePicker";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, Input } from "@/components/ui/FormControls";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { Plus } from "lucide-react";

export function StaffAdvancesTab({ accessToken, schoolId, canManage }: { accessToken: string; schoolId: string; canManage: boolean }) {
  const { show } = useToast();
  const [advances, setAdvances] = useState<StaffAdvance[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [employee, setEmployee] = useState<{ teacherId?: string; staffId?: string }>({});
  const [amount, setAmount] = useState("");
  const [repaymentPerPeriod, setRepaymentPerPeriod] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function load() {
    api
      .listStaffAdvances(accessToken, schoolId)
      .then(setAdvances)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load staff advances"));
  }

  useEffect(load, [accessToken, schoolId]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!employee.teacherId && !employee.staffId) {
      setFormError("Select an employee");
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      await api.createStaffAdvance(accessToken, schoolId, {
        ...employee,
        amount: Number(amount),
        repaymentPerPeriod: Number(repaymentPerPeriod),
        notes: notes || undefined,
      });
      setAmount("");
      setRepaymentPerPeriod("");
      setNotes("");
      load();
      show("Advance issued.");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to issue advance");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <Alert tone="danger">{error}</Alert>;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Staff advances</h2>
        <p className="mb-3 text-sm text-foreground-soft">
          Remaining balance is always derived from repayments, never a stored running total — payroll calculation applies
          the per-period repayment automatically.
        </p>

        {!advances ? (
          <p className="text-sm text-foreground-muted">Loading…</p>
        ) : advances.length === 0 ? (
          <EmptyState title="No advances issued yet" />
        ) : (
          <div className="space-y-2">
            {advances.map((a) => (
              <Card key={a.id} padding="sm">
                <div className="flex items-center justify-between p-2">
                  <div>
                    <p className="font-medium text-foreground">
                      ${a.amount} · repaying ${a.repaymentPerPeriod}/period
                    </p>
                    <p className="text-sm text-foreground-soft">
                      Repaid ${a.totalRepaid.toFixed(2)} · remaining ${a.remainingBalance.toFixed(2)}
                    </p>
                    {a.notes && <p className="text-xs text-foreground-muted">{a.notes}</p>}
                  </div>
                  <Badge tone={a.status === "ACTIVE" ? "warning" : a.status === "COMPLETED" ? "success" : "neutral"}>{a.status}</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {canManage && (
        <Card padding="none">
          <CardHeader title="Issue advance" />
          <form onSubmit={onCreate} className="space-y-3 p-5">
            <FormField label="Employee">
              <EmployeePicker accessToken={accessToken} schoolId={schoolId} value={employee} onChange={setEmployee} />
            </FormField>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormField label="Amount">
                <Input required type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </FormField>
              <FormField label="Repayment per period">
                <Input required type="number" min={0.01} step="0.01" value={repaymentPerPeriod} onChange={(e) => setRepaymentPerPeriod(e.target.value)} />
              </FormField>
              <FormField label="Notes (optional)">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </FormField>
            </div>
            <Button type="submit" icon={<Plus className="size-4" />} loading={saving}>
              Issue advance
            </Button>
            {formError && <Alert tone="danger">{formError}</Alert>}
          </form>
        </Card>
      )}
    </section>
  );
}
