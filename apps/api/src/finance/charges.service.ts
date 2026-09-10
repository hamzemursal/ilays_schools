import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction, AuditModuleName } from "../audit/audit-actions";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { RecordPaymentDto } from "./dto/record-payment.dto";

type ChargeWithRelations = Prisma.ChargeGetPayload<{ include: { payments: true; feeStructure: true; billingPeriod: true } }>;

// Generalizes InvoicesService.generateForFeeStructure/recordPayment to
// billing-period-scoped recurring charges. Deliberately a separate service
// against the separate Charge model (see the schema comment on Charge) —
// Invoice's own generation/payment logic is untouched by any of this.
@Injectable()
export class ChargesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly audit: AuditService,
  ) {}

  async generateForFeeStructure(actor: AuthenticatedUser, schoolId: string, feeStructureId: string, billingPeriodId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const feeStructure = await this.prisma.feeStructure.findFirst({ where: { id: feeStructureId, schoolId } });
    if (!feeStructure) throw new NotFoundException("Fee structure not found in this school");

    const billingPeriod = await this.prisma.billingPeriod.findFirst({ where: { id: billingPeriodId, schoolId } });
    if (!billingPeriod) throw new NotFoundException("Billing period not found in this school");
    if (billingPeriod.academicYearId !== feeStructure.academicYearId) {
      throw new BadRequestException("That billing period is not in the same academic year as the fee structure");
    }

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: {
        schoolId,
        academicYearId: feeStructure.academicYearId,
        status: "ACTIVE",
        ...(feeStructure.classId ? { classId: feeStructure.classId } : {}),
      },
      select: { id: true },
    });

    const result = await this.prisma.charge.createMany({
      data: enrollments.map((e) => ({
        schoolId,
        academicYearId: feeStructure.academicYearId,
        enrollmentId: e.id,
        feeStructureId,
        billingPeriodId,
        amount: feeStructure.amount,
      })),
      skipDuplicates: true, // an enrollment already charged for this fee+period is left untouched
    });

    await this.audit.record({
      actor,
      organizationId: actor.organizationId,
      schoolId,
      action: AuditAction.CHARGES_GENERATED,
      module: AuditModuleName.FINANCE,
      resourceType: "FeeStructure",
      resourceId: feeStructureId,
      after: { billingPeriodId, createdCount: result.count, eligibleEnrollments: enrollments.length },
    });

    return { createdCount: result.count, eligibleEnrollments: enrollments.length };
  }

  async listForSchool(actor: AuthenticatedUser, schoolId: string, status?: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const charges = await this.prisma.charge.findMany({
      where: { schoolId, ...(status ? { status: status as never } : {}) },
      include: { feeStructure: true, billingPeriod: true, payments: true, enrollment: { include: { student: true } } },
      orderBy: { createdAt: "desc" },
    });

    return charges.map((c) => ({
      ...this.toView(c),
      enrollmentId: c.enrollmentId,
      studentId: c.enrollment.studentId,
      firstName: c.enrollment.student.firstName,
      lastName: c.enrollment.student.lastName,
    }));
  }

  async recordPayment(actor: AuthenticatedUser, chargeId: string, dto: RecordPaymentDto) {
    const charge = await this.getAccessibleChargeOrThrow(actor, chargeId);

    const alreadyPaid = charge.payments
      .filter((p) => p.status === "POSTED")
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const remaining = Number(charge.amount) - alreadyPaid;
    if (dto.amount > remaining) {
      throw new BadRequestException(`Payment of ${dto.amount} exceeds the remaining balance of ${remaining.toFixed(2)}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          chargeId,
          amount: dto.amount,
          method: dto.method,
          reference: dto.reference,
          recordedByUserId: actor.id,
        },
      });

      const newTotal = alreadyPaid + dto.amount;
      const newStatus = newTotal >= Number(charge.amount) ? "PAID" : "PARTIALLY_PAID";
      await tx.charge.update({ where: { id: chargeId }, data: { status: newStatus } });

      await this.audit.record(
        {
          actor,
          organizationId: actor.organizationId,
          schoolId: charge.schoolId,
          action: AuditAction.PAYMENT_RECORDED,
          module: AuditModuleName.FINANCE,
          resourceType: "Charge",
          resourceId: chargeId,
          after: { amount: dto.amount, method: dto.method ?? "CASH", newStatus },
        },
        tx,
      );

      return payment;
    }, { timeout: 30_000 });
  }

  async listPayments(actor: AuthenticatedUser, chargeId: string) {
    await this.getAccessibleChargeOrThrow(actor, chargeId);
    return this.prisma.payment.findMany({ where: { chargeId }, orderBy: { paidAt: "desc" } });
  }

  private async getAccessibleChargeOrThrow(actor: AuthenticatedUser, chargeId: string) {
    const charge = await this.prisma.charge.findUnique({
      where: { id: chargeId },
      include: { payments: true, feeStructure: true },
    });
    if (!charge) throw new NotFoundException("Charge not found");
    await this.schools.findOneAccessibleOrThrow(actor, charge.schoolId);
    return charge;
  }

  private toView(charge: ChargeWithRelations) {
    const paid = charge.payments.filter((p) => p.status === "POSTED").reduce((sum, p) => sum + Number(p.amount), 0);
    return {
      id: charge.id,
      amount: Number(charge.amount),
      status: charge.status,
      dueDate: charge.dueDate,
      paid,
      balance: Number(charge.amount) - paid,
      feeStructure: { id: charge.feeStructure.id, name: charge.feeStructure.name },
      billingPeriod: { id: charge.billingPeriod?.id, name: charge.billingPeriod?.name },
    };
  }
}
