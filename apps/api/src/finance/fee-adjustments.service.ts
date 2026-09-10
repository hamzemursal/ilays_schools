import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction, AuditModuleName } from "../audit/audit-actions";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateFeeAdjustmentDto } from "./dto/create-fee-adjustment.dto";

@Injectable()
export class FeeAdjustmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly audit: AuditService,
  ) {}

  async listForSchool(actor: AuthenticatedUser, schoolId: string, enrollmentId?: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    return this.prisma.feeAdjustment.findMany({
      where: { schoolId, ...(enrollmentId ? { enrollmentId } : {}) },
      orderBy: { createdAt: "desc" },
    });
  }

  // No separate approval step today, same as every other Finance action in
  // this codebase (fee-structure creation, invoice generation, cash
  // payments) — created as APPROVED immediately, with the creator recorded
  // as the approver for traceability. FeeAdjustmentStatus's PENDING/REJECTED
  // states stay in the schema, ready for a stricter per-school workflow
  // later without another migration; nothing here uses them yet.
  async create(actor: AuthenticatedUser, schoolId: string, dto: CreateFeeAdjustmentDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    if (dto.invoiceId && dto.chargeId) {
      throw new BadRequestException("Provide at most one of invoiceId or chargeId");
    }

    const enrollment = await this.prisma.studentEnrollment.findFirst({
      where: { id: dto.enrollmentId, schoolId },
    });
    if (!enrollment) throw new BadRequestException("That enrollment does not belong to this school");

    if (dto.invoiceId) {
      const invoice = await this.prisma.invoice.findFirst({
        where: { id: dto.invoiceId, enrollmentId: dto.enrollmentId },
      });
      if (!invoice) throw new BadRequestException("That invoice does not belong to this enrollment");
    }

    if (dto.chargeId) {
      const charge = await this.prisma.charge.findFirst({
        where: { id: dto.chargeId, enrollmentId: dto.enrollmentId },
      });
      if (!charge) throw new BadRequestException("That charge does not belong to this enrollment");
    }

    const adjustment = await this.prisma.feeAdjustment.create({
      data: {
        schoolId,
        enrollmentId: dto.enrollmentId,
        invoiceId: dto.invoiceId,
        chargeId: dto.chargeId,
        type: dto.type,
        amount: dto.amount,
        reason: dto.reason,
        requestedByUserId: actor.id,
        approvedByUserId: actor.id,
        approvedAt: new Date(),
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
      },
    });

    await this.audit.record({
      actor,
      organizationId: actor.organizationId,
      schoolId,
      action: AuditAction.FEE_ADJUSTMENT_CREATED,
      module: AuditModuleName.FINANCE,
      resourceType: "FeeAdjustment",
      resourceId: adjustment.id,
      resourceName: `${dto.type} — ${dto.reason}`,
      after: { type: dto.type, amount: dto.amount, reason: dto.reason },
    });

    return adjustment;
  }
}
