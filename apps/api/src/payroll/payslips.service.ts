import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { SalaryHistoryService } from "./salary-history.service";
import { NotificationsService } from "../notifications/notifications.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction, AuditModuleName } from "../audit/audit-actions";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreatePayslipDto } from "./dto/create-payslip.dto";
import { AddPayslipLineItemDto } from "./dto/add-payslip-line-item.dto";

const PAYSLIP_INCLUDE = {
  teacher: { select: { id: true, firstName: true, lastName: true } },
  staff: { select: { id: true, firstName: true, lastName: true } },
  lineItems: true,
  advanceRepayments: true,
} as const;

// All money arithmetic here uses Prisma.Decimal, never plain JS Number —
// this is the one place in the codebase computing an amount that gets
// written back (basicSalary/allowances/bonuses/deductions/advance
// repayments -> netSalary), as opposed to Finance's read-only ledger
// summation, so float drift actually matters here.
@Injectable()
export class PayslipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly salaryHistory: SalaryHistoryService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async listForSchool(actor: AuthenticatedUser, schoolId: string, payrollPeriodId?: string, status?: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    return this.prisma.payslip.findMany({
      where: { schoolId, ...(payrollPeriodId ? { payrollPeriodId } : {}), ...(status ? { status: status as never } : {}) },
      include: PAYSLIP_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
  }

  async getOne(actor: AuthenticatedUser, schoolId: string, payslipId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const payslip = await this.prisma.payslip.findFirst({ where: { id: payslipId, schoolId }, include: PAYSLIP_INCLUDE });
    if (!payslip) throw new NotFoundException("Payslip not found in this school");
    return payslip;
  }

  async create(actor: AuthenticatedUser, schoolId: string, payrollPeriodId: string, dto: CreatePayslipDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const period = await this.prisma.payrollPeriod.findFirst({ where: { id: payrollPeriodId, schoolId } });
    if (!period) throw new NotFoundException("Payroll period not found in this school");
    if (period.status !== "OPEN") throw new BadRequestException("This payroll period is closed");

    const { teacherId, staffId } = await this.resolveExactlyOneEmployee(schoolId, dto.teacherId, dto.staffId);

    let basicSalary = dto.basicSalary;
    if (basicSalary === undefined) {
      const current = await this.salaryHistory.getCurrent(schoolId, teacherId, staffId);
      if (!current) {
        throw new BadRequestException("This employee has no salary on file — record one via Salary History first, or provide basicSalary directly");
      }
      basicSalary = Number(current.basicSalary);
    }

    try {
      const payslip = await this.prisma.payslip.create({
        data: {
          payrollPeriodId,
          schoolId,
          teacherId,
          staffId,
          basicSalary,
          grossSalary: basicSalary,
          netSalary: basicSalary,
          preparedByUserId: actor.id,
        },
        include: PAYSLIP_INCLUDE,
      });

      await this.audit.record({
        actor,
        organizationId: actor.organizationId,
        schoolId,
        action: AuditAction.PAYSLIP_CREATED,
        module: AuditModuleName.PAYROLL,
        resourceType: "Payslip",
        resourceId: payslip.id,
        after: { basicSalary },
      });

      return payslip;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("This employee already has a payslip for this payroll period");
      }
      throw error;
    }
  }

  async addLineItem(actor: AuthenticatedUser, schoolId: string, payslipId: string, dto: AddPayslipLineItemDto) {
    const payslip = await this.getInStatusOrThrow(actor, schoolId, payslipId, "DRAFT");

    if (dto.type === "ADVANCE_REPAYMENT") {
      throw new BadRequestException("Advance repayment lines are generated automatically during calculation, not added manually");
    }

    return this.prisma.payslipLineItem.create({
      data: { payslipId: payslip.id, type: dto.type, label: dto.label, amount: dto.amount },
    });
  }

  // DRAFT -> CALCULATED. Sums the manually-added ALLOWANCE/BONUS/DEDUCTION
  // lines, then auto-applies repayment on every ACTIVE advance this
  // employee has (creating the AdvanceRepayment + its own
  // ADVANCE_REPAYMENT line item, closing the advance if this installment
  // clears it) — "payroll automatically reflects repayment."
  async calculate(actor: AuthenticatedUser, schoolId: string, payslipId: string) {
    const payslip = await this.getInStatusOrThrow(actor, schoolId, payslipId, "DRAFT");

    return this.prisma.$transaction(async (tx) => {
      const lineItems = await tx.payslipLineItem.findMany({ where: { payslipId } });
      const basic = new Prisma.Decimal(payslip.basicSalary);
      let additions = new Prisma.Decimal(0);
      let deductions = new Prisma.Decimal(0);
      for (const li of lineItems) {
        const amt = new Prisma.Decimal(li.amount);
        if (li.type === "ALLOWANCE" || li.type === "BONUS") additions = additions.plus(amt);
        else if (li.type === "DEDUCTION") deductions = deductions.plus(amt);
      }
      const gross = basic.plus(additions);

      const advances = await tx.staffAdvance.findMany({
        where: { schoolId, status: "ACTIVE", teacherId: payslip.teacherId, staffId: payslip.staffId },
        include: { repayments: true },
      });

      let advanceRepaymentTotal = new Prisma.Decimal(0);
      for (const advance of advances) {
        const repaidSoFar = advance.repayments.reduce((sum, r) => sum.plus(new Prisma.Decimal(r.amount)), new Prisma.Decimal(0));
        const remaining = new Prisma.Decimal(advance.amount).minus(repaidSoFar);
        if (remaining.lessThanOrEqualTo(0)) continue;

        const installment = Prisma.Decimal.min(new Prisma.Decimal(advance.repaymentPerPeriod), remaining);
        await tx.advanceRepayment.create({
          data: { staffAdvanceId: advance.id, payslipId, amount: installment },
        });
        await tx.payslipLineItem.create({
          data: { payslipId, type: "ADVANCE_REPAYMENT", label: "Advance repayment", amount: installment },
        });
        if (remaining.minus(installment).lessThanOrEqualTo(0)) {
          await tx.staffAdvance.update({ where: { id: advance.id }, data: { status: "COMPLETED" } });
        }
        advanceRepaymentTotal = advanceRepaymentTotal.plus(installment);
      }

      const net = gross.minus(deductions).minus(advanceRepaymentTotal);

      const updated = await tx.payslip.update({
        where: { id: payslipId },
        data: { grossSalary: gross, netSalary: net, status: "CALCULATED" },
        include: PAYSLIP_INCLUDE,
      });

      await this.audit.record(
        {
          actor,
          organizationId: actor.organizationId,
          schoolId,
          action: AuditAction.PAYSLIP_CALCULATED,
          module: AuditModuleName.PAYROLL,
          resourceType: "Payslip",
          resourceId: payslipId,
          after: { grossSalary: gross.toNumber(), netSalary: net.toNumber() },
        },
        tx,
      );

      return updated;
    }, { timeout: 30_000 });
  }

  async review(actor: AuthenticatedUser, schoolId: string, payslipId: string) {
    return this.transition(actor, schoolId, payslipId, "CALCULATED", "REVIEWED", {
      reviewedByUserId: actor.id,
      reviewedAt: new Date(),
    }, AuditAction.PAYSLIP_REVIEWED);
  }

  async approve(actor: AuthenticatedUser, schoolId: string, payslipId: string) {
    return this.transition(actor, schoolId, payslipId, "REVIEWED", "APPROVED", {
      approvedByUserId: actor.id,
      approvedAt: new Date(),
    }, AuditAction.PAYSLIP_APPROVED);
  }

  async pay(actor: AuthenticatedUser, schoolId: string, payslipId: string) {
    const updated = await this.transition(actor, schoolId, payslipId, "APPROVED", "PAID", {
      paidByUserId: actor.id,
      paidAt: new Date(),
    }, AuditAction.PAYSLIP_PAID);

    const userId = updated.teacherId
      ? (await this.prisma.teacher.findFirst({ where: { id: updated.teacherId }, select: { userId: true } }))?.userId
      : (await this.prisma.staff.findFirst({ where: { id: updated.staffId! }, select: { userId: true } }))?.userId;
    if (userId) {
      await this.notifications.notifyUser(userId, {
        title: "Payslip paid",
        body: `Your payslip for $${Number(updated.netSalary).toFixed(2)} has been paid.`,
      });
    }

    return updated;
  }

  private async transition(
    actor: AuthenticatedUser,
    schoolId: string,
    payslipId: string,
    fromStatus: string,
    toStatus: string,
    extraData: Record<string, unknown>,
    action: string,
  ) {
    await this.getInStatusOrThrow(actor, schoolId, payslipId, fromStatus);

    const updated = await this.prisma.payslip.update({
      where: { id: payslipId },
      data: { status: toStatus as never, ...extraData },
      include: PAYSLIP_INCLUDE,
    });

    await this.audit.record({
      actor,
      organizationId: actor.organizationId,
      schoolId,
      action,
      module: AuditModuleName.PAYROLL,
      resourceType: "Payslip",
      resourceId: payslipId,
      before: { status: fromStatus },
      after: { status: toStatus },
    });

    return updated;
  }

  private async getInStatusOrThrow(actor: AuthenticatedUser, schoolId: string, payslipId: string, expectedStatus: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const payslip = await this.prisma.payslip.findFirst({ where: { id: payslipId, schoolId } });
    if (!payslip) throw new NotFoundException("Payslip not found in this school");
    if (payslip.status !== expectedStatus) {
      throw new BadRequestException(`This payslip is ${payslip.status.toLowerCase()}, not ${expectedStatus.toLowerCase()}`);
    }
    return payslip;
  }

  private async resolveExactlyOneEmployee(schoolId: string, teacherId?: string, staffId?: string) {
    if (!teacherId === !staffId) {
      throw new BadRequestException("Provide exactly one of teacherId or staffId");
    }
    if (teacherId) {
      const teacher = await this.prisma.teacher.findFirst({ where: { id: teacherId, schoolId } });
      if (!teacher) throw new BadRequestException("That teacher does not belong to this school");
      return { teacherId, staffId: undefined };
    }
    const staff = await this.prisma.staff.findFirst({ where: { id: staffId, schoolId } });
    if (!staff) throw new BadRequestException("That staff member does not belong to this school");
    return { teacherId: undefined, staffId };
  }
}
