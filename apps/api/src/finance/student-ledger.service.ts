import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { StudentsService } from "../students/students.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

// The "Student Financial Account/Ledger" — deliberately not a stored table.
// A student's balance is always derived here, fresh, from Invoice/Charge
// (what's owed), Payment (what's been posted — REVERSED rows excluded), and
// FeeAdjustment (what's been APPROVED off the balance). Nothing writes a
// balance anywhere; this is the one place that computes it.
@Injectable()
export class StudentLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly students: StudentsService,
  ) {}

  async getLedger(actor: AuthenticatedUser, studentId: string) {
    await this.students.assertAccessibleStudent(actor, studentId);

    const enrollmentWhere = {
      studentId,
      ...(actor.schoolIds.length > 0 ? { schoolId: { in: actor.schoolIds } } : {}),
    };
    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: enrollmentWhere,
      select: { id: true },
    });
    const enrollmentIds = enrollments.map((e) => e.id);

    const [invoices, charges, adjustments] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { enrollmentId: { in: enrollmentIds } },
        include: { feeStructure: true, payments: true },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.charge.findMany({
        where: { enrollmentId: { in: enrollmentIds } },
        include: { feeStructure: true, billingPeriod: true, payments: true },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.feeAdjustment.findMany({
        where: { enrollmentId: { in: enrollmentIds } },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const totalCharged =
      invoices.reduce((sum, i) => sum + Number(i.amount), 0) + charges.reduce((sum, c) => sum + Number(c.amount), 0);

    const postedPaymentsSum = (payments: { status: string; amount: unknown }[]) =>
      payments.filter((p) => p.status === "POSTED").reduce((sum, p) => sum + Number(p.amount), 0);
    const totalPaid =
      invoices.reduce((sum, i) => sum + postedPaymentsSum(i.payments), 0) +
      charges.reduce((sum, c) => sum + postedPaymentsSum(c.payments), 0);

    const totalAdjustments = adjustments
      .filter((a) => a.status === "APPROVED")
      .reduce((sum, a) => sum + Number(a.amount), 0);

    const balance = totalCharged - totalPaid - totalAdjustments;

    return {
      summary: {
        totalCharged: round2(totalCharged),
        totalPaid: round2(totalPaid),
        totalAdjustments: round2(totalAdjustments),
        balance: round2(balance),
      },
      invoices: invoices.map((i) => ({
        id: i.id,
        kind: "INVOICE" as const,
        amount: Number(i.amount),
        status: i.status,
        dueDate: i.dueDate,
        paid: postedPaymentsSum(i.payments),
        feeStructure: { id: i.feeStructure.id, name: i.feeStructure.name },
        payments: i.payments,
      })),
      charges: charges.map((c) => ({
        id: c.id,
        kind: "CHARGE" as const,
        amount: Number(c.amount),
        status: c.status,
        dueDate: c.dueDate,
        paid: postedPaymentsSum(c.payments),
        feeStructure: { id: c.feeStructure.id, name: c.feeStructure.name },
        billingPeriod: c.billingPeriod ? { id: c.billingPeriod.id, name: c.billingPeriod.name } : null,
        payments: c.payments,
      })),
      adjustments,
    };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
