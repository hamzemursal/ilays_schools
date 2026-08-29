"use client";

import { useRouter } from "next/navigation";
import type { StudentListItem } from "@/lib/api";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { StudentAvatar } from "../components/StudentAvatar";

export function StudentsTable({
  schoolId,
  accessToken,
  students,
  loading,
}: {
  schoolId: string;
  accessToken: string;
  students: StudentListItem[] | null;
  loading?: boolean;
}) {
  const router = useRouter();

  const columns: Column<StudentListItem>[] = [
    {
      key: "name",
      header: "Student",
      sortValue: (s) => `${s.lastName} ${s.firstName}`,
      render: (s) => (
        <div className="flex items-center gap-3">
          <StudentAvatar accessToken={accessToken} studentId={s.studentId} name={`${s.firstName} ${s.lastName}`} />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">
              {s.firstName} {s.lastName}
            </p>
            <p className="truncate font-mono text-xs text-foreground-muted">{s.studentNumber}</p>
          </div>
        </div>
      ),
    },
    { key: "class", header: "Class", sortValue: (s) => s.className, render: (s) => s.className },
    { key: "section", header: "Section", sortValue: (s) => s.sectionName, render: (s) => s.sectionName },
    { key: "roll", header: "Roll #", sortValue: (s) => s.rollNumber, render: (s) => s.rollNumber },
  ];

  return (
    <DataTable
      data={students}
      loading={loading}
      columns={columns}
      rowKey={(s) => s.enrollmentId}
      onRowClick={(s) => router.push(`/schools/${schoolId}/students/${s.studentId}`)}
      searchPlaceholder="Search students by name or number…"
      searchFilter={(s, q) =>
        `${s.firstName} ${s.lastName} ${s.studentNumber}`.toLowerCase().includes(q)
      }
      emptyTitle="No students enrolled yet"
      emptyDescription="Add your first student to get started."
    />
  );
}
