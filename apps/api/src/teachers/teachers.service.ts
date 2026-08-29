import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes, createHash } from "node:crypto";
import { Prisma } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { GuardiansService } from "../guardians/guardians.service";
import { DocumentsService } from "../documents/documents.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateTeacherDto } from "./dto/create-teacher.dto";
import { CreateTeacherAssignmentInputDto } from "./dto/create-teacher-assignment-input.dto";
import { UpdateTeacherDto } from "./dto/update-teacher.dto";
import { UpdateMyTeacherProfileDto } from "./dto/update-my-teacher-profile.dto";

const ASSIGNMENT_INCLUDE = {
  subject: true,
  section: { include: { class: true } },
  academicYear: true,
} as const;

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

@Injectable()
export class TeachersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly guardians: GuardiansService,
    private readonly documents: DocumentsService,
  ) {}

  // "My own classes" — no permission gate beyond authentication, same as
  // /auth/me: this is a teacher looking at their own assignments, not a
  // school-scoped admin action.
  async myAssignments(actor: AuthenticatedUser) {
    const teacher = await this.prisma.teacher.findFirst({ where: { userId: actor.id } });
    if (!teacher) return [];

    return this.prisma.teacherAssignment.findMany({
      where: { teacherId: teacher.id },
      include: ASSIGNMENT_INCLUDE,
      orderBy: { createdAt: "asc" },
    });
  }

  // The teacher's own profile — same no-extra-permission idiom as
  // myAssignments above. Returns null (not a 404) if this account has no
  // linked Teacher profile, so the frontend can render "not a teacher"
  // instead of treating it as an error.
  async myProfile(actor: AuthenticatedUser) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { userId: actor.id },
      include: { assignments: { include: ASSIGNMENT_INCLUDE, orderBy: { createdAt: "asc" } } },
    });
    return teacher;
  }

  async updateMyProfile(actor: AuthenticatedUser, dto: UpdateMyTeacherProfileDto) {
    const teacher = await this.prisma.teacher.findFirst({ where: { userId: actor.id } });
    if (!teacher) throw new NotFoundException("No teacher profile linked to this account");

    return this.prisma.teacher.update({
      where: { id: teacher.id },
      data: {
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        emergencyContactName: dto.emergencyContactName,
        emergencyContactPhone: dto.emergencyContactPhone,
      },
      include: { assignments: { include: ASSIGNMENT_INCLUDE } },
    });
  }

  // Every student currently active in one of the caller's own
  // TeacherAssignment sections — the authorization *is* the lookup: an
  // assignment row that isn't the caller's own is simply never found.
  async myAssignmentStudents(actor: AuthenticatedUser, assignmentId: string) {
    const teacher = await this.prisma.teacher.findFirst({ where: { userId: actor.id } });
    if (!teacher) throw new ForbiddenException("No teacher profile linked to this account");

    const assignment = await this.prisma.teacherAssignment.findFirst({
      where: { id: assignmentId, teacherId: teacher.id },
      include: ASSIGNMENT_INCLUDE,
    });
    if (!assignment) throw new NotFoundException("Assignment not found");

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: { sectionId: assignment.sectionId, academicYearId: assignment.academicYearId, status: "ACTIVE" },
      include: { student: true },
      orderBy: { rollNumber: "asc" },
    });

    const students = await Promise.all(
      enrollments.map(async (e) => {
        const [attendanceCounts, guardianList, photoUrl] = await Promise.all([
          this.prisma.attendance.groupBy({ by: ["status"], where: { enrollmentId: e.id }, _count: true }),
          this.guardians.listForStudent(e.studentId),
          this.documents.tryGetPhotoUrl("STUDENT", e.studentId),
        ]);

        const attendanceSummary = { present: 0, absent: 0, late: 0, excused: 0 };
        for (const row of attendanceCounts) {
          if (row.status === "PRESENT") attendanceSummary.present = row._count;
          else if (row.status === "ABSENT") attendanceSummary.absent = row._count;
          else if (row.status === "LATE") attendanceSummary.late = row._count;
          else if (row.status === "EXCUSED") attendanceSummary.excused = row._count;
        }

        return {
          enrollmentId: e.id,
          studentId: e.studentId,
          firstName: e.student.firstName,
          lastName: e.student.lastName,
          sex: e.student.sex,
          dateOfBirth: e.student.dateOfBirth,
          studentStatus: e.student.currentStatus,
          studentNumber: e.studentNumber,
          rollNumber: e.rollNumber,
          photoUrl,
          attendanceSummary,
          guardians: guardianList,
        };
      }),
    );

    return { assignment, students };
  }

  async listForSchool(actor: AuthenticatedUser, schoolId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    return this.prisma.teacher.findMany({
      where: { schoolId },
      include: { assignments: { include: ASSIGNMENT_INCLUDE } },
      orderBy: { lastName: "asc" },
    });
  }

  async getOne(actor: AuthenticatedUser, schoolId: string, teacherId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const teacher = await this.prisma.teacher.findFirst({
      where: { id: teacherId, schoolId },
      include: { assignments: { include: ASSIGNMENT_INCLUDE } },
    });
    if (!teacher) throw new NotFoundException("Teacher not found in this school");
    return teacher;
  }

  async update(actor: AuthenticatedUser, schoolId: string, teacherId: string, dto: UpdateTeacherDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const teacher = await this.prisma.teacher.findFirst({ where: { id: teacherId, schoolId } });
    if (!teacher) throw new NotFoundException("Teacher not found in this school");

    const updated = await this.prisma.teacher.update({
      where: { id: teacherId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        sex: dto.sex,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        qualification: dto.qualification,
        specialization: dto.specialization,
        employmentDate: dto.employmentDate ? new Date(dto.employmentDate) : undefined,
        status: dto.status,
        emergencyContactName: dto.emergencyContactName,
        emergencyContactPhone: dto.emergencyContactPhone,
      },
      include: { assignments: { include: ASSIGNMENT_INCLUDE } },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        schoolId,
        actorUserId: actor.id,
        action: "teacher.update",
        resource: "Teacher",
        resourceId: teacherId,
        after: { ...dto },
      },
    });

    return updated;
  }

  async create(actor: AuthenticatedUser, schoolId: string, dto: CreateTeacherDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    for (const a of dto.assignments ?? []) {
      await this.assertAssignmentBelongsToSchool(schoolId, a);
    }

    const employeeNumber = dto.employeeNumber ?? (await this.generateEmployeeNumber(schoolId));

    try {
      return await this.prisma.$transaction(async (tx) => {
        const teacher = await tx.teacher.create({
          data: {
            schoolId,
            firstName: dto.firstName,
            lastName: dto.lastName,
            employeeNumber,
            phone: dto.phone,
            email: dto.email,
            qualification: dto.qualification,
          },
        });

        for (const a of dto.assignments ?? []) {
          await tx.teacherAssignment.create({
            data: {
              teacherId: teacher.id,
              schoolId,
              academicYearId: a.academicYearId,
              sectionId: a.sectionId,
              subjectId: a.subjectId,
            },
          });
        }

        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            schoolId,
            actorUserId: actor.id,
            action: "teacher.create",
            resource: "Teacher",
            resourceId: teacher.id,
            after: { firstName: teacher.firstName, lastName: teacher.lastName, employeeNumber: teacher.employeeNumber },
          },
        });

        return tx.teacher.findUniqueOrThrow({
          where: { id: teacher.id },
          include: { assignments: { include: { subject: true, section: true } } },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A teacher with this employee number already exists in this school");
      }
      throw error;
    }
  }

  async addAssignment(actor: AuthenticatedUser, schoolId: string, teacherId: string, dto: CreateTeacherAssignmentInputDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const teacher = await this.prisma.teacher.findFirst({ where: { id: teacherId, schoolId } });
    if (!teacher) throw new NotFoundException("Teacher not found in this school");

    await this.assertAssignmentBelongsToSchool(schoolId, dto);

    try {
      return await this.prisma.teacherAssignment.create({
        data: {
          teacherId,
          schoolId,
          academicYearId: dto.academicYearId,
          sectionId: dto.sectionId,
          subjectId: dto.subjectId,
        },
        include: { subject: true, section: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("This teacher is already assigned to that section/subject/year");
      }
      throw error;
    }
  }

  // Grants an existing Teacher profile a login — deferred from Phase 4,
  // needed now so a teacher can actually authenticate to mark attendance
  // and enter marks scoped to their own TeacherAssignments.
  async inviteLogin(actor: AuthenticatedUser, schoolId: string, teacherId: string, email?: string) {
    const school = await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const teacher = await this.prisma.teacher.findFirst({ where: { id: teacherId, schoolId } });
    if (!teacher) throw new NotFoundException("Teacher not found in this school");
    if (teacher.userId) throw new ConflictException("This teacher already has a login");

    const targetEmail = email ?? teacher.email;
    if (!targetEmail) {
      throw new BadRequestException("This teacher has no email on file — provide one to send the invite");
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email: targetEmail } });
    if (existingUser?.status === "ACTIVE") {
      throw new ConflictException("A user with this email already has an active account");
    }

    const role = await this.prisma.role.findUniqueOrThrow({ where: { name: "TEACHER" } });

    const rawToken = randomBytes(32).toString("hex");

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { email: targetEmail },
        update: {},
        create: { email: targetEmail, organizationId: school.organizationId, status: "PENDING_SETUP" },
      });

      await tx.teacher.update({ where: { id: teacher.id }, data: { userId: user.id, email: targetEmail } });

      await tx.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id },
      });

      await tx.userSchool.upsert({
        where: { userId_schoolId: { userId: user.id, schoolId } },
        update: {},
        create: { userId: user.id, schoolId },
      });

      await tx.invitation.create({
        data: {
          organizationId: school.organizationId,
          schoolId,
          roleId: role.id,
          userId: user.id,
          invitedByUserId: actor.id,
          tokenHash: hashToken(rawToken),
          expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: school.organizationId,
          schoolId,
          actorUserId: actor.id,
          action: "teacher_login.invite",
          resource: "Teacher",
          resourceId: teacher.id,
          after: { email: targetEmail },
        },
      });

      return user;
    });

    const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3010";
    return { email: result.email, acceptUrl: `${webOrigin}/accept-invite?token=${rawToken}` };
  }

  // Format: EMP-{sequence within this school}, e.g. "EMP-00006". Scoped per
  // school, same padding convention as StudentsService.generateStudentNumber.
  private async generateEmployeeNumber(schoolId: string): Promise<string> {
    const count = await this.prisma.teacher.count({ where: { schoolId } });
    const sequence = String(count + 1).padStart(5, "0");
    return `EMP-${sequence}`;
  }

  private async assertAssignmentBelongsToSchool(schoolId: string, a: CreateTeacherAssignmentInputDto) {
    const section = await this.prisma.section.findFirst({
      where: { id: a.sectionId, class: { division: { schoolId } } },
    });
    if (!section) throw new BadRequestException("That section does not belong to this school");

    const subject = await this.prisma.subject.findFirst({ where: { id: a.subjectId, schoolId } });
    if (!subject) throw new BadRequestException("That subject does not belong to this school");

    const academicYear = await this.prisma.academicYear.findFirst({ where: { id: a.academicYearId, schoolId } });
    if (!academicYear) throw new BadRequestException("That academic year does not belong to this school");
  }
}
