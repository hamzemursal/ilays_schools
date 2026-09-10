"use client";

import { useState, type FormEvent } from "react";
import type { CreateLeaveRequestInput, LeaveType } from "@/lib/api";
import { ApiError } from "@/lib/auth-context";
import { leaveRequestsApi } from "../api";
import { EmployeePicker } from "../EmployeePicker";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { FormField, Input, Select, Textarea } from "@/components/ui/FormControls";
import { useToast } from "@/components/ui/Toast";

export function CreateLeaveRequestForm({
  accessToken,
  schoolId,
  onCreated,
  onCancel,
}: {
  accessToken: string;
  schoolId: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const { show } = useToast();
  const [employee, setEmployee] = useState<{ teacherId?: string; staffId?: string }>({});
  const [type, setType] = useState<LeaveType>("ANNUAL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
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
      const body: CreateLeaveRequestInput = { ...employee, type, startDate, endDate, reason: reason || undefined };
      await leaveRequestsApi.create(accessToken, schoolId, body);
      show("Leave request submitted.");
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to submit leave request");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="none">
      <form onSubmit={onSubmit} className="space-y-4 p-5">
        <FormField label="Employee" required>
          <EmployeePicker accessToken={accessToken} schoolId={schoolId} value={employee} onChange={setEmployee} />
        </FormField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField label="Leave type" required>
            <Select value={type} onChange={(e) => setType(e.target.value as LeaveType)}>
              <option value="ANNUAL">Annual</option>
              <option value="SICK">Sick</option>
              <option value="UNPAID">Unpaid</option>
              <option value="OTHER">Other</option>
            </Select>
          </FormField>
          <FormField label="Start date" required>
            <Input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </FormField>
          <FormField label="End date" required>
            <Input type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Reason">
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormField>

        {error && <Alert tone="danger">{error}</Alert>}

        <div className="flex gap-2">
          <Button type="submit" size="sm" loading={saving}>
            Submit request
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
