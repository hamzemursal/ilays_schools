"use client";

import { useRouter } from "next/navigation";
import type { Teacher } from "@/lib/api";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";

const STATUS_TONE: Record<Teacher["status"], "success" | "warning" | "neutral"> = {
  ACTIVE: "success",
  ON_LEAVE: "warning",
  INACTIVE: "neutral",
};

export function TeachersTable({
  schoolId,
  teachers,
  loading,
}: {
  schoolId: string;
  teachers: Teacher[] | null;
  loading?: boolean;
}) {
  const router = useRouter();

  const columns: Column<Teacher>[] = [
    {
      key: "name",
      header: "Teacher",
      sortValue: (t) => `${t.lastName} ${t.firstName}`,
      render: (t) => (
        <div className="flex items-center gap-3">
          <Avatar name={`${t.firstName} ${t.lastName}`} size="sm" />
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
      render: (t) => (
        <span className="text-foreground-soft">
          {t.assignments.length === 0 ? "None" : `${t.assignments.length} class-subject`}
        </span>
      ),
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
    />
  );
}
