import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction, AuditModuleName } from "../audit/audit-actions";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateSalaryHistoryDto } from "./dto/create-salary-history.dto";

@Injectable()
export class SalaryHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly audit: AuditService,
  ) {}

  async listForEmployee(actor: AuthenticatedUser, schoolId: string, teacherId?: string, staffId?: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const { teacherId: t, staffId: s } = await this.resolveExactlyOneEmployee(schoolId, teacherId, staffId);
    return this.prisma.salaryHistory.findMany({
      where: { schoolId, teacherId: t ?? null, staffId: s ?? null },
      orderBy: { effectiveFrom: "desc" },
    });
  }

  async getCurrent(schoolId: string, teacherId?: string, staffId?: string) {
    return this.prisma.salaryHistory.findFirst({
      where: { schoolId, teacherId: teacherId ?? null, staffId: staffId ?? null, effectiveTo: null },
      orderBy: { effectiveFrom: "desc" },
    });
  }

  // A raise never overwrites the prior row — it closes it (effectiveTo = the
  // new row's effectiveFrom) and inserts a new one. Both stay queryable
  // forever, e.g. "Jan 2026 $300, then July 2026 $350."
  async create(actor: AuthenticatedUser, schoolId: string, dto: CreateSalaryHistoryDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const { teacherId, staffId } = await this.resolveExactlyOneEmployee(schoolId, dto.teacherId, dto.staffId);
    const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date();

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.salaryHistory.findFirst({
        where: { schoolId, teacherId: teacherId ?? null, staffId: staffId ?? null, effectiveTo: null },
      });
      if (current) {
        if (current.effectiveFrom >= effectiveFrom) {
          throw new BadRequestException("effectiveFrom must be after the current salary's own effectiveFrom");
        }
        await tx.salaryHistory.update({ where: { id: current.id }, data: { effectiveTo: effectiveFrom } });
      }

      const created = await tx.salaryHistory.create({
        data: { schoolId, teacherId, staffId, basicSalary: dto.basicSalary, effectiveFrom, createdByUserId: actor.id },
      });

      await this.audit.record(
        {
          actor,
          organizationId: actor.organizationId,
          schoolId,
          action: AuditAction.SALARY_CHANGED,
          module: AuditModuleName.PAYROLL,
          resourceType: "SalaryHistory",
          resourceId: created.id,
          before: current ? { basicSalary: Number(current.basicSalary) } : undefined,
          after: { basicSalary: dto.basicSalary, effectiveFrom },
        },
        tx,
      );

      return created;
    }, { timeout: 30_000 });
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
