"use client";

import { useState, type FormEvent } from "react";
import type { MarkStaffAttendanceInput, StaffAttendanceStatus } from "@/lib/api";
import { ApiError } from "@/lib/auth-context";
import { staffAttendanceApi } from "../api";
import { EmployeePicker } from "../EmployeePicker";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { FormField, Input, Select } from "@/components/ui/FormControls";
import { useToast } from "@/components/ui/Toast";

export function MarkStaffAttendanceForm({
  accessToken,
  schoolId,
  date,
  onMarked,
}: {
  accessToken: string;
  schoolId: string;
  date: string;
  onMarked: () => void;
}) {
  const { show } = useToast();
  const [employee, setEmployee] = useState<{ teacherId?: string; staffId?: string }>({});
  const [status, setStatus] = useState<StaffAttendanceStatus>("PRESENT");
  const [note, setNote] = useState("");
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
      const body: MarkStaffAttendanceInput = { ...employee, date, status, note: note || undefined };
      await staffAttendanceApi.mark(accessToken, schoolId, body);
      show("Attendance marked.");
      setEmployee({});
      setNote("");
      onMarked();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to mark attendance");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="none">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3 p-5">
        <FormField label="Employee" required className="min-w-56 flex-1">
          <EmployeePicker accessToken={accessToken} schoolId={schoolId} value={employee} onChange={setEmployee} />
        </FormField>
        <FormField label="Status" required>
          <Select value={status} onChange={(e) => setStatus(e.target.value as StaffAttendanceStatus)}>
            <option value="PRESENT">Present</option>
            <option value="ABSENT">Absent</option>
            <option value="LATE">Late</option>
            <option value="EXCUSED">Excused</option>
            <option value="LEAVE">Leave</option>
          </Select>
        </FormField>
        <FormField label="Note" className="min-w-40 flex-1">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
        <Button type="submit" loading={saving}>
          Mark
        </Button>
        {error && (
          <Alert tone="danger" className="w-full">
            {error}
          </Alert>
        )}
      </form>
    </Card>
  );
}
