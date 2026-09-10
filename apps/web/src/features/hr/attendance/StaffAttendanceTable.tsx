"use client";

import type { StaffAttendanceRecord } from "@/lib/api";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";

const STATUS_TONE: Record<StaffAttendanceRecord["status"], "success" | "warning" | "danger" | "neutral"> = {
  PRESENT: "success",
  LATE: "warning",
  ABSENT: "danger",
  EXCUSED: "neutral",
  LEAVE: "neutral",
};

function employeeName(r: StaffAttendanceRecord): string {
  const person = r.teacher ?? r.staff;
  return person ? `${person.firstName} ${person.lastName}` : "—";
}

export function StaffAttendanceTable({ records, loading }: { records: StaffAttendanceRecord[] | null; loading?: boolean }) {
  const columns: Column<StaffAttendanceRecord>[] = [
    {
      key: "employee",
      header: "Employee",
      sortValue: employeeName,
      render: (r) => (
        <div>
          <p className="font-medium text-foreground">{employeeName(r)}</p>
          <p className="text-xs text-foreground-muted">{r.teacher ? "Teacher" : "Staff"}</p>
        </div>
      ),
    },
    {
      key: "date",
      header: "Date",
      render: (r) => <span className="text-foreground-soft">{new Date(r.date).toLocaleDateString()}</span>,
    },
    {
      key: "status",
      header: "Status",
      sortValue: (r) => r.status,
      render: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>,
    },
    {
      key: "note",
      header: "Note",
      render: (r) => <span className="text-foreground-soft">{r.note ?? "—"}</span>,
    },
  ];

  return (
    <DataTable
      data={records}
      loading={loading}
      columns={columns}
      rowKey={(r) => r.id}
      searchPlaceholder="Search by employee name…"
      searchFilter={(r, q) => employeeName(r).toLowerCase().includes(q)}
      emptyTitle="No attendance marked for this date"
    />
  );
}
