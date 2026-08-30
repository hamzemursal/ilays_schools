import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { GuardiansService } from "../guardians/guardians.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateStudentDto } from "./dto/create-student.dto";

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly guardians: GuardiansService,
  ) {}

  // A student is visible to an actor if either they're org-wide (no
  // schoolIds restriction) or at least one of the student's enrollments is
  // in a school the actor can access. This mirrors SchoolsService's scoping
  // but for a resource that isn't itself tied to one school.
  async assertAccessibleStudent(actor: AuthenticatedUser, studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { enrollments: true },
    });
    if (!student || student.organizationId !== actor.organizationId) {
      throw new NotFoundException("Student not found");
    }
    if (actor.schoolIds.length > 0) {
      const hasAccess = student.enrollments.some((e) => actor.schoolIds.includes(e.schoolId));
      if (!hasAccess) throw new NotFoundException("Student not found");
    }
    return student;
  }

  async listForSchool(actor: AuthenticatedUser, schoolId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: { schoolId, status: "ACTIVE" },
      include: { student: true, class: true, section: true },
      orderBy: [{ class: { level: "asc" } }, { section: { name: "asc" } }, { rollNumber: "asc" }],
    });

    return enrollments.map((e) => ({
      enrollmentId: e.id,
      studentId: e.studentId,
      firstName: e.student.firstName,
      lastName: e.student.lastName,
      studentNumber: e.studentNumber,
      rollNumber: e.rollNumber,
      className: e.class.name,
      sectionName: e.section.name,
    }));
  }

  async getOne(actor: AuthenticatedUser, studentId: string) {
    const student = await this.assertAccessibleStudent(actor, studentId);

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: {
        studentId,
        ...(actor.schoolIds.length > 0 ? { schoolId: { in: actor.schoolIds } } : {}),
      },
      include: { school: true, academicYear: true, class: true, section: true },
      orderBy: { startDate: "desc" },
    });

    const guardianList = await this.guardians.listForStudent(studentId);

    return { ...student, enrollments, guardians: guardianList };
  }

  async create(actor: AuthenticatedUser, schoolId: string, dto: CreateStudentDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const section = await this.prisma.section.findFirst({
      where: { id: dto.enrollment.sectionId, classId: dto.enrollment.classId, class: { division: { schoolId } } },
    });
    if (!section) throw new BadRequestException("That section does not belong to the specified class in this school");

    const academicYear = await this.prisma.academicYear.findFirst({
      where: { id: dto.enrollment.academicYearId, schoolId },
    });
    if (!academicYear) throw new BadRequestException("That academic year does not belong to this school");

    const dateOfBirth = new Date(dto.dateOfBirth);

    // Duplicate check first — before touching capacity or anything else.
    // Never auto-merge: if a close match exists and the caller hasn't
    // explicitly confirmed, hand back the candidates instead of creating.
    if (!dto.confirmDespiteDuplicates) {
      const candidates = await this.prisma.student.findMany({
        where: {
          organizationId: actor.organizationId!,
          dateOfBirth,
          lastName: { equals: dto.lastName, mode: "insensitive" },
        },
        take: 5,
      });
      if (candidates.length > 0) {
        throw new ConflictException({
          message: "Possible duplicate student(s) found — review before creating",
          possibleDuplicates: candidates,
        });
      }
    }

    // A null capacity means the section is unlimited — see Section.capacity.
    if (section.capacity !== null) {
      const activeCount = await this.prisma.studentEnrollment.count({
        where: { sectionId: section.id, status: "ACTIVE" },
      });
      if (activeCount >= section.capacity) {
        throw new BadRequestException(`Section ${section.name} is at capacity (${section.capacity})`);
      }
    }

    const studentNumber =
      dto.enrollment.studentNumber ??
      (await this.generateStudentNumber(schoolId, academicYear.id, academicYear.name));
    const rollNumber = dto.enrollment.rollNumber ?? (await this.generateRollNumber(section.id));

    try {
      return await this.prisma.$transaction(async (tx) => {
        const student = await tx.student.create({
          data: {
            organizationId: actor.organizationId!,
            firstName: dto.firstName,
            lastName: dto.lastName,
            dateOfBirth,
            sex: dto.sex,
            legacyStudentNumber: dto.legacyStudentNumber,
          },
        });

        const enrollment = await tx.studentEnrollment.create({
          data: {
            studentId: student.id,
            organizationId: actor.organizationId!,
            schoolId,
            academicYearId: dto.enrollment.academicYearId,
            classId: dto.enrollment.classId,
            sectionId: dto.enrollment.sectionId,
            studentNumber,
            rollNumber,
          },
        });

        const linkedGuardians = [];
        for (const g of dto.guardians ?? []) {
          const guardian = await this.guardians.findOrCreate(tx, g);
          await this.guardians.linkToStudent(tx, student.id, guardian.id, g.relationship, g.isPrimaryContact);
          linkedGuardians.push(guardian);
        }

        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            schoolId,
            actorUserId: actor.id,
            action: "student.create",
            resource: "Student",
            resourceId: student.id,
            after: { firstName: student.firstName, lastName: student.lastName, studentNumber, rollNumber },
          },
        });

        return { student, enrollment, guardians: linkedGuardians };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("That roll number or student number is already in use in this school");
      }
      throw error;
    }
  }

  // Format: STU-{admitting academic year}-{sequence within that year}, e.g.
  // "STU-2027-00013". The sequence resets per (school, academic year) —
  // matching the composite unique constraint on StudentEnrollment, which is
  // already scoped the same way — rather than counting across the school's
  // whole history. Once assigned this never changes: a promoted student's
  // later-year enrollment rows carry the same studentNumber forward by
  // design (see PromotionsService), so the code always reflects the year the
  // student was originally admitted, not their current year.
  private async generateStudentNumber(
    schoolId: string,
    academicYearId: string,
    academicYearName: string,
  ): Promise<string> {
    const count = await this.prisma.studentEnrollment.count({ where: { schoolId, academicYearId } });
    const sequence = String(count + 1).padStart(5, "0");
    return `STU-${academicYearName}-${sequence}`;
  }

  private async generateRollNumber(sectionId: string): Promise<number> {
    const result = await this.prisma.studentEnrollment.aggregate({
      where: { sectionId, status: "ACTIVE" },
      _max: { rollNumber: true },
    });
    return (result._max.rollNumber ?? 0) + 1;
  }
}
