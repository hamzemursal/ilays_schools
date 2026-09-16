"use client";

import { useRouter } from "next/navigation";
import type { Staff, StaffAssignmentStatus } from "@/lib/api";
import { DataTable, type Column, type TableSelection } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";

// A staff member has at most one StaffAssignment per school (see the
// [staffId, schoolId] unique constraint) — this finds THIS school's own
// row. Falling back to the person-level fields only applies at their home
// school with no explicit assignment yet (e.g. created before this
// feature existed, or created without ever calling assignToSchool) —
// never at any other school, where there's nothing sensible to fall back to.
function assignmentAt(staff: Staff, schoolId: string) {
  return staff.assignments.find((a) => a.schoolId === schoolId);
}

function departmentNameAt(staff: Staff, schoolId: string): string | null {
  const assignment = assignmentAt(staff, schoolId);
  if (assignment) return assignment.department?.name ?? null;
  return staff.schoolId === schoolId ? (staff.department?.name ?? null) : null;
}

function roleAt(staff: Staff, schoolId: string): string | null {
  const assignment = assignmentAt(staff, schoolId);
  if (assignment) return assignment.role;
  return staff.schoolId === schoolId ? staff.jobTitle : null;
}

function statusAt(staff: Staff, schoolId: string): StaffAssignmentStatus {
  const assignment = assignmentAt(staff, schoolId);
  if (assignment) return assignment.status;
  return staff.schoolId === schoolId && staff.status !== "INACTIVE" ? "ACTIVE" : "INACTIVE";
}

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
      sortValue: (s) => departmentNameAt(s, schoolId) ?? "",
      render: (s) => <span className="text-foreground-soft">{departmentNameAt(s, schoolId) ?? "—"}</span>,
    },
    {
      key: "jobTitle",
      header: "Role",
      // Scoped to THIS school — a staff member assigned here from another
      // school (see AssignExistingStaffForm) may hold a different role at
      // each, so this must never show their home-school title while
      // browsing a different school's list.
      render: (s) => <span className="text-foreground-soft">{roleAt(s, schoolId) ?? "—"}</span>,
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
      header: "Status here",
      // Scoped to THIS school's own assignment status, not the person's
      // home-school HR status — a staff member deactivated at one school
      // must not read as inactive everywhere they work, and vice versa.
      render: (s) => {
        const tone = statusAt(s, schoolId);
        return <Badge tone={tone === "ACTIVE" ? "success" : "neutral"}>{tone === "ACTIVE" ? "Active" : "Inactive"}</Badge>;
      },
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
