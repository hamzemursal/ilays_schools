import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { ExportsService } from "./exports.service";
import { StudentsService } from "../students/students.service";
import { StudentDirectoryService } from "../students/student-directory.service";
import { TeachersService } from "../teachers/teachers.service";
import { InvoicesService } from "../finance/invoices.service";

const ACTOR: AuthenticatedUser = {
  id: "admin-1",
  email: "admin@example.com",
  organizationId: "org-1",
  roles: ["SCHOOL_ADMIN"],
  permissions: ["exports.run"],
  schoolIds: ["school-1"],
};

function createService() {
  const students = { listForSchool: jest.fn() };
  const directory = { searchAll: jest.fn() };
  const teachers = { listForSchool: jest.fn() };
  const invoices = { listForSchool: jest.fn() };
  const service = new ExportsService(
    students as unknown as StudentsService,
    directory as unknown as StudentDirectoryService,
    teachers as unknown as TeachersService,
    invoices as unknown as InvoicesService,
  );
  return { service, students, directory, teachers, invoices };
}

describe("ExportsService.exportStudents", () => {
  it("delegates to StudentsService.listForSchool and renders a matching CSV header row", async () => {
    const { service, students } = createService();
    students.listForSchool.mockResolvedValue([
      { studentNumber: "STU-1", firstName: "A", lastName: "One", className: "Class 3", sectionName: "B", rollNumber: 5 },
    ]);

    const csv = await service.exportStudents(ACTOR, "school-1");

    expect(students.listForSchool).toHaveBeenCalledWith(ACTOR, "school-1");
    expect(csv).toBe(
      "Student Code,First Name,Last Name,Class,Section,Roll Number\r\n" + "STU-1,A,One,Class 3,B,5\r\n",
    );
  });

  it("produces just the header row (and trailing CRLF) for an empty school", async () => {
    const { service, students } = createService();
    students.listForSchool.mockResolvedValue([]);

    const csv = await service.exportStudents(ACTOR, "school-1");

    expect(csv).toBe("Student Code,First Name,Last Name,Class,Section,Roll Number\r\n");
  });
});

describe("ExportsService.exportTeachers", () => {
  it("joins each teacher's assignments as 'section:subject' pairs separated by '; '", async () => {
    const { service, teachers } = createService();
    teachers.listForSchool.mockResolvedValue([
      {
        employeeNumber: "EMP-1",
        firstName: "Amran",
        lastName: "Hassan",
        phone: "555",
        email: "a@example.com",
        qualification: "BEd",
        status: "ACTIVE",
        assignments: [
          { section: { name: "1A" }, subject: { name: "Math" } },
          { section: { name: "1B" }, subject: { name: "Science" } },
        ],
      },
    ]);

    const csv = await service.exportTeachers(ACTOR, "school-1");

    expect(csv).toContain("1A:Math; 1B:Science");
  });

  it("renders an empty Assignments cell for a teacher with none", async () => {
    const { service, teachers } = createService();
    teachers.listForSchool.mockResolvedValue([
      { employeeNumber: "EMP-1", firstName: "A", lastName: "B", phone: null, email: null, qualification: null, status: "ACTIVE", assignments: [] },
    ]);

    const csv = await service.exportTeachers(ACTOR, "school-1");

    const dataLine = csv.split("\r\n")[1];
    expect(dataLine.endsWith(",ACTIVE,")).toBe(true);
  });
});

describe("ExportsService.exportInvoices", () => {
  it("formats dueDate as a plain YYYY-MM-DD, empty string when null", async () => {
    const { service, invoices } = createService();
    invoices.listForSchool.mockResolvedValue([
      { firstName: "A", lastName: "One", feeStructure: { name: "Tuition" }, amount: 100, paid: 40, balance: 60, status: "PARTIALLY_PAID", dueDate: new Date("2028-02-15") },
      { firstName: "B", lastName: "Two", feeStructure: { name: "Tuition" }, amount: 50, paid: 50, balance: 0, status: "PAID", dueDate: null },
    ]);

    const csv = await service.exportInvoices(ACTOR, "school-1");

    const [, row1, row2] = csv.split("\r\n");
    expect(row1).toContain("2028-02-15");
    expect(row2.endsWith(",PAID,")).toBe(true);
  });

  it("escapes a fee structure name containing a comma per CSV rules", async () => {
    const { service, invoices } = createService();
    invoices.listForSchool.mockResolvedValue([
      { firstName: "A", lastName: "One", feeStructure: { name: "Tuition, Term 1" }, amount: 100, paid: 0, balance: 100, status: "UNPAID", dueDate: null },
    ]);

    const csv = await service.exportInvoices(ACTOR, "school-1");

    expect(csv).toContain('"Tuition, Term 1"');
  });
});

describe("ExportsService.exportStudentDirectory — Advanced Student List export", () => {
  function row(overrides: Record<string, unknown> = {}) {
    return {
      enrollmentId: "enr-1",
      firstName: "Hodan",
      lastName: "Ali",
      studentNumber: "STU-2027-00001",
      rollNumber: 3,
      className: "Class 1",
      sectionName: "A",
      sex: "FEMALE",
      status: "ACTIVE",
      dateOfBirth: new Date("2015-05-01"),
      admissionDate: new Date("2027-01-10"),
      attendanceToday: { MORNING: "PRESENT", AFTERNOON: null },
      finance: { totalCharged: 100, totalPaid: 40, balance: 60, feeStatus: "PARTIALLY_PAID", lastPaymentDate: new Date("2027-02-01") },
      guardian: { name: "Amina Ali", relationship: "MOTHER", phone: "0611111111", email: "amina@example.com", address: "Hargeisa" },
      ...overrides,
    };
  }

  it("passes every filter straight through to StudentDirectoryService.searchAll", async () => {
    const { service, directory } = createService();
    directory.searchAll.mockResolvedValue([]);
    const filters = { academicYearId: "year-1", classId: "class-1", feeStatus: "OVERDUE" as const };

    await service.exportStudentDirectory(ACTOR, "school-1", filters, undefined, undefined);

    expect(directory.searchAll).toHaveBeenCalledWith(ACTOR, "school-1", filters);
  });

  it("uses the default column set when none is specified", async () => {
    const { service, directory } = createService();
    directory.searchAll.mockResolvedValue([row()]);

    const csv = await service.exportStudentDirectory(ACTOR, "school-1", { academicYearId: "year-1" }, undefined, undefined);

    expect(csv.split("\r\n")[0]).toBe(
      "Student Name,Student ID,Roll Number,Class,Section,Attendance Today,Fee Status,Parent Name,Parent Contact",
    );
  });

  it("exports exactly the requested columns, in the requested order, and ignores unknown ids", async () => {
    const { service, directory } = createService();
    directory.searchAll.mockResolvedValue([row()]);

    const csv = await service.exportStudentDirectory(
      ACTOR,
      "school-1",
      { academicYearId: "year-1" },
      ["totalFees", "amountDue", "notAnActualColumn"],
      undefined,
    );

    expect(csv.split("\r\n")[0]).toBe("Total Fees,Amount Due");
    expect(csv.split("\r\n")[1]).toBe("100.00,60.00");
  });

  it("renders 'AM: ... PM: ...' for attendance, and a real Not Recorded — never Absent — for an unmarked session", async () => {
    const { service, directory } = createService();
    directory.searchAll.mockResolvedValue([row({ attendanceToday: { MORNING: "PRESENT", AFTERNOON: null } })]);

    const csv = await service.exportStudentDirectory(ACTOR, "school-1", { academicYearId: "year-1" }, ["attendanceToday"], undefined);

    expect(csv).toContain("AM: PRESENT, PM: Not Recorded");
    expect(csv).not.toContain("Absent");
  });

  it("filters to only the given enrollment ids for 'Export Selected Students'", async () => {
    const { service, directory } = createService();
    directory.searchAll.mockResolvedValue([row({ enrollmentId: "enr-1" }), row({ enrollmentId: "enr-2", firstName: "Yusuf" })]);

    const csv = await service.exportStudentDirectory(
      ACTOR,
      "school-1",
      { academicYearId: "year-1" },
      ["name"],
      ["enr-2"],
    );

    expect(csv).toBe("Student Name\r\nYusuf Ali\r\n");
  });

  it("leaves fee/attendance cells blank rather than fabricated when the backend omitted them (no permission)", async () => {
    const { service, directory } = createService();
    directory.searchAll.mockResolvedValue([row({ attendanceToday: null, finance: null })]);

    const csv = await service.exportStudentDirectory(
      ACTOR,
      "school-1",
      { academicYearId: "year-1" },
      ["attendanceToday", "feeStatus", "totalFees"],
      undefined,
    );

    expect(csv.split("\r\n")[1]).toBe(",,");
  });
});
