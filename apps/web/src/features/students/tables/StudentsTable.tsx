"use client";

import { useRouter } from "next/navigation";
import type { StudentListItem } from "@/lib/api";
import { DataTable, type Column, type TableSelection } from "@/components/ui/DataTable";
import { ShareListButton } from "@/components/ui/ShareListButton";
import { formatStudentListForShare } from "@/lib/share";
import { StudentAvatar } from "../components/StudentAvatar";

export function StudentsTable({
  schoolId,
  accessToken,
  students,
  loading,
  selection,
}: {
  schoolId: string;
  accessToken: string;
  students: StudentListItem[] | null;
  loading?: boolean;
  selection?: TableSelection;
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
      rowKey={(s) => s.studentId}
      onRowClick={(s) => router.push(`/schools/${schoolId}/students/${s.studentId}`)}
      searchPlaceholder="Search by name, ID, roll no, class, or section…"
      searchFilter={(s, q) =>
        `${s.firstName} ${s.lastName} ${s.studentNumber} ${s.rollNumber} ${s.className} ${s.sectionName}`
          .toLowerCase()
          .includes(q)
      }
      emptyTitle="No students enrolled yet"
      emptyDescription="Add your first student to get started."
      searchEmptyTitle="No students found"
      pagination={{ pageSizeOptions: [10, 25, 50], defaultPageSize: 10, itemLabel: "students" }}
      selection={selection}
      toolbar={
        students && (
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-foreground-muted">
              {students.length} student{students.length === 1 ? "" : "s"} total
            </span>
            <ShareListButton title="Student List" text={() => formatStudentListForShare("Student List", students)} />
          </div>
        )
      }
    />
  );
}
