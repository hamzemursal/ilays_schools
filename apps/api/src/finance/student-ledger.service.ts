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

  // Bulk version of the same math as getLedger's summary, for however many
  // enrollments are on an Advanced Student List page — a handful of
  // grouped queries here, never one getLedger() call per row. No school
  // access re-check: callers (e.g. StudentDirectoryService) already
  // validated the caller can see this school before narrowing to these
  // enrollment IDs.
  async getSummaryForEnrollments(enrollmentIds: string[]): Promise<
    Map<string, { totalCharged: number; totalPaid: number; balance: number; feeStatus: FeeStatus; lastPaymentDate: Date | null }>
  > {
    const totalAdjustments = new Map<string, number>();
    const result = new Map<
      string,
      { totalCharged: number; totalPaid: number; balance: number; feeStatus: FeeStatus; lastPaymentDate: Date | null }
    >();
    for (const id of enrollmentIds) {
      result.set(id, { totalCharged: 0, totalPaid: 0, balance: 0, feeStatus: "NO_CHARGE", lastPaymentDate: null });
      totalAdjustments.set(id, 0);
    }
    if (enrollmentIds.length === 0) return result;

    const today = new Date().toISOString().slice(0, 10);

    const [invoices, charges, adjustments] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { enrollmentId: { in: enrollmentIds } },
        select: { enrollmentId: true, amount: true, dueDate: true, payments: { where: { status: "POSTED" }, select: { amount: true, paidAt: true } } },
      }),
      this.prisma.charge.findMany({
        where: { enrollmentId: { in: enrollmentIds } },
        select: { enrollmentId: true, amount: true, dueDate: true, status: true, payments: { where: { status: "POSTED" }, select: { amount: true, paidAt: true } } },
      }),
      this.prisma.feeAdjustment.findMany({
        where: { enrollmentId: { in: enrollmentIds }, status: "APPROVED" },
        select: { enrollmentId: true, amount: true },
      }),
    ]);

    const overdue = new Set<string>();
    const paidSum = (payments: { amount: unknown }[]) => payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const lastPaidAt = (payments: { paidAt: Date }[]) =>
      payments.reduce<Date | null>((latest, p) => (!latest || p.paidAt > latest ? p.paidAt : latest), null);

    for (const inv of invoices) {
      const entry = result.get(inv.enrollmentId)!;
      const paid = paidSum(inv.payments);
      entry.totalCharged += Number(inv.amount);
      entry.totalPaid += paid;
      const latest = lastPaidAt(inv.payments);
      if (latest && (!entry.lastPaymentDate || latest > entry.lastPaymentDate)) entry.lastPaymentDate = latest;
      if (paid < Number(inv.amount) && inv.dueDate && inv.dueDate.toISOString().slice(0, 10) < today) {
        overdue.add(inv.enrollmentId);
      }
    }
    for (const chg of charges) {
      if (chg.status === "CANCELLED") continue;
      const entry = result.get(chg.enrollmentId)!;
      const paid = paidSum(chg.payments);
      entry.totalCharged += Number(chg.amount);
      entry.totalPaid += paid;
      const latest = lastPaidAt(chg.payments);
      if (latest && (!entry.lastPaymentDate || latest > entry.lastPaymentDate)) entry.lastPaymentDate = latest;
      if (paid < Number(chg.amount) && chg.dueDate && chg.dueDate.toISOString().slice(0, 10) < today) {
        overdue.add(chg.enrollmentId);
      }
    }
    for (const adj of adjustments) {
      totalAdjustments.set(adj.enrollmentId, (totalAdjustments.get(adj.enrollmentId) ?? 0) + Number(adj.amount));
    }

    for (const [enrollmentId, entry] of result) {
      entry.totalCharged = round2(entry.totalCharged);
      entry.totalPaid = round2(entry.totalPaid);
      // Mirrors getLedger's own formula exactly: an approved adjustment
      // reduces the balance without being counted as a "payment" — Amount
      // Paid in the list must reflect real money received, nothing else.
      entry.balance = round2(entry.totalCharged - entry.totalPaid - (totalAdjustments.get(enrollmentId) ?? 0));
      if (entry.totalCharged === 0) entry.feeStatus = "NO_CHARGE";
      else if (entry.balance <= 0) entry.feeStatus = "PAID";
      else if (overdue.has(enrollmentId)) entry.feeStatus = "OVERDUE";
      else if (entry.totalPaid > 0) entry.feeStatus = "PARTIALLY_PAID";
      else entry.feeStatus = "PENDING";
    }

    return result;
  }
}

export type FeeStatus = "PAID" | "PARTIALLY_PAID" | "PENDING" | "OVERDUE" | "NO_CHARGE";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
