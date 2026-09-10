import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreatePayrollPeriodDto } from "./dto/create-payroll-period.dto";

@Injectable()
export class PayrollPeriodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
  ) {}

  async listForSchool(actor: AuthenticatedUser, schoolId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    return this.prisma.payrollPeriod.findMany({ where: { schoolId }, orderBy: { startDate: "desc" } });
  }

  async create(actor: AuthenticatedUser, schoolId: string, dto: CreatePayrollPeriodDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    if (new Date(dto.endDate) < new Date(dto.startDate)) {
      throw new BadRequestException("endDate cannot be before startDate");
    }

    try {
      return await this.prisma.payrollPeriod.create({
        data: { schoolId, name: dto.name, startDate: new Date(dto.startDate), endDate: new Date(dto.endDate) },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A payroll period with this name already exists for this school");
      }
      throw error;
    }
  }

  async close(actor: AuthenticatedUser, schoolId: string, payrollPeriodId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    return this.prisma.payrollPeriod.update({
      where: { id: payrollPeriodId },
      data: { status: "CLOSED" },
    });
  }
}
