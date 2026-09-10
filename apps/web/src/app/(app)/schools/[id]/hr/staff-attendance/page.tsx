"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";
import type { StaffAttendanceRecord } from "@/lib/api";
import { staffAttendanceApi } from "@/features/hr/api";
import { StaffAttendanceTable } from "@/features/hr/attendance/StaffAttendanceTable";
import { MarkStaffAttendanceForm } from "@/features/hr/attendance/MarkStaffAttendanceForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Input } from "@/components/ui/FormControls";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function StaffAttendancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: schoolId } = use(params);
  const { user, accessToken } = useAuth();
  const schoolName = user?.schools.find((s) => s.id === schoolId)?.name ?? "School";

  const [date, setDate] = useState(today);
  const [records, setRecords] = useState<StaffAttendanceRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!accessToken) return;
    setRecords(null);
    staffAttendanceApi
      .list(accessToken, schoolId, date)
      .then(setRecords)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load attendance"));
  }, [accessToken, schoolId, date]);

  useEffect(load, [load]);

  const canMark = user?.permissions.includes("hr.attendance.mark") ?? false;

  return (
    <div>
      <PageHeader
        eyebrow="HR"
        title={schoolName}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Staff Attendance" }]}
      />
      <div className="space-y-5 p-4 sm:p-6">
        {error && <Alert tone="danger">{error}</Alert>}

        <div className="flex items-center gap-2">
          <label htmlFor="attendance-date" className="text-sm font-medium text-foreground">
            Date
          </label>
          <Input id="attendance-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </div>

        {canMark && accessToken && (
          <MarkStaffAttendanceForm accessToken={accessToken} schoolId={schoolId} date={date} onMarked={load} />
        )}

        <StaffAttendanceTable records={records} loading={!records} />
      </div>
    </div>
  );
}
