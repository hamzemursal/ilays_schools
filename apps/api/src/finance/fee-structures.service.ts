import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateFeeStructureDto } from "./dto/create-fee-structure.dto";

@Injectable()
export class FeeStructuresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
  ) {}

  async listForSchool(actor: AuthenticatedUser, schoolId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    return this.prisma.feeStructure.findMany({
      where: { schoolId },
      include: { class: true, academicYear: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(actor: AuthenticatedUser, schoolId: string, dto: CreateFeeStructureDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const year = await this.prisma.academicYear.findFirst({ where: { id: dto.academicYearId, schoolId } });
    if (!year) throw new BadRequestException("That academic year does not belong to this school");

    if (dto.classId) {
      const cls = await this.prisma.class.findFirst({ where: { id: dto.classId, division: { schoolId } } });
      if (!cls) throw new BadRequestException("That class does not belong to this school");
    }

    try {
      return await this.prisma.feeStructure.create({
        data: {
          schoolId,
          academicYearId: dto.academicYearId,
          classId: dto.classId,
          name: dto.name,
          amount: dto.amount,
        },
        include: { class: true, academicYear: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A fee with this name already exists for this scope");
      }
      throw error;
    }
  }
}
