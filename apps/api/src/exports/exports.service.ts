import { Injectable } from "@nestjs/common";
import { StudentsService } from "../students/students.service";
import { TeachersService } from "../teachers/teachers.service";
import { InvoicesService } from "../finance/invoices.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { toCsv } from "./csv.util";

@Injectable()
export class ExportsService {
  constructor(
    private readonly students: StudentsService,
    private readonly teachers: TeachersService,
    private readonly invoices: InvoicesService,
  ) {}

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
