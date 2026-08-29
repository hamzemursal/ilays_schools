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

    const code = dto.code ?? (await this.generateCode(schoolId, dto.name));

    try {
      return await this.prisma.subject.create({
        data: { schoolId, name: dto.name, code },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A subject with this name already exists in this school");
      }
      throw error;
    }
  }

  // Subject.code has no DB-level uniqueness constraint (it's an optional,
  // freeform field), so a generated code has to check for collisions itself
  // — derived from the name (e.g. "Mathematics" -> "MAT"), with a numeric
  // suffix if that prefix is already taken in this school.
  private async generateCode(schoolId: string, name: string): Promise<string> {
    const base = name.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase() || "SUB";
    let candidate = base;
    let suffix = 1;
    while (await this.prisma.subject.findFirst({ where: { schoolId, code: candidate } })) {
      suffix += 1;
      candidate = `${base}${suffix}`;
    }
    return candidate;
  }
}
