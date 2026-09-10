"use client";

import { useRouter } from "next/navigation";
import type { Staff } from "@/lib/api";
import { DataTable, type Column, type TableSelection } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";

const STATUS_TONE: Record<Staff["status"], "success" | "warning" | "neutral"> = {
  ACTIVE: "success",
  ON_LEAVE: "warning",
  INACTIVE: "neutral",
};

export function StaffTable({
  schoolId,
  staff,
  loading,
  selection,
}: {
  schoolId: string;
  staff: Staff[] | null;
  loading?: boolean;
  selection?: TableSelection;
}) {
  const router = useRouter();

  const columns: Column<Staff>[] = [
    {
      key: "name",
      header: "Staff member",
      sortValue: (s) => `${s.lastName} ${s.firstName}`,
      render: (s) => (
        <div className="flex items-center gap-3">
          <Avatar name={`${s.firstName} ${s.lastName}`} />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">
              {s.firstName} {s.lastName}
            </p>
            <p className="truncate font-mono text-xs text-foreground-muted">{s.staffNumber}</p>
          </div>
        </div>
      ),
    },
    {
      key: "department",
      header: "Department",
      sortValue: (s) => s.department?.name ?? "",
      render: (s) => <span className="text-foreground-soft">{s.department?.name ?? "—"}</span>,
    },
    {
      key: "jobTitle",
      header: "Job title",
      render: (s) => <span className="text-foreground-soft">{s.jobTitle ?? "—"}</span>,
    },
    {
      key: "contact",
      header: "Contact",
      render: (s) => (
        <div className="text-foreground-soft">
          {s.email && <p className="truncate">{s.email}</p>}
          {s.phone && <p className="truncate text-xs">{s.phone}</p>}
          {!s.email && !s.phone && <span className="text-foreground-muted">—</span>}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (s) => s.status,
      render: (s) => <Badge tone={STATUS_TONE[s.status]}>{s.status.replace("_", " ")}</Badge>,
    },
  ];

  return (
    <DataTable
      data={staff}
      loading={loading}
      columns={columns}
      rowKey={(s) => s.id}
      onRowClick={(s) => router.push(`/schools/${schoolId}/staff/${s.id}`)}
      searchPlaceholder="Search staff by name or number…"
      searchFilter={(s, q) => `${s.firstName} ${s.lastName} ${s.staffNumber}`.toLowerCase().includes(q)}
      emptyTitle="No staff yet"
      emptyDescription="Add your first non-teaching staff member to get started."
      selection={selection}
    />
  );
}
