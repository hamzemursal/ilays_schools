"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { AcademicYear, BillingPeriod } from "@/lib/api";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/auth-context";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, Input, Select } from "@/components/ui/FormControls";
import { useToast } from "@/components/ui/Toast";
import { Plus } from "lucide-react";

export function BillingPeriodsTab({
  accessToken,
  schoolId,
  years,
  canManage,
}: {
  accessToken: string;
  schoolId: string;
  years: AcademicYear[];
  canManage: boolean;
}) {
  const { show } = useToast();
  const [periods, setPeriods] = useState<BillingPeriod[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [academicYearId, setAcademicYearId] = useState(years[0]?.id ?? "");
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    api
      .listBillingPeriods(accessToken, schoolId)
      .then(setPeriods)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load billing periods"));
  }

  useEffect(load, [accessToken, schoolId]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      await api.createBillingPeriod(accessToken, schoolId, { academicYearId, name, startDate, endDate });
      setName("");
      setStartDate("");
      setEndDate("");
      load();
      show("Billing period added.");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create billing period");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <Alert tone="danger">{error}</Alert>;

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-foreground">Billing periods</h2>
      <p className="mb-3 text-sm text-foreground-soft">
        Discrete periods (e.g. months or terms) used to generate recurring charges from a fee structure.
      </p>

      {!periods ? (
        <p className="text-sm text-foreground-muted">Loading…</p>
      ) : periods.length === 0 ? (
        <EmptyState title="No billing periods yet" description="Add one below to start generating monthly charges." />
      ) : (
        <div className="space-y-2">
          {periods.map((p) => (
            <Card key={p.id} padding="sm">
              <div className="flex items-center justify-between p-2">
                <p className="font-medium text-foreground">{p.name}</p>
                <p className="text-sm text-foreground-soft">
                  {new Date(p.startDate).toLocaleDateString()} – {new Date(p.endDate).toLocaleDateString()}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}

      {canManage && years.length > 0 && (
        <Card className="mt-4">
          <h3 className="text-sm font-semibold text-foreground">Add billing period</h3>
          <form onSubmit={onCreate} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <FormField label="Year">
              <Select value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)}>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Name">
              <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="January 2027" />
            </FormField>
            <FormField label="Start date">
              <Input required type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </FormField>
            <FormField label="End date">
              <Input required type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </FormField>
            <div className="sm:col-span-4">
              <Button type="submit" icon={<Plus className="size-4" />} loading={saving}>
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
