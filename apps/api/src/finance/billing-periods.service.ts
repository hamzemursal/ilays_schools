import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateBillingPeriodDto } from "./dto/create-billing-period.dto";

@Injectable()
export class BillingPeriodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
  ) {}

  async listForSchool(actor: AuthenticatedUser, schoolId: string, academicYearId?: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    return this.prisma.billingPeriod.findMany({
      where: { schoolId, ...(academicYearId ? { academicYearId } : {}) },
      orderBy: { startDate: "asc" },
    });
  }

  async create(actor: AuthenticatedUser, schoolId: string, dto: CreateBillingPeriodDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const year = await this.prisma.academicYear.findFirst({ where: { id: dto.academicYearId, schoolId } });
    if (!year) throw new BadRequestException("That academic year does not belong to this school");

    if (new Date(dto.endDate) < new Date(dto.startDate)) {
      throw new BadRequestException("endDate cannot be before startDate");
    }

    try {
      return await this.prisma.billingPeriod.create({
        data: {
          schoolId,
          academicYearId: dto.academicYearId,
          name: dto.name,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A billing period with this name already exists for this academic year");
      }
      throw error;
    }
  }
}
