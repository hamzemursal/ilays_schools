"use client";

import { useRouter } from "next/navigation";
import type { Teacher } from "@/lib/api";
import { DataTable, type Column, type TableSelection } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { TeacherAvatar } from "../components/TeacherAvatar";

const STATUS_TONE: Record<Teacher["status"], "success" | "warning" | "neutral"> = {
  ACTIVE: "success",
  ON_LEAVE: "warning",
  INACTIVE: "neutral",
};

export function TeachersTable({
  schoolId,
  accessToken,
  teachers,
  loading,
  selection,
}: {
  schoolId: string;
  accessToken: string;
  teachers: Teacher[] | null;
  loading?: boolean;
  selection?: TableSelection;
}) {
  const router = useRouter();

  const columns: Column<Teacher>[] = [
    {
      key: "name",
      header: "Teacher",
      sortValue: (t) => `${t.lastName} ${t.firstName}`,
      render: (t) => (
        <div className="flex items-center gap-3">
          <TeacherAvatar accessToken={accessToken} schoolId={schoolId} teacherId={t.id} name={`${t.firstName} ${t.lastName}`} />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">
              {t.firstName} {t.lastName}
            </p>
            <p className="truncate font-mono text-xs text-foreground-muted">{t.employeeNumber}</p>
          </div>
        </div>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      render: (t) => (
        <div className="text-foreground-soft">
          {t.email && <p className="truncate">{t.email}</p>}
          {t.phone && <p className="truncate text-xs">{t.phone}</p>}
          {!t.email && !t.phone && <span className="text-foreground-muted">—</span>}
        </div>
      ),
    },
    {
      key: "assignments",
      header: "Assignments",
      // Scoped to THIS school — a teacher assigned here from another school
      // (see AssignExistingTeacherForm) also holds assignments elsewhere in
      // the organization, but this table is this school's own teacher list,
      // so it must only ever count what's actually happening here.
      render: (t) => {
        const here = t.assignments.filter((a) => a.schoolId === schoolId).length;
        return <span className="text-foreground-soft">{here === 0 ? "None" : `${here} class-subject`}</span>;
      },
    },
    {
      key: "status",
      header: "Status",
      sortValue: (t) => t.status,
      render: (t) => <Badge tone={STATUS_TONE[t.status]}>{t.status.replace("_", " ")}</Badge>,
    },
  ];

  return (
    <DataTable
      data={teachers}
      loading={loading}
      columns={columns}
      rowKey={(t) => t.id}
      onRowClick={(t) => router.push(`/schools/${schoolId}/teachers/${t.id}`)}
      searchPlaceholder="Search teachers by name or number…"
      searchFilter={(t, q) => `${t.firstName} ${t.lastName} ${t.employeeNumber}`.toLowerCase().includes(q)}
      emptyTitle="No teachers yet"
      emptyDescription="Add your first teacher to get started."
      selection={selection}
    />
  );
}
