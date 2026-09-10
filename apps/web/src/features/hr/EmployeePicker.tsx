"use client";

import { useEffect, useState } from "react";
import type { Staff, Teacher } from "@/lib/api";
import { teachersApi } from "@/features/teachers/api";
import { staffApi } from "@/features/staff/api";
import { Select } from "@/components/ui/FormControls";

// A single dropdown across both workforce domains — Leave Requests and
// Staff Attendance both target "exactly one of teacherId/staffId," so this
// mirrors that at the UI level rather than making the caller build two
// separate pickers.
export function EmployeePicker({
  accessToken,
  schoolId,
  value,
  onChange,
}: {
  accessToken: string;
  schoolId: string;
  value: { teacherId?: string; staffId?: string };
  onChange: (next: { teacherId?: string; staffId?: string }) => void;
}) {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);

  useEffect(() => {
    teachersApi.list(accessToken, schoolId).then(setTeachers).catch(() => setTeachers([]));
    staffApi.list(accessToken, schoolId).then(setStaff).catch(() => setStaff([]));
  }, [accessToken, schoolId]);

  const currentValue = value.teacherId ? `teacher:${value.teacherId}` : value.staffId ? `staff:${value.staffId}` : "";

  return (
    <Select
      required
      value={currentValue}
      onChange={(e) => {
        const [kind, id] = e.target.value.split(":");
        if (!id) return onChange({});
        onChange(kind === "teacher" ? { teacherId: id } : { staffId: id });
      }}
    >
      <option value="">Select an employee…</option>
      {teachers.length > 0 && (
        <optgroup label="Teachers">
          {teachers.map((t) => (
            <option key={t.id} value={`teacher:${t.id}`}>
              {t.firstName} {t.lastName} ({t.employeeNumber})
            </option>
          ))}
        </optgroup>
      )}
      {staff.length > 0 && (
        <optgroup label="Staff">
          {staff.map((s) => (
            <option key={s.id} value={`staff:${s.id}`}>
              {s.firstName} {s.lastName} ({s.staffNumber})
            </option>
          ))}
        </optgroup>
      )}
    </Select>
  );
}
