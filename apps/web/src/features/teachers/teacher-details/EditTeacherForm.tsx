"use client";

import { useState, type FormEvent } from "react";
import type { Teacher, UpdateTeacherInput } from "@/lib/api";
import { ApiError } from "@/lib/auth-context";
import { teachersApi } from "../api";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { FormField, Input, Select } from "@/components/ui/FormControls";
import { useToast } from "@/components/ui/Toast";

// Every field here is School Admin controlled — employee code, school, and
// class/subject assignments deliberately have no field in this form; they
// stay governed by their own dedicated flows (creation, addAssignment).
export function EditTeacherForm({
  accessToken,
  schoolId,
  teacher,
  onCancel,
  onSaved,
}: {
  accessToken: string;
  schoolId: string;
  teacher: Teacher;
  onCancel: () => void;
  onSaved: (teacher: Teacher) => void;
}) {
  const { show } = useToast();
  const [form, setForm] = useState<UpdateTeacherInput>({
    firstName: teacher.firstName,
    lastName: teacher.lastName,
    sex: teacher.sex ?? undefined,
    dateOfBirth: teacher.dateOfBirth?.slice(0, 10) ?? "",
    phone: teacher.phone ?? "",
    email: teacher.email ?? "",
    address: teacher.address ?? "",
    qualification: teacher.qualification ?? "",
    specialization: teacher.specialization ?? "",
    employmentDate: teacher.employmentDate?.slice(0, 10) ?? "",
    status: teacher.status,
    emergencyContactName: teacher.emergencyContactName ?? "",
    emergencyContactPhone: teacher.emergencyContactPhone ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(p: Partial<UpdateTeacherInput>) {
    setForm((prev) => ({ ...prev, ...p }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const updated = await teachersApi.update(accessToken, schoolId, teacher.id, {
        ...form,
        dateOfBirth: form.dateOfBirth || undefined,
        employmentDate: form.employmentDate || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
        qualification: form.qualification || undefined,
        specialization: form.specialization || undefined,
        emergencyContactName: form.emergencyContactName || undefined,
        emergencyContactPhone: form.emergencyContactPhone || undefined,
      });
      show("Teacher profile updated.");
      onSaved(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update teacher");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="none">
      <CardHeader title="Edit teacher" description="Administrative details — visible to the whole school." />
      <form onSubmit={onSubmit} className="space-y-4 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="First name" required>
            <Input required value={form.firstName ?? ""} onChange={(e) => patch({ firstName: e.target.value })} />
          </FormField>
          <FormField label="Last name" required>
            <Input required value={form.lastName ?? ""} onChange={(e) => patch({ lastName: e.target.value })} />
          </FormField>
          <FormField label="Gender">
            <Select value={form.sex ?? ""} onChange={(e) => patch({ sex: (e.target.value || undefined) as UpdateTeacherInput["sex"] })}>
              <option value="">Not set</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
            </Select>
          </FormField>
          <FormField label="Date of birth">
            <Input type="date" value={form.dateOfBirth ?? ""} onChange={(e) => patch({ dateOfBirth: e.target.value })} />
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
          <FormField label="Qualification">
            <Input value={form.qualification ?? ""} onChange={(e) => patch({ qualification: e.target.value })} />
          </FormField>
          <FormField label="Specialization">
            <Input value={form.specialization ?? ""} onChange={(e) => patch({ specialization: e.target.value })} />
          </FormField>
          <FormField label="Employment date">
            <Input type="date" value={form.employmentDate ?? ""} onChange={(e) => patch({ employmentDate: e.target.value })} />
          </FormField>
          <FormField label="Status">
            <Select value={form.status} onChange={(e) => patch({ status: e.target.value as UpdateTeacherInput["status"] })}>
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
