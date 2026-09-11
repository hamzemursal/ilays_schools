import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { ExportsService } from "./exports.service";
import { StudentsService } from "../students/students.service";
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
  const teachers = { listForSchool: jest.fn() };
  const invoices = { listForSchool: jest.fn() };
  const service = new ExportsService(
    students as unknown as StudentsService,
    teachers as unknown as TeachersService,
    invoices as unknown as InvoicesService,
  );
  return { service, students, teachers, invoices };
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
