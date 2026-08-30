import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateSubjectDto } from "./dto/create-subject.dto";
import { UpdateSubjectDto } from "./dto/update-subject.dto";

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

  async update(actor: AuthenticatedUser, schoolId: string, subjectId: string, dto: UpdateSubjectDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const subject = await this.prisma.subject.findFirst({ where: { id: subjectId, schoolId } });
    if (!subject) throw new NotFoundException("Subject not found in this school");

    try {
      return await this.prisma.subject.update({
        where: { id: subjectId },
        data: { name: dto.name, code: dto.code },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A subject with this name already exists in this school");
      }
      throw error;
    }
  }

  // A Subject cascades onto ExamSubject/Result and TeacherAssignment at the
  // database level, so deleting one carelessly could silently wipe out real
  // grade history or an active assignment. Blocking on those (and on
  // ClassSubject, so the admin explicitly unassigns it from every class
  // first) makes deletion only possible for a subject nothing depends on yet.
  async remove(actor: AuthenticatedUser, schoolId: string, subjectId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const subject = await this.prisma.subject.findFirst({ where: { id: subjectId, schoolId } });
    if (!subject) throw new NotFoundException("Subject not found in this school");

    const [examSubjectCount, assignmentCount, classSubjectCount] = await Promise.all([
      this.prisma.examSubject.count({ where: { subjectId } }),
      this.prisma.teacherAssignment.count({ where: { subjectId } }),
      this.prisma.classSubject.count({ where: { subjectId } }),
    ]);

    if (examSubjectCount > 0) {
      throw new BadRequestException(
        `Cannot delete — this subject is used in ${examSubjectCount} exam(s). Remove it from those exams first.`,
      );
    }
    if (assignmentCount > 0) {
      throw new BadRequestException(
        `Cannot delete — ${assignmentCount} teacher assignment(s) reference this subject. Remove those assignments first.`,
      );
    }
    if (classSubjectCount > 0) {
      throw new BadRequestException(
        `Cannot delete — this subject is assigned to ${classSubjectCount} class(es). Unassign it from those classes first.`,
      );
    }

    await this.prisma.subject.delete({ where: { id: subjectId } });
    return { success: true };
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
