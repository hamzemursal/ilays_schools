"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Columns3, Eye, Pencil, Printer } from "lucide-react";
import type { StudentListItem, StudentStatus } from "@/lib/api";
import { DataTable, type Column, type TableSelection } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { ActionsMenu } from "@/components/ui/ActionsMenu";
import { ShareListButton } from "@/components/ui/ShareListButton";
import { formatStudentListForShare } from "@/lib/share";
import { StudentAvatar } from "../components/StudentAvatar";

const STATUS_TONE: Record<StudentStatus, "success" | "accent" | "neutral" | "warning"> = {
  ACTIVE: "success",
  COMPLETED: "accent",
  GRADUATED: "accent",
  TRANSFERRED: "warning",
  WITHDRAWN: "neutral",
  ARCHIVED: "neutral",
};

// Same 90% / 75% thresholds already established and shown to students on
// their own Attendance page (see StatTile.rateLabel) — reused here with the
// wording this list asked for, not a second business rule.
function attendanceTone(rate: number): "success" | "warning" | "danger" {
  if (rate >= 90) return "success";
  if (rate >= 75) return "warning";
  return "danger";
}
function attendanceLabel(rate: number): string {
  if (rate >= 90) return "Excellent";
  if (rate >= 75) return "Good";
  return "Needs Attention";
}

const OPTIONAL_COLUMNS = [
  { key: "guardian", label: "Parent" },
  { key: "guardianPhone", label: "Contact" },
] as const;
type OptionalColumnKey = (typeof OPTIONAL_COLUMNS)[number]["key"];

export function StudentsTable({
  schoolId,
  accessToken,
  students,
  loading,
  selection,
  attendanceRates,
  canTransfer,
}: {
  schoolId: string;
  accessToken: string;
  students: StudentListItem[] | null;
  loading?: boolean;
  selection?: TableSelection;
  attendanceRates: Map<string, number | null> | null;
  canTransfer: boolean;
}) {
  const router = useRouter();
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [visibleOptional, setVisibleOptional] = useState<Set<OptionalColumnKey>>(new Set());

  function toggleColumn(key: OptionalColumnKey) {
    setVisibleOptional((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const columns: Column<StudentListItem>[] = [
    {
      key: "photo",
      header: "Photo",
      render: (s) => <StudentAvatar accessToken={accessToken} studentId={s.studentId} name={`${s.firstName} ${s.lastName}`} />,
    },
    { key: "studentNumber", header: "Student ID", sortValue: (s) => s.studentNumber, render: (s) => <span className="font-mono text-xs">{s.studentNumber}</span> },
    {
      key: "name",
      header: "Full Name",
      sortValue: (s) => `${s.lastName} ${s.firstName}`,
      render: (s) => (
        <span className="font-medium text-foreground">
          {s.firstName} {s.lastName}
        </span>
      ),
    },
    { key: "roll", header: "Roll", sortValue: (s) => s.rollNumber, render: (s) => s.rollNumber },
    { key: "class", header: "Class", sortValue: (s) => s.className, render: (s) => s.className },
    { key: "section", header: "Section", sortValue: (s) => s.sectionName, render: (s) => s.sectionName },
    ...(attendanceRates
      ? [
          {
            key: "attendance",
            header: "Attendance",
            sortValue: (s: StudentListItem) => attendanceRates.get(s.enrollmentId) ?? -1,
            render: (s: StudentListItem) => {
              const rate = attendanceRates.get(s.enrollmentId);
              if (rate === undefined || rate === null) return <span className="text-foreground-muted">—</span>;
              return (
                <div className="flex items-center gap-2">
                  <span className="tabular-nums font-medium text-foreground">{rate}%</span>
                  <Badge tone={attendanceTone(rate)}>{attendanceLabel(rate)}</Badge>
                </div>
              );
            },
          } satisfies Column<StudentListItem>,
        ]
      : []),
    {
      key: "status",
      header: "Status",
      sortValue: (s) => s.status,
      render: (s) => <Badge tone={STATUS_TONE[s.status]}>{s.status.charAt(0) + s.status.slice(1).toLowerCase()}</Badge>,
    },
    ...(visibleOptional.has("guardian")
      ? [{ key: "guardian", header: "Parent", render: (s: StudentListItem) => s.guardianName ?? <span className="text-foreground-muted">—</span> } satisfies Column<StudentListItem>]
      : []),
    ...(visibleOptional.has("guardianPhone")
      ? [{ key: "guardianPhone", header: "Contact", render: (s: StudentListItem) => s.guardianPhone ?? <span className="text-foreground-muted">—</span> } satisfies Column<StudentListItem>]
      : []),
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      headerClassName: "text-right",
      render: (s) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => router.push(`/schools/${schoolId}/students/${s.studentId}`)}
            aria-label="View"
            className="flex size-8 items-center justify-center rounded-lg text-foreground-soft hover:bg-surface-hover hover:text-foreground"
          >
            <Eye className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => router.push(`/schools/${schoolId}/students/${s.studentId}?edit=1`)}
            aria-label="Edit"
            className="flex size-8 items-center justify-center rounded-lg text-foreground-soft hover:bg-surface-hover hover:text-foreground"
          >
            <Pencil className="size-4" />
          </button>
          <ActionsMenu
            items={[
              { label: "Attendance", icon: CalendarCheck, onClick: () => router.push(`/schools/${schoolId}/students/${s.studentId}/attendance`) },
              { label: "Print Profile", icon: Printer, onClick: () => router.push(`/schools/${schoolId}/students/${s.studentId}?print=1`) },
              ...(canTransfer
                ? [{ label: "Transfer", onClick: () => router.push(`/schools/${schoolId}/students/bulk-transfer?studentIds=${s.studentId}`) }]
                : []),
            ]}
          />
        </div>
      ),
    },
  ];

  return (
    <DataTable
      data={students}
      loading={loading}
      columns={columns}
      rowKey={(s) => s.studentId}
      onRowClick={(s) => router.push(`/schools/${schoolId}/students/${s.studentId}`)}
      searchPlaceholder="Search by name, ID, roll no, class, section, or parent…"
      searchFilter={(s, q) =>
        `${s.firstName} ${s.lastName} ${s.studentNumber} ${s.rollNumber} ${s.className} ${s.sectionName} ${s.guardianName ?? ""} ${s.guardianPhone ?? ""}`
          .toLowerCase()
          .includes(q)
      }
      emptyTitle="No students enrolled yet"
      emptyDescription="Add your first student to get started."
      searchEmptyTitle="No students found"
      pagination={{ pageSizeOptions: [10, 25, 50, 100], defaultPageSize: 25, itemLabel: "students" }}
      selection={selection}
      toolbar={
        students && (
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowColumnMenu((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground-soft transition-colors hover:border-accent hover:text-foreground"
              >
                <Columns3 className="size-4" />
                Manage Columns
              </button>
              {showColumnMenu && (
                <div className="absolute right-0 z-10 mt-1 min-w-[180px] rounded-lg border border-border bg-background p-2 shadow-lg">
                  {OPTIONAL_COLUMNS.map((col) => (
                    <label key={col.key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-hover">
                      <input
                        type="checkbox"
                        checked={visibleOptional.has(col.key)}
                        onChange={() => toggleColumn(col.key)}
                        className="size-4 rounded border-border text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                      />
                      {col.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <span className="text-sm text-foreground-muted">
              {students.length} student{students.length === 1 ? "" : "s"}
            </span>
            <ShareListButton title="Student List" text={() => formatStudentListForShare("Student List", students)} />
          </div>
        )
      }
    />
  );
}
