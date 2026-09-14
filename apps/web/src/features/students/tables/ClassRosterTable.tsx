"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Printer } from "lucide-react";
import { Eye, Pencil } from "lucide-react";
import type { StudentListItem, StudentStatus } from "@/lib/api";
import { DataTable, type Column, type TableSelection } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ActionsMenu } from "@/components/ui/ActionsMenu";
import { StudentAvatar } from "../components/StudentAvatar";

const STATUS_TONE: Record<StudentStatus, "success" | "accent" | "neutral" | "warning"> = {
  ACTIVE: "success",
  COMPLETED: "accent",
  GRADUATED: "accent",
  TRANSFERRED: "warning",
  WITHDRAWN: "neutral",
  ARCHIVED: "neutral",
};

function attendanceTone(rate: number): { tone: "success" | "warning" | "danger"; label: string } {
  if (rate >= 90) return { tone: "success", label: "Excellent" };
  if (rate >= 75) return { tone: "warning", label: "Good" };
  return { tone: "danger", label: "Needs Attention" };
}

const OPTIONAL_COLUMNS = [
  { id: "parent", label: "Parent" },
  { id: "contact", label: "Contact" },
] as const;

// The class-detail page's roster tab: a simpler, client-side-filtered
// listing scoped to one class (unlike the Advanced Student Directory's
// StudentsTable, which is server-paginated across the whole school). Kept
// as its own component rather than folding a second mode into StudentsTable.
export function ClassRosterTable({
  schoolId,
  accessToken,
  students,
  attendanceRates,
  loading,
  canTransfer,
  selection,
}: {
  schoolId: string;
  accessToken: string;
  students: StudentListItem[] | null;
  attendanceRates: Map<string, number | null> | null;
  loading?: boolean;
  canTransfer: boolean;
  selection?: TableSelection;
}) {
  const router = useRouter();
  const [visibleOptional, setVisibleOptional] = useState<Set<string>>(new Set());
  const [showColumnMenu, setShowColumnMenu] = useState(false);

  const columns: Column<StudentListItem>[] = [
    {
      key: "name",
      header: "Student",
      sortValue: (s) => `${s.lastName} ${s.firstName}`,
      render: (s) => (
        <div className="flex items-center gap-2.5">
          <StudentAvatar accessToken={accessToken} studentId={s.studentId} name={`${s.firstName} ${s.lastName}`} />
          <div>
            <p className="font-medium text-foreground">
              {s.firstName} {s.lastName}
            </p>
            <p className="font-mono text-xs text-foreground-muted">{s.studentNumber}</p>
          </div>
        </div>
      ),
    },
    { key: "rollNumber", header: "Roll", sortValue: (s) => s.rollNumber, render: (s) => s.rollNumber },
    { key: "class", header: "Class", sortValue: (s) => s.className, render: (s) => s.className },
    { key: "section", header: "Section", sortValue: (s) => s.sectionName, render: (s) => s.sectionName },
    {
      key: "status",
      header: "Status",
      sortValue: (s) => s.status,
      render: (s) => <Badge tone={STATUS_TONE[s.status]}>{s.status.charAt(0) + s.status.slice(1).toLowerCase()}</Badge>,
    },
  ];

  if (attendanceRates) {
    columns.push({
      key: "attendance",
      header: "Attendance",
      render: (s) => {
        const rate = attendanceRates.get(s.enrollmentId);
        if (rate === undefined || rate === null) return <span className="text-foreground-muted">—</span>;
        const { tone, label } = attendanceTone(rate);
        return (
          <div className="flex items-center gap-1.5">
            <span className="tabular-nums text-foreground">{rate}%</span>
            <Badge tone={tone}>{label}</Badge>
          </div>
        );
      },
    });
  }

  if (visibleOptional.has("parent")) {
    columns.push({ key: "parent", header: "Parent", render: (s) => s.guardianName ?? <span className="text-foreground-muted">—</span> });
  }
  if (visibleOptional.has("contact")) {
    columns.push({ key: "contact", header: "Contact", render: (s) => s.guardianPhone ?? <span className="text-foreground-muted">—</span> });
  }

  columns.push({
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
  });

  return (
    <DataTable
      data={students}
      loading={loading}
      columns={columns}
      rowKey={(s) => s.studentId}
      onRowClick={(s) => router.push(`/schools/${schoolId}/students/${s.studentId}`)}
      searchPlaceholder="Search by name, ID, or parent…"
      searchFilter={(s, q) =>
        `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
        s.studentNumber.toLowerCase().includes(q) ||
        (s.guardianName ?? "").toLowerCase().includes(q)
      }
      emptyTitle="No students enrolled yet"
      emptyDescription="Add your first student to get started."
      selection={selection}
      toolbar={
        <div className="relative ml-auto flex items-center gap-2">
          <span className="text-sm text-foreground-soft">
            {students ? `${students.length} student${students.length === 1 ? "" : "s"}` : ""}
          </span>
          <Button variant="outline" size="sm" onClick={() => setShowColumnMenu((v) => !v)}>
            Manage Columns
          </Button>
          {showColumnMenu && (
            <div className="absolute right-0 top-full z-10 mt-1 min-w-[160px] rounded-lg border border-border bg-background p-2 shadow-lg">
              {OPTIONAL_COLUMNS.map((col) => (
                <label key={col.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-hover">
                  <input
                    type="checkbox"
                    checked={visibleOptional.has(col.id)}
                    onChange={(e) =>
                      setVisibleOptional((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(col.id);
                        else next.delete(col.id);
                        return next;
                      })
                    }
                    className="size-4 rounded border-border text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  />
                  {col.label}
                </label>
              ))}
            </div>
          )}
        </div>
      }
    />
  );
}
