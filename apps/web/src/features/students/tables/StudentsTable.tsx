"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarCheck, ExternalLink, Printer } from "lucide-react";
import { Eye, Pencil } from "lucide-react";
import type { StudentDirectoryItem, StudentStatus } from "@/lib/api";
import { DataTable, type Column, type TableSelection } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { ActionsMenu } from "@/components/ui/ActionsMenu";
import { StudentAvatar } from "../components/StudentAvatar";
import { AttendanceTodayCell } from "../list/AttendanceTodayCell";
import { FeeStatusBadge } from "../list/FeeStatusBadge";

const STATUS_TONE: Record<StudentStatus, "success" | "accent" | "neutral" | "warning"> = {
  ACTIVE: "success",
  COMPLETED: "accent",
  GRADUATED: "accent",
  TRANSFERRED: "warning",
  WITHDRAWN: "neutral",
  ARCHIVED: "neutral",
};
const RELATIONSHIP_LABEL: Record<string, string> = { FATHER: "Father", MOTHER: "Mother", GUARDIAN: "Guardian", OTHER: "Other" };

function money(n: number | undefined): string {
  return n === undefined ? "—" : `$${n.toFixed(2)}`;
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

const DASH = <span className="text-foreground-muted">—</span>;

export function StudentsTable({
  schoolId,
  accessToken,
  students,
  loading,
  selection,
  canTransfer,
  canViewGuardianProfile,
  visibleColumns,
  academicYearName,
}: {
  schoolId: string;
  accessToken: string;
  // One page's worth of rows from the Advanced Student List's directory
  // search — this table itself never paginates or filters; that's all
  // server-side now (see students/page.tsx).
  students: StudentDirectoryItem[] | null;
  loading?: boolean;
  selection?: TableSelection;
  canTransfer: boolean;
  // Gates the Parent Name link / "View Parent" action — mirrors the
  // guardians.view permission the destination profile route itself
  // enforces, so this never offers a link the backend would refuse anyway.
  canViewGuardianProfile: boolean;
  visibleColumns: Set<string>;
  academicYearName: string;
}) {
  const router = useRouter();
  const has = (id: string) => visibleColumns.has(id);

  const columns: Column<StudentDirectoryItem>[] = [];

  if (has("photo")) {
    columns.push({
      key: "photo",
      header: "Photo",
      render: (s) => <StudentAvatar accessToken={accessToken} studentId={s.studentId} name={`${s.firstName} ${s.lastName}`} />,
    });
  }
  if (has("name")) {
    columns.push({
      key: "name",
      header: "Student",
      sortValue: (s) => `${s.lastName} ${s.firstName}`,
      render: (s) => (
        <span className="font-medium text-foreground">
          {s.firstName} {s.lastName}
        </span>
      ),
    });
  }
  if (has("studentId")) {
    columns.push({
      key: "studentId",
      header: "Student ID",
      sortValue: (s) => s.studentNumber,
      render: (s) => <span className="font-mono text-xs text-foreground-soft">{s.studentNumber}</span>,
    });
  }
  if (has("rollNumber")) {
    columns.push({ key: "rollNumber", header: "Roll", sortValue: (s) => s.rollNumber, render: (s) => s.rollNumber });
  }
  if (has("gender")) {
    columns.push({ key: "gender", header: "Gender", render: (s) => (s.sex === "MALE" ? "Male" : "Female") });
  }
  if (has("dateOfBirth")) {
    columns.push({ key: "dateOfBirth", header: "Date of Birth", render: (s) => formatDate(s.dateOfBirth) });
  }
  if (has("admissionDate")) {
    columns.push({ key: "admissionDate", header: "Admission Date", render: (s) => formatDate(s.admissionDate) });
  }
  if (has("status")) {
    columns.push({
      key: "status",
      header: "Status",
      sortValue: (s) => s.status,
      render: (s) => <Badge tone={STATUS_TONE[s.status]}>{s.status.charAt(0) + s.status.slice(1).toLowerCase()}</Badge>,
    });
  }
  if (has("academicYear")) {
    columns.push({ key: "academicYear", header: "Academic Year", render: () => academicYearName });
  }
  if (has("class") || has("section")) {
    columns.push({
      key: "classSection",
      header: has("class") && has("section") ? "Class / Section" : has("class") ? "Class" : "Section",
      sortValue: (s) => `${s.className} ${s.sectionName}`,
      render: (s) => (has("class") && has("section") ? `${s.className} · ${s.sectionName}` : has("class") ? s.className : s.sectionName),
    });
  }
  if (has("attendanceToday")) {
    columns.push({
      key: "attendanceToday",
      header: "Attendance",
      render: (s) => (s.attendanceToday ? <AttendanceTodayCell attendance={s.attendanceToday} /> : DASH),
    });
  }
  if (has("feeStatus")) {
    columns.push({
      key: "feeStatus",
      header: "Fee Status",
      render: (s) => (s.finance ? <FeeStatusBadge status={s.finance.feeStatus} /> : DASH),
    });
  }
  if (has("totalFees")) {
    columns.push({ key: "totalFees", header: "Total Fees", className: "text-right tabular-nums", headerClassName: "text-right", render: (s) => money(s.finance?.totalCharged) });
  }
  if (has("amountPaid")) {
    columns.push({ key: "amountPaid", header: "Amount Paid", className: "text-right tabular-nums", headerClassName: "text-right", render: (s) => money(s.finance?.totalPaid) });
  }
  if (has("amountDue")) {
    columns.push({
      key: "amountDue",
      header: "Amount Due",
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      render: (s) => (s.finance ? <span className={s.finance.balance > 0 ? "text-warning" : ""}>{money(s.finance.balance)}</span> : DASH),
    });
  }
  if (has("lastPayment")) {
    columns.push({ key: "lastPayment", header: "Last Payment", render: (s) => (s.finance?.lastPaymentDate ? formatDate(s.finance.lastPaymentDate) : DASH) });
  }
  if (has("parentName")) {
    columns.push({
      key: "parentName",
      header: "Parent / Guardian",
      render: (s) =>
        !s.guardian ? (
          DASH
        ) : canViewGuardianProfile ? (
          <Link
            href={`/schools/${schoolId}/parents/${s.guardian.id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-accent hover:underline"
          >
            {s.guardian.name}
          </Link>
        ) : (
          <span className="text-foreground">{s.guardian.name}</span>
        ),
    });
  }
  if (has("relationship")) {
    columns.push({ key: "relationship", header: "Relationship", render: (s) => (s.guardian ? RELATIONSHIP_LABEL[s.guardian.relationship] : DASH) });
  }
  if (has("parentContact")) {
    columns.push({ key: "parentContact", header: "Parent Contact", render: (s) => s.guardian?.phone ?? DASH });
  }
  if (has("parentEmail")) {
    columns.push({ key: "parentEmail", header: "Parent Email", render: (s) => s.guardian?.email ?? DASH });
  }
  if (has("parentAddress")) {
    columns.push({ key: "parentAddress", header: "Parent Address", render: (s) => s.guardian?.address ?? DASH });
  }
  if (has("parentProfile")) {
    columns.push({
      key: "parentProfile",
      header: "Parent Profile",
      render: (s) =>
        s.guardian && canViewGuardianProfile ? (
          <Link
            href={`/schools/${schoolId}/parents/${s.guardian.id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
          >
            View <ExternalLink className="size-3" />
          </Link>
        ) : (
          DASH
        ),
    });
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
      emptyTitle="No students match these filters"
      emptyDescription="Try adjusting or clearing some filters."
      selection={selection}
    />
  );
}
