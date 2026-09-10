"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { SalaryHistoryRecord } from "@/lib/api";
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

export function SalaryHistoryTab({
  accessToken,
  schoolId,
  canManage,
}: {
  accessToken: string;
  schoolId: string;
  canManage: boolean;
}) {
  const { show } = useToast();
  const [employee, setEmployee] = useState<{ teacherId?: string; staffId?: string }>({});
  const [history, setHistory] = useState<SalaryHistoryRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [basicSalary, setBasicSalary] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function load(emp: { teacherId?: string; staffId?: string }) {
    if (!emp.teacherId && !emp.staffId) {
      setHistory(null);
      return;
    }
    api
      .listSalaryHistory(accessToken, schoolId, emp.teacherId, emp.staffId)
      .then(setHistory)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load salary history"));
  }

  useEffect(() => load(employee), [accessToken, schoolId, employee.teacherId, employee.staffId]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!employee.teacherId && !employee.staffId) {
      setFormError("Select an employee");
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      await api.createSalaryHistory(accessToken, schoolId, { ...employee, basicSalary: Number(basicSalary), effectiveFrom });
      setBasicSalary("");
      load(employee);
      show("Salary recorded — the previous rate stays in history.");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to record salary");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <Alert tone="danger">{error}</Alert>;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Salary history</h2>
        <p className="mb-3 text-sm text-foreground-soft">
          A raise never overwrites the previous rate — it closes it and starts a new one, so both stay on record.
        </p>
        <FormField label="Employee">
          <EmployeePicker accessToken={accessToken} schoolId={schoolId} value={employee} onChange={setEmployee} />
        </FormField>

        <div className="mt-4">
          {!employee.teacherId && !employee.staffId ? (
            <EmptyState title="Select an employee to see their salary history" />
          ) : !history ? (
            <p className="text-sm text-foreground-muted">Loading…</p>
          ) : history.length === 0 ? (
            <EmptyState title="No salary on file for this employee yet" />
          ) : (
            <div className="space-y-2">
              {history.map((h) => (
                <Card key={h.id} padding="sm">
                  <div className="flex items-center justify-between p-2">
                    <div>
                      <p className="font-medium text-foreground">${h.basicSalary} / period</p>
                      <p className="text-sm text-foreground-soft">
                        From {new Date(h.effectiveFrom).toLocaleDateString()}
                        {h.effectiveTo ? ` to ${new Date(h.effectiveTo).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                    {!h.effectiveTo && <Badge tone="success">Current</Badge>}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {canManage && (
        <Card padding="none">
          <CardHeader title="Record salary" />
          <form onSubmit={onAdd} className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-3">
            <FormField label="Basic salary">
              <Input required type="number" min={0.01} step="0.01" value={basicSalary} onChange={(e) => setBasicSalary(e.target.value)} />
            </FormField>
            <FormField label="Effective from">
              <Input required type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            </FormField>
            <div className="flex items-end">
              <Button type="submit" icon={<Plus className="size-4" />} loading={saving} className="w-full">
                Record salary
              </Button>
            </div>
            {formError && (
              <Alert tone="danger" className="sm:col-span-3">
                {formError}
              </Alert>
            )}
          </form>
        </Card>
      )}
    </section>
  );
}
