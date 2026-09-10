import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

// Every figure here is a live query against real rows — no placeholder or
// hard-coded statistic anywhere in this file. Money is summed with plain
// Number() the same way the rest of the (read-only, display-only) Finance
// module already does — see StudentLedgerService for why that's an accepted
// tradeoff here, unlike Payroll's write-path arithmetic.
@Injectable()
export class FinanceDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
  ) {}

  async getSchoolSummary(actor: AuthenticatedUser, schoolId: string, academicYearId?: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const year = await this.resolveYear(schoolId, academicYearId);
    return this.computeSchoolSummary(schoolId, year?.id);
  }

  // No schoolId parameter, deliberately — Central Finance's scope is
  // whatever schools the actor is actually assigned to (empty schoolIds =
  // org-wide, same convention AuditService.buildWhere already uses), never
  // a client-supplied list. Per-school breakdown lets the caller see
  // collection/outstanding/payroll by school, not just one merged number.
  async getCentralSummary(actor: AuthenticatedUser) {
    const schools = await this.prisma.school.findMany({
      where: {
        organizationId: actor.organizationId!,
        ...(actor.schoolIds.length > 0 ? { id: { in: actor.schoolIds } } : {}),
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    const bySchool = await Promise.all(
      schools.map(async (school) => {
        const year = await this.resolveYear(school.id);
        const summary = await this.computeSchoolSummary(school.id, year?.id);
        return { schoolId: school.id, schoolName: school.name, academicYear: year ? { id: year.id, name: year.name } : null, ...summary };
      }),
    );

    const totals = bySchool.reduce(
      (acc, s) => ({
        totalCharged: acc.totalCharged + s.totalCharged,
        totalCollected: acc.totalCollected + s.totalCollected,
        outstanding: acc.outstanding + s.outstanding,
        cashCollection: acc.cashCollection + s.cashCollection,
        zaadCollection: acc.zaadCollection + s.zaadCollection,
        pendingZaadCount: acc.pendingZaadCount + s.pendingZaadVerification.count,
        pendingZaadAmount: acc.pendingZaadAmount + s.pendingZaadVerification.amount,
        expensesTotal: acc.expensesTotal + s.expensesTotal,
        payrollTotal: acc.payrollTotal + s.payrollTotal,
        netFinancialPosition: acc.netFinancialPosition + s.netFinancialPosition,
      }),
      {
        totalCharged: 0,
        totalCollected: 0,
        outstanding: 0,
        cashCollection: 0,
        zaadCollection: 0,
        pendingZaadCount: 0,
        pendingZaadAmount: 0,
        expensesTotal: 0,
        payrollTotal: 0,
        netFinancialPosition: 0,
      },
    );

    return { schools: bySchool, totals };
  }

  private async computeSchoolSummary(schoolId: string, academicYearId?: string) {
    const enrollmentWhere = academicYearId ? { schoolId, academicYearId } : { schoolId };

    const [invoices, charges, adjustments, pendingSubmissions, expenses, paidPayslips] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { enrollment: enrollmentWhere },
        include: { payments: true },
      }),
      this.prisma.charge.findMany({
        where: academicYearId ? { schoolId, academicYearId } : { schoolId },
        include: { payments: true },
      }),
      this.prisma.feeAdjustment.findMany({ where: { schoolId, status: "APPROVED" } }),
      this.prisma.paymentSubmission.findMany({ where: { schoolId, status: "PENDING" } }),
      this.prisma.expense.findMany({ where: { schoolId, status: { in: ["APPROVED", "PAID"] } } }),
      this.prisma.payslip.findMany({ where: { schoolId, status: "PAID" } }),
    ]);

    const postedSum = (payments: { status: string; amount: unknown; method: string }[], method?: string) =>
      payments
        .filter((p) => p.status === "POSTED" && (!method || p.method === method))
        .reduce((sum, p) => sum + Number(p.amount), 0);

    const allPayments = [...invoices.flatMap((i) => i.payments), ...charges.flatMap((c) => c.payments)];

    const totalCharged =
      invoices.reduce((sum, i) => sum + Number(i.amount), 0) + charges.reduce((sum, c) => sum + Number(c.amount), 0);
    const totalCollected = postedSum(allPayments);
    const totalAdjustments = adjustments.reduce((sum, a) => sum + Number(a.amount), 0);
    const outstanding = totalCharged - totalCollected - totalAdjustments;

    const cashCollection = postedSum(allPayments, "CASH");
    const zaadCollection = postedSum(allPayments, "MOBILE_MONEY");

    const expensesTotal = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const payrollTotal = paidPayslips.reduce((sum, p) => sum + Number(p.netSalary), 0);

    return {
      totalCharged: round2(totalCharged),
      totalCollected: round2(totalCollected),
      outstanding: round2(outstanding),
      cashCollection: round2(cashCollection),
      zaadCollection: round2(zaadCollection),
      pendingZaadVerification: {
        count: pendingSubmissions.length,
        amount: round2(pendingSubmissions.reduce((sum, s) => sum + Number(s.amount), 0)),
      },
      expensesTotal: round2(expensesTotal),
      payrollTotal: round2(payrollTotal),
      netFinancialPosition: round2(totalCollected - expensesTotal - payrollTotal),
    };
  }

  private async resolveYear(schoolId: string, academicYearId?: string) {
    const years = await this.prisma.academicYear.findMany({ where: { schoolId } });
    if (academicYearId) return years.find((y) => y.id === academicYearId) ?? null;
    return years.find((y) => y.isCurrent) ?? years[0] ?? null;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
