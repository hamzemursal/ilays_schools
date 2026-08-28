import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { StudentsService } from "../students/students.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { MarkAttendanceDto } from "./dto/mark-attendance.dto";

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly students: StudentsService,
  ) {}

  // A teacher (identified by a Teacher profile linked to this actor) may
  // only touch a section they hold a TeacherAssignment for. A School/Super
  // Admin has no Teacher profile, so this check is a no-op for them beyond
  // the ordinary school-access check — this is the Phase 6 gate.
  private async assertCanAccessSection(actor: AuthenticatedUser, schoolId: string, sectionId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const teacher = await this.prisma.teacher.findFirst({ where: { userId: actor.id, schoolId } });
    if (teacher) {
      const hasAssignment = await this.prisma.teacherAssignment.findFirst({
        where: { teacherId: teacher.id, sectionId },
      });
      if (!hasAssignment) {
        throw new ForbiddenException("You are not assigned to this section");
      }
    }
  }

  private async getSectionInSchoolOrThrow(schoolId: string, sectionId: string) {
    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, class: { division: { schoolId } } },
    });
    if (!section) throw new NotFoundException("Section not found in this school");
    return section;
  }

  async getForSectionAndDate(actor: AuthenticatedUser, schoolId: string, sectionId: string, date: string) {
    await this.assertCanAccessSection(actor, schoolId, sectionId);
    await this.getSectionInSchoolOrThrow(schoolId, sectionId);

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: { sectionId, status: "ACTIVE" },
      include: { student: true, attendances: { where: { date: new Date(date) } } },
      orderBy: { rollNumber: "asc" },
    });

    return enrollments.map((e) => ({
      enrollmentId: e.id,
      studentId: e.studentId,
      firstName: e.student.firstName,
      lastName: e.student.lastName,
      rollNumber: e.rollNumber,
      status: e.attendances[0]?.status ?? null,
      note: e.attendances[0]?.note ?? null,
    }));
  }

  async mark(actor: AuthenticatedUser, schoolId: string, sectionId: string, dto: MarkAttendanceDto) {
    await this.assertCanAccessSection(actor, schoolId, sectionId);
    await this.getSectionInSchoolOrThrow(schoolId, sectionId);

    const enrollmentIds = dto.entries.map((e) => e.enrollmentId);
    const validEnrollments = await this.prisma.studentEnrollment.findMany({
      where: { id: { in: enrollmentIds }, sectionId, status: "ACTIVE" },
      select: { id: true },
    });
    const validIds = new Set(validEnrollments.map((e) => e.id));
    const invalid = enrollmentIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      throw new BadRequestException(`These enrollments aren't active in this section: ${invalid.join(", ")}`);
    }

    const date = new Date(dto.date);

    await this.prisma.$transaction(
      dto.entries.map((e) =>
        this.prisma.attendance.upsert({
          where: { enrollmentId_date: { enrollmentId: e.enrollmentId, date } },
          update: { status: e.status, note: e.note, markedByUserId: actor.id },
          create: {
            enrollmentId: e.enrollmentId,
            date,
            status: e.status,
            note: e.note,
            markedByUserId: actor.id,
          },
        }),
      ),
    );

    return this.getForSectionAndDate(actor, schoolId, sectionId, dto.date);
  }

  async historyForStudent(actor: AuthenticatedUser, studentId: string) {
    await this.students.assertAccessibleStudent(actor, studentId);

    return this.prisma.attendance.findMany({
      where: {
        enrollment: {
          studentId,
          ...(actor.schoolIds.length > 0 ? { schoolId: { in: actor.schoolIds } } : {}),
        },
      },
      include: { enrollment: { include: { school: true, class: true, section: true } } },
      orderBy: { date: "desc" },
    });
  }
}
