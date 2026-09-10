import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction, AuditModuleName } from "../audit/audit-actions";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateStaffAdvanceDto } from "./dto/create-staff-advance.dto";

@Injectable()
export class StaffAdvancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly audit: AuditService,
  ) {}

  async listForSchool(actor: AuthenticatedUser, schoolId: string, teacherId?: string, staffId?: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const advances = await this.prisma.staffAdvance.findMany({
      where: { schoolId, ...(teacherId ? { teacherId } : {}), ...(staffId ? { staffId } : {}) },
      include: { repayments: true },
      orderBy: { issuedAt: "desc" },
    });
    return advances.map((a) => this.toView(a));
  }

  async create(actor: AuthenticatedUser, schoolId: string, dto: CreateStaffAdvanceDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const { teacherId, staffId } = await this.resolveExactlyOneEmployee(schoolId, dto.teacherId, dto.staffId);

    const advance = await this.prisma.staffAdvance.create({
      data: {
        schoolId,
        teacherId,
        staffId,
        amount: dto.amount,
        repaymentPerPeriod: dto.repaymentPerPeriod,
        issuedByUserId: actor.id,
        notes: dto.notes,
      },
    });

    await this.audit.record({
      actor,
      organizationId: actor.organizationId,
      schoolId,
      action: AuditAction.STAFF_ADVANCE_ISSUED,
      module: AuditModuleName.PAYROLL,
      resourceType: "StaffAdvance",
      resourceId: advance.id,
      after: { amount: dto.amount, repaymentPerPeriod: dto.repaymentPerPeriod },
    });

    return advance;
  }

  async getOutstanding(id: string, tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    const advance = await tx.staffAdvance.findUnique({ where: { id }, include: { repayments: true } });
    if (!advance) throw new NotFoundException("Advance not found");
    return this.toView(advance);
  }

  private toView(advance: { id: string; amount: unknown; repaymentPerPeriod: unknown; status: string; repayments: { amount: unknown }[] }) {
    const repaid = advance.repayments.reduce((sum, r) => sum.plus(new Prisma.Decimal(r.amount as never)), new Prisma.Decimal(0));
    const total = new Prisma.Decimal(advance.amount as never);
    return {
      ...advance,
      totalRepaid: repaid.toNumber(),
      remainingBalance: total.minus(repaid).toNumber(),
    };
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
