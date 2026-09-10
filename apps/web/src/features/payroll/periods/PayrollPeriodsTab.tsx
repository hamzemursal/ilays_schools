"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { PayrollPeriod } from "@/lib/api";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/auth-context";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, Input } from "@/components/ui/FormControls";
import { useToast } from "@/components/ui/Toast";
import { Plus } from "lucide-react";

export function PayrollPeriodsTab({
  accessToken,
  schoolId,
  canManage,
  canClose,
  onChanged,
}: {
  accessToken: string;
  schoolId: string;
  canManage: boolean;
  canClose: boolean;
  onChanged?: () => void;
}) {
  const { show } = useToast();
  const [periods, setPeriods] = useState<PayrollPeriod[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    api
      .listPayrollPeriods(accessToken, schoolId)
      .then(setPeriods)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load payroll periods"));
  }

  useEffect(load, [accessToken, schoolId]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      await api.createPayrollPeriod(accessToken, schoolId, { name, startDate, endDate });
      setName("");
      setStartDate("");
      setEndDate("");
      load();
      onChanged?.();
      show("Payroll period created.");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create payroll period");
    } finally {
      setSaving(false);
    }
  }

  async function onClose(id: string) {
    setBusyId(id);
    try {
      await api.closePayrollPeriod(accessToken, schoolId, id);
      show("Payroll period closed.");
      load();
      onChanged?.();
    } catch (err) {
      show(err instanceof ApiError ? err.message : "Failed to close payroll period", "danger");
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <Alert tone="danger">{error}</Alert>;

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-foreground">Payroll periods</h2>

      {!periods ? (
        <p className="text-sm text-foreground-muted">Loading…</p>
      ) : periods.length === 0 ? (
        <EmptyState title="No payroll periods yet" description="Create one below, then prepare payslips within it." />
      ) : (
        <div className="space-y-2">
          {periods.map((p) => (
            <Card key={p.id} padding="sm">
              <div className="flex items-center justify-between p-2">
                <div>
                  <p className="font-medium text-foreground">{p.name}</p>
                  <p className="text-sm text-foreground-soft">
                    {new Date(p.startDate).toLocaleDateString()} – {new Date(p.endDate).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={p.status === "OPEN" ? "success" : "neutral"}>{p.status}</Badge>
                  {canClose && p.status === "OPEN" && (
                    <Button size="sm" variant="outline" loading={busyId === p.id} onClick={() => onClose(p.id)}>
                      Close
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {canManage && (
        <Card className="mt-4">
          <h3 className="text-sm font-semibold text-foreground">Add payroll period</h3>
          <form onSubmit={onCreate} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <FormField label="Name">
              <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="January 2027" />
            </FormField>
            <FormField label="Start date">
              <Input required type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </FormField>
            <FormField label="End date">
              <Input required type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </FormField>
            <div className="flex items-end">
              <Button type="submit" icon={<Plus className="size-4" />} loading={saving} className="w-full">
                Add period
              </Button>
            </div>
            {formError && (
              <Alert tone="danger" className="sm:col-span-4">
                {formError}
              </Alert>
            )}
          </form>
        </Card>
      )}
    </section>
  );
}
