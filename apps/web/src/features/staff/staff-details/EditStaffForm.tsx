"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Department, Staff, UpdateStaffInput } from "@/lib/api";
import { ApiError } from "@/lib/auth-context";
import { staffApi, departmentsApi } from "../api";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { FormField, Input, Select } from "@/components/ui/FormControls";
import { useToast } from "@/components/ui/Toast";

export function EditStaffForm({
  accessToken,
  schoolId,
  staff,
  onCancel,
  onSaved,
}: {
  accessToken: string;
  schoolId: string;
  staff: Staff;
  onCancel: () => void;
  onSaved: (staff: Staff) => void;
}) {
  const { show } = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [form, setForm] = useState<UpdateStaffInput>({
    firstName: staff.firstName,
    lastName: staff.lastName,
    sex: staff.sex ?? undefined,
    dateOfBirth: staff.dateOfBirth?.slice(0, 10) ?? "",
    departmentId: staff.departmentId ?? undefined,
    jobTitle: staff.jobTitle ?? "",
    phone: staff.phone ?? "",
    email: staff.email ?? "",
    address: staff.address ?? "",
    employmentDate: staff.employmentDate?.slice(0, 10) ?? "",
    status: staff.status,
    emergencyContactName: staff.emergencyContactName ?? "",
    emergencyContactPhone: staff.emergencyContactPhone ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    departmentsApi.list(accessToken, schoolId).then(setDepartments).catch(() => setDepartments([]));
  }, [accessToken, schoolId]);

  function patch(p: Partial<UpdateStaffInput>) {
    setForm((prev) => ({ ...prev, ...p }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const updated = await staffApi.update(accessToken, schoolId, staff.id, {
        ...form,
        dateOfBirth: form.dateOfBirth || undefined,
        employmentDate: form.employmentDate || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
        jobTitle: form.jobTitle || undefined,
        emergencyContactName: form.emergencyContactName || undefined,
        emergencyContactPhone: form.emergencyContactPhone || undefined,
      });
      show("Staff profile updated.");
      onSaved(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update staff member");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="none">
      <CardHeader title="Edit staff member" description="Administrative details — visible to the whole school." />
      <form onSubmit={onSubmit} className="space-y-4 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="First name" required>
            <Input required value={form.firstName ?? ""} onChange={(e) => patch({ firstName: e.target.value })} />
          </FormField>
          <FormField label="Last name" required>
            <Input required value={form.lastName ?? ""} onChange={(e) => patch({ lastName: e.target.value })} />
          </FormField>
          <FormField label="Gender">
            <Select value={form.sex ?? ""} onChange={(e) => patch({ sex: (e.target.value || undefined) as UpdateStaffInput["sex"] })}>
              <option value="">Not set</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
            </Select>
          </FormField>
          <FormField label="Date of birth">
            <Input type="date" value={form.dateOfBirth ?? ""} onChange={(e) => patch({ dateOfBirth: e.target.value })} />
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
          <FormField label="Status">
            <Select value={form.status} onChange={(e) => patch({ status: e.target.value as UpdateStaffInput["status"] })}>
              <option value="ACTIVE">Active</option>
              <option value="ON_LEAVE">On leave</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
          </FormField>
          <FormField label="Emergency contact name">
            <Input value={form.emergencyContactName ?? ""} onChange={(e) => patch({ emergencyContactName: e.target.value })} />
          </FormField>
          <FormField label="Emergency contact phone">
            <Input value={form.emergencyContactPhone ?? ""} onChange={(e) => patch({ emergencyContactPhone: e.target.value })} />
          </FormField>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}

        <div className="flex gap-2">
          <Button type="submit" size="sm" loading={saving}>
            Save changes
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
