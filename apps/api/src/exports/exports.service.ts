import { Injectable } from "@nestjs/common";
import { StudentsService } from "../students/students.service";
import { StudentDirectoryService, type StudentDirectoryFilters } from "../students/student-directory.service";
import { TeachersService } from "../teachers/teachers.service";
import { InvoicesService } from "../finance/invoices.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { toCsv, type CsvColumn } from "./csv.util";

type DirectoryRow = Awaited<ReturnType<StudentDirectoryService["searchAll"]>>[number];

function money(n: number | undefined): string {
  return n === undefined ? "" : n.toFixed(2);
}

// One column definition per id the frontend's Choose Columns panel can
// offer — kept as its own registry (rather than reusing exportStudents'
// fixed list below) since the Advanced Student List's export is
// column-selectable and filter-aware, while the plain students export
// isn't. "photo" and "parentProfile" are UI-only concepts (an image, a
// link) with no meaningful CSV cell, so they're simply absent here.
const DIRECTORY_COLUMNS: Record<string, CsvColumn<DirectoryRow>> = {
  name: { header: "Student Name", value: (r) => `${r.firstName} ${r.lastName}` },
  studentId: { header: "Student ID", value: (r) => r.studentNumber },
  rollNumber: { header: "Roll Number", value: (r) => r.rollNumber },
  gender: { header: "Gender", value: (r) => r.sex },
  dateOfBirth: { header: "Date of Birth", value: (r) => new Date(r.dateOfBirth).toISOString().slice(0, 10) },
  admissionDate: { header: "Admission Date", value: (r) => new Date(r.admissionDate).toISOString().slice(0, 10) },
  status: { header: "Status", value: (r) => r.status },
  class: { header: "Class", value: (r) => r.className },
  section: { header: "Section", value: (r) => r.sectionName },
  attendanceToday: {
    header: "Attendance Today",
    value: (r) =>
      r.attendanceToday
        ? `AM: ${r.attendanceToday.MORNING ?? "Not Recorded"}, PM: ${r.attendanceToday.AFTERNOON ?? "Not Recorded"}`
        : "",
  },
  attendanceMorning: { header: "Morning Session", value: (r) => (r.attendanceToday ? (r.attendanceToday.MORNING ?? "Not Recorded") : "") },
  attendanceAfternoon: { header: "Afternoon Session", value: (r) => (r.attendanceToday ? (r.attendanceToday.AFTERNOON ?? "Not Recorded") : "") },
  feeStatus: { header: "Fee Status", value: (r) => r.finance?.feeStatus ?? "" },
  totalFees: { header: "Total Fees", value: (r) => money(r.finance?.totalCharged) },
  amountPaid: { header: "Amount Paid", value: (r) => money(r.finance?.totalPaid) },
  amountDue: { header: "Amount Due", value: (r) => money(r.finance?.balance) },
  lastPayment: {
    header: "Last Payment",
    value: (r) => (r.finance?.lastPaymentDate ? new Date(r.finance.lastPaymentDate).toISOString().slice(0, 10) : ""),
  },
  parentName: { header: "Parent Name", value: (r) => r.guardian?.name ?? "" },
  relationship: { header: "Relationship", value: (r) => r.guardian?.relationship ?? "" },
  parentContact: { header: "Parent Contact", value: (r) => r.guardian?.phone ?? "" },
  parentEmail: { header: "Parent Email", value: (r) => r.guardian?.email ?? "" },
  parentAddress: { header: "Parent Address", value: (r) => r.guardian?.address ?? "" },
};
// Matches the frontend's always-on core columns — used only as a fallback
// when a caller omits `columns` entirely; the Advanced Student List itself
// always sends explicit columns (core + whatever's currently checked).
const DEFAULT_DIRECTORY_COLUMNS = ["name", "studentId", "rollNumber", "gender", "class", "section", "attendanceToday"];

@Injectable()
export class ExportsService {
  constructor(
    private readonly students: StudentsService,
    private readonly directory: StudentDirectoryService,
    private readonly teachers: TeachersService,
    private readonly invoices: InvoicesService,
  ) {}

  // The Advanced Student List's export — respects every active filter (same
  // StudentDirectoryFilters the list itself uses) and, when given, exactly
  // the admin's currently-visible columns. Unknown column ids are ignored
  // rather than erroring, so a frontend/backend version skew never breaks
  // an export outright.
  async exportStudentDirectory(
    actor: AuthenticatedUser,
    schoolId: string,
    filters: StudentDirectoryFilters,
    columns: string[] | undefined,
    onlyIds: string[] | undefined,
  ): Promise<string> {
    let rows = await this.directory.searchAll(actor, schoolId, filters);
    if (onlyIds && onlyIds.length > 0) {
      const wanted = new Set(onlyIds);
      rows = rows.filter((r) => wanted.has(r.enrollmentId));
    }

    const columnIds = (columns && columns.length > 0 ? columns : DEFAULT_DIRECTORY_COLUMNS).filter(
      (id) => id in DIRECTORY_COLUMNS,
    );
    return toCsv(
      rows,
      columnIds.map((id) => DIRECTORY_COLUMNS[id]),
    );
  }

  async exportStudents(actor: AuthenticatedUser, schoolId: string): Promise<string> {
    const rows = await this.students.listForSchool(actor, schoolId);
    return toCsv(rows, [
      { header: "Student Code", value: (r) => r.studentNumber },
      { header: "First Name", value: (r) => r.firstName },
      { header: "Last Name", value: (r) => r.lastName },
      { header: "Class", value: (r) => r.className },
      { header: "Section", value: (r) => r.sectionName },
      { header: "Roll Number", value: (r) => r.rollNumber },
    ]);
  }

  async exportTeachers(actor: AuthenticatedUser, schoolId: string): Promise<string> {
    const rows = await this.teachers.listForSchool(actor, schoolId);
    return toCsv(rows, [
      { header: "Employee Number", value: (r) => r.employeeNumber },
      { header: "First Name", value: (r) => r.firstName },
      { header: "Last Name", value: (r) => r.lastName },
      { header: "Phone", value: (r) => r.phone },
      { header: "Email", value: (r) => r.email },
      { header: "Qualification", value: (r) => r.qualification },
      { header: "Status", value: (r) => r.status },
      { header: "Assignments", value: (r) => r.assignments.map((a) => `${a.section.name}:${a.subject.name}`).join("; ") },
    ]);
  }

  async exportInvoices(actor: AuthenticatedUser, schoolId: string): Promise<string> {
    const rows = await this.invoices.listForSchool(actor, schoolId);
    return toCsv(rows, [
      { header: "Student First Name", value: (r) => r.firstName },
      { header: "Student Last Name", value: (r) => r.lastName },
      { header: "Fee Structure", value: (r) => r.feeStructure.name },
      { header: "Amount", value: (r) => r.amount },
      { header: "Paid", value: (r) => r.paid },
      { header: "Balance", value: (r) => r.balance },
      { header: "Status", value: (r) => r.status },
      { header: "Due Date", value: (r) => (r.dueDate ? new Date(r.dueDate).toISOString().slice(0, 10) : "") },
    ]);
  }
}
