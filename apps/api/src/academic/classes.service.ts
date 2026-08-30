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

  async list(actor: AuthenticatedUser, schoolId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    return this.prisma.class.findMany({
      where: { division: { schoolId } },
      include: {
        division: true,
        sections: { include: { _count: { select: { enrollments: { where: { status: "ACTIVE" } } } } } },
        _count: { select: { classSubjects: true } },
      },
      orderBy: [{ division: { type: "asc" } }, { level: "asc" }],
    });
  }

  async create(actor: AuthenticatedUser, schoolId: string, dto: CreateClassDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const division = await this.prisma.division.findFirst({ where: { id: dto.divisionId, schoolId } });
    if (!division) throw new BadRequestException("That division does not belong to this school");

    try {
      return await this.prisma.class.create({
        data: { divisionId: dto.divisionId, name: dto.name, level: dto.level },
        include: {
          division: true,
          sections: { include: { _count: { select: { enrollments: { where: { status: "ACTIVE" } } } } } },
          _count: { select: { classSubjects: true } },
        },
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

  async listSections(actor: AuthenticatedUser, schoolId: string, classId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    await this.getClassInSchoolOrThrow(schoolId, classId);
    return this.prisma.section.findMany({
      where: { classId },
      include: { _count: { select: { enrollments: { where: { status: "ACTIVE" } } } } },
      orderBy: { name: "asc" },
    });
  }

  async createSection(actor: AuthenticatedUser, schoolId: string, classId: string, dto: CreateSectionDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    await this.getClassInSchoolOrThrow(schoolId, classId);

    try {
      return await this.prisma.section.create({
        data: { classId, name: dto.name, capacity: dto.capacity },
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

    const activeCount = await this.prisma.studentEnrollment.count({
      where: { sectionId, status: "ACTIVE" },
    });
    if (dto.capacity < activeCount) {
      throw new BadRequestException(
        `Capacity can't be set below the ${activeCount} student(s) currently enrolled`,
      );
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
