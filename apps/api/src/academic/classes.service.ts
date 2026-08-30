import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateClassDto } from "./dto/create-class.dto";
import { CreateSectionDto } from "./dto/create-section.dto";
import { UpdateSectionDto } from "./dto/update-section.dto";
import { AssignSubjectDto } from "./dto/assign-subject.dto";

@Injectable()
export class ClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
  ) {}

  // Class/Section are permanent structures reused every year (see schema
  // comments) — academicYearId here only narrows the *enrollment count*
  // shown per section to one year's roster, never which classes/sections
  // exist at all.
  async list(actor: AuthenticatedUser, schoolId: string, academicYearId?: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    return this.prisma.class.findMany({
      where: { division: { schoolId } },
      include: {
        division: true,
        sections: {
          include: {
            _count: { select: { enrollments: { where: { status: "ACTIVE", ...(academicYearId ? { academicYearId } : {}) } } } },
          },
        },
        _count: { select: { classSubjects: true } },
      },
      orderBy: [{ division: { type: "asc" } }, { level: "asc" }],
    });
  }

  // Creates a class, optionally in one shot with its sections and subject
  // links — the Create Class wizard's "one workflow" — all inside a single
  // transaction so a partial failure never leaves an orphaned class with no
  // sections/subjects. Sections/subjectIds are optional so the existing
  // bare "just create a class" callers keep working unchanged.
  async create(actor: AuthenticatedUser, schoolId: string, dto: CreateClassDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const division = await this.prisma.division.findFirst({ where: { id: dto.divisionId, schoolId } });
    if (!division) throw new BadRequestException("That division does not belong to this school");

    const sectionNames = new Set<string>();
    for (const s of dto.sections ?? []) {
      const key = s.name.trim().toLowerCase();
      if (sectionNames.has(key)) throw new BadRequestException(`Duplicate section name: ${s.name}`);
      sectionNames.add(key);
    }

    if (dto.subjectIds && dto.subjectIds.length > 0) {
      const validSubjects = await this.prisma.subject.count({ where: { id: { in: dto.subjectIds }, schoolId } });
      if (validSubjects !== dto.subjectIds.length) {
        throw new BadRequestException("One or more selected subjects do not belong to this school");
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const cls = await tx.class.create({
          data: { divisionId: dto.divisionId, name: dto.name, level: dto.level },
        });

        for (const s of dto.sections ?? []) {
          await tx.section.create({ data: { classId: cls.id, name: s.name, capacity: s.capacity ?? null } });
        }

        for (const subjectId of dto.subjectIds ?? []) {
          await tx.classSubject.create({ data: { classId: cls.id, subjectId } });
        }

        return tx.class.findUniqueOrThrow({
          where: { id: cls.id },
          include: {
            division: true,
            sections: { include: { _count: { select: { enrollments: { where: { status: "ACTIVE" } } } } } },
            _count: { select: { classSubjects: true } },
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A class with this level already exists in this division");
      }
      throw error;
    }
  }

  private async getClassInSchoolOrThrow(schoolId: string, classId: string) {
    const cls = await this.prisma.class.findFirst({ where: { id: classId, division: { schoolId } } });
    if (!cls) throw new NotFoundException("Class not found in this school");
    return cls;
  }

  async listSections(actor: AuthenticatedUser, schoolId: string, classId: string, academicYearId?: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    await this.getClassInSchoolOrThrow(schoolId, classId);
    return this.prisma.section.findMany({
      where: { classId },
      include: {
        _count: { select: { enrollments: { where: { status: "ACTIVE", ...(academicYearId ? { academicYearId } : {}) } } } },
      },
      orderBy: { name: "asc" },
    });
  }

  async createSection(actor: AuthenticatedUser, schoolId: string, classId: string, dto: CreateSectionDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    await this.getClassInSchoolOrThrow(schoolId, classId);

    try {
      return await this.prisma.section.create({
        data: { classId, name: dto.name, capacity: dto.capacity ?? null },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A section with this name already exists in this class");
      }
      throw error;
    }
  }

  async updateSectionCapacity(
    actor: AuthenticatedUser,
    schoolId: string,
    classId: string,
    sectionId: string,
    dto: UpdateSectionDto,
  ) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    await this.getClassInSchoolOrThrow(schoolId, classId);

    const section = await this.prisma.section.findFirst({ where: { id: sectionId, classId } });
    if (!section) throw new NotFoundException("Section not found in this class");

    // null (unlimited) never conflicts with the current roster, so the
    // below-active-count guard only applies when setting a real number.
    if (dto.capacity !== null && dto.capacity !== undefined) {
      const activeCount = await this.prisma.studentEnrollment.count({
        where: { sectionId, status: "ACTIVE" },
      });
      if (dto.capacity < activeCount) {
        throw new BadRequestException(
          `Capacity can't be set below the ${activeCount} student(s) currently enrolled`,
        );
      }
    }

    return this.prisma.section.update({ where: { id: sectionId }, data: { capacity: dto.capacity } });
  }

  async listSubjects(actor: AuthenticatedUser, schoolId: string, classId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    await this.getClassInSchoolOrThrow(schoolId, classId);
    return this.prisma.classSubject.findMany({ where: { classId }, include: { subject: true } });
  }

  // Read-only lookup of who already teaches a section's subjects for a given
  // year — backs the student wizard's "teachers you'll have" preview, which
  // is purely informational: a student is never assigned a teacher directly,
  // only implied through TeacherAssignment (teacher + section + subject).
  async listSectionTeacherAssignments(
    actor: AuthenticatedUser,
    schoolId: string,
    classId: string,
    sectionId: string,
    academicYearId: string,
  ) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    await this.getClassInSchoolOrThrow(schoolId, classId);
    const section = await this.prisma.section.findFirst({ where: { id: sectionId, classId } });
    if (!section) throw new NotFoundException("Section not found in this class");

    return this.prisma.teacherAssignment.findMany({
      where: { sectionId, academicYearId },
      include: { subject: true, teacher: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { subject: { name: "asc" } },
    });
  }

  async assignSubject(actor: AuthenticatedUser, schoolId: string, classId: string, dto: AssignSubjectDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    await this.getClassInSchoolOrThrow(schoolId, classId);

    const subject = await this.prisma.subject.findFirst({ where: { id: dto.subjectId, schoolId } });
    if (!subject) throw new BadRequestException("That subject does not belong to this school");

    return this.prisma.classSubject.upsert({
      where: { classId_subjectId: { classId, subjectId: dto.subjectId } },
      update: {},
      create: { classId, subjectId: dto.subjectId },
      include: { subject: true },
    });
  }

  async unassignSubject(actor: AuthenticatedUser, schoolId: string, classId: string, subjectId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    await this.getClassInSchoolOrThrow(schoolId, classId);

    await this.prisma.classSubject.deleteMany({ where: { classId, subjectId } });
    return { success: true };
  }
}
