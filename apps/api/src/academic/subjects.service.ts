import { ConflictException, Injectable } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateSubjectDto } from "./dto/create-subject.dto";

@Injectable()
export class SubjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
  ) {}

  async list(actor: AuthenticatedUser, schoolId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    return this.prisma.subject.findMany({ where: { schoolId }, orderBy: { name: "asc" } });
  }

  async create(actor: AuthenticatedUser, schoolId: string, dto: CreateSubjectDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    try {
      return await this.prisma.subject.create({
        data: { schoolId, name: dto.name, code: dto.code },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A subject with this name already exists in this school");
      }
      throw error;
    }
  }
}
