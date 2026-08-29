"use client";

import { useState, type FormEvent } from "react";
import { api, type Teacher, type UpdateMyTeacherProfileInput } from "@/lib/api";
import { ApiError } from "@/lib/auth-context";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { FormField, Input } from "@/components/ui/FormControls";
import { useToast } from "@/components/ui/Toast";

// Deliberately narrow: a teacher may only touch their own contact details
// here. Name, employee code, qualification, employment info, status, and
// assignments have no field in this form — those stay School Admin
// controlled (see UpdateMyTeacherProfileDto on the backend).
export function EditMyProfileForm({
  accessToken,
  teacher,
  onCancel,
  onSaved,
}: {
  accessToken: string;
  teacher: Teacher;
  onCancel: () => void;
  onSaved: (teacher: Teacher) => void;
}) {
  const { show } = useToast();
  const [form, setForm] = useState<UpdateMyTeacherProfileInput>({
    phone: teacher.phone ?? "",
    email: teacher.email ?? "",
    address: teacher.address ?? "",
    emergencyContactName: teacher.emergencyContactName ?? "",
    emergencyContactPhone: teacher.emergencyContactPhone ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(p: Partial<UpdateMyTeacherProfileInput>) {
    setForm((prev) => ({ ...prev, ...p }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const updated = await api.updateMyTeacherProfile(accessToken, {
        phone: form.phone || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
        emergencyContactName: form.emergencyContactName || undefined,
        emergencyContactPhone: form.emergencyContactPhone || undefined,
      });
      show("Profile updated.");
      onSaved(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="none">
      <CardHeader title="Edit my profile" description="You can update your own contact details. Other fields are managed by your School Admin." />
      <form onSubmit={onSubmit} className="space-y-4 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Phone">
            <Input value={form.phone ?? ""} onChange={(e) => patch({ phone: e.target.value })} />
          </FormField>
          <FormField label="Email">
            <Input type="email" value={form.email ?? ""} onChange={(e) => patch({ email: e.target.value })} />
          </FormField>
          <FormField label="Address" className="sm:col-span-2">
            <Input value={form.address ?? ""} onChange={(e) => patch({ address: e.target.value })} />
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
