"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { CreateStaffInput, Department } from "@/lib/api";
import { ApiError } from "@/lib/auth-context";
import { staffApi, departmentsApi } from "../api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { FormField, Input, Select } from "@/components/ui/FormControls";

export function CreateStaffForm({ accessToken, schoolId }: { accessToken: string; schoolId: string }) {
  const router = useRouter();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [form, setForm] = useState<CreateStaffInput>({ firstName: "", lastName: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    departmentsApi.list(accessToken, schoolId).then(setDepartments).catch(() => setDepartments([]));
  }, [accessToken, schoolId]);

  function patch(p: Partial<CreateStaffInput>) {
    setForm((prev) => ({ ...prev, ...p }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const created = await staffApi.create(accessToken, schoolId, {
        ...form,
        departmentId: form.departmentId || undefined,
        jobTitle: form.jobTitle || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
        employmentDate: form.employmentDate || undefined,
      });
      router.push(`/schools/${schoolId}/staff/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create staff member");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="none">
      <form onSubmit={onSubmit} className="space-y-4 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="First name" required>
            <Input required value={form.firstName} onChange={(e) => patch({ firstName: e.target.value })} />
          </FormField>
          <FormField label="Last name" required>
            <Input required value={form.lastName} onChange={(e) => patch({ lastName: e.target.value })} />
          </FormField>
          <FormField label="Department">
            <Select value={form.departmentId ?? ""} onChange={(e) => patch({ departmentId: e.target.value || undefined })}>
              <option value="">No department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Job title">
            <Input value={form.jobTitle ?? ""} onChange={(e) => patch({ jobTitle: e.target.value })} />
          </FormField>
          <FormField label="Phone">
            <Input value={form.phone ?? ""} onChange={(e) => patch({ phone: e.target.value })} />
          </FormField>
          <FormField label="Email">
            <Input type="email" value={form.email ?? ""} onChange={(e) => patch({ email: e.target.value })} />
          </FormField>
          <FormField label="Address" className="sm:col-span-2">
            <Input value={form.address ?? ""} onChange={(e) => patch({ address: e.target.value })} />
          </FormField>
          <FormField label="Employment date">
            <Input type="date" value={form.employmentDate ?? ""} onChange={(e) => patch({ employmentDate: e.target.value })} />
          </FormField>
          <FormField label="Staff number" hint="Leave blank to auto-generate (e.g. STF-00001).">
            <Input value={form.staffNumber ?? ""} onChange={(e) => patch({ staffNumber: e.target.value || undefined })} />
          </FormField>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}

        <div className="flex gap-2">
          <Button type="submit" loading={saving}>
            Add staff member
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push(`/schools/${schoolId}/staff`)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
