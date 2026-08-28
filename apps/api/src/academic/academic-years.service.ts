import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateAcademicYearDto } from "./dto/create-academic-year.dto";
import { UpdateAcademicYearDto } from "./dto/update-academic-year.dto";

@Injectable()
export class AcademicYearsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
  ) {}

  async list(actor: AuthenticatedUser, schoolId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    return this.prisma.academicYear.findMany({ where: { schoolId }, orderBy: { startDate: "desc" } });
  }

  async create(actor: AuthenticatedUser, schoolId: string, dto: CreateAcademicYearDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.isCurrent) {
          await tx.academicYear.updateMany({ where: { schoolId, isCurrent: true }, data: { isCurrent: false } });
        }
        return tx.academicYear.create({
          data: {
            schoolId,
            name: dto.name,
            startDate: new Date(dto.startDate),
            endDate: new Date(dto.endDate),
            isCurrent: dto.isCurrent ?? false,
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("An academic year with this name already exists for this school");
      }
      throw error;
    }
  }

  async update(actor: AuthenticatedUser, schoolId: string, id: string, dto: UpdateAcademicYearDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const year = await this.prisma.academicYear.findFirst({ where: { id, schoolId } });
    if (!year) throw new NotFoundException("Academic year not found");

    return this.prisma.$transaction(async (tx) => {
      if (dto.isCurrent) {
        await tx.academicYear.updateMany({ where: { schoolId, isCurrent: true }, data: { isCurrent: false } });
      }
      return tx.academicYear.update({
        where: { id },
        data: { isCurrent: dto.isCurrent },
      });
    });
  }
}
