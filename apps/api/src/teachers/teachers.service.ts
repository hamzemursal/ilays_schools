import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes, createHash } from "node:crypto";
import { Prisma } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { GuardiansService } from "../guardians/guardians.service";
import { DocumentsService } from "../documents/documents.service";
import { StorageService } from "../storage/storage.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction, AuditModuleName } from "../audit/audit-actions";
import { createWithSequentialCode } from "../common/sequential-code.util";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateTeacherDto } from "./dto/create-teacher.dto";
import { CreateTeacherAssignmentInputDto } from "./dto/create-teacher-assignment-input.dto";
import { UpdateTeacherDto } from "./dto/update-teacher.dto";
import { UpdateMyTeacherProfileDto } from "./dto/update-my-teacher-profile.dto";

// Includes the school a given assignment is actually AT — never assume
// that's the same as the teacher's own home school (Teacher.schoolId);
// TeacherAssignment.school is what the Teacher Portal's multi-school
// grouping is built from.
const ASSIGNMENT_INCLUDE = {
  subject: true,
  section: { include: { class: true } },
  academicYear: true,
  school: { select: { id: true, name: true, type: true } },
} as const;

// Organization-wide reach — Super Admin / Organization Admin — decided the
// exact same way SchoolsService.accessibleWhere already decides "sees
// every school in the org": no specific schoolIds means not limited to any.
// This is the one place that decision is made for teacher-assignment
// visibility; every admin-facing read below goes through it.
function isOrgWide(actor: AuthenticatedUser): boolean {
  return actor.schoolIds.length === 0;
}

// user.status lets the frontend tell "no login yet" (userId null) apart
// from "invited but never finished setup" (PENDING_SETUP — Resend invite
// makes sense) from "already logged in at least once" (ACTIVE — nothing to
// resend).
//
// `assignments` is scoped to what `actor` is actually authorized to see: an
// org-wide actor gets every assignment this teacher holds, anywhere in the
// organization (the Super Admin "Assigned Schools" switcher depends on
// this); a school-scoped actor (a School Admin) only ever gets this one
// school's assignments back, regardless of how many other schools this
// teacher also works at. This is enforced here, in the query itself — never
// left for the frontend to filter or hide after the fact.
function teacherInclude(actor: AuthenticatedUser, schoolId: string) {
  return {
    assignments: { where: isOrgWide(actor) ? undefined : { schoolId }, include: ASSIGNMENT_INCLUDE },
    user: { select: { status: true } },
  };
}

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
    private readonly storage: StorageService,
    private readonly audit: AuditService,
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
          this.guardians.listForStudent(actor, e.studentId),
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

  // A teacher shows up here either because this is their home school
  // (Teacher.schoolId) or because they hold at least one TeacherAssignment
  // at this school despite being employed elsewhere — otherwise a teacher
  // just cross-school-assigned here (see addAssignment) would vanish from
  // the very school admin who assigned them.
  async listForSchool(actor: AuthenticatedUser, schoolId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    return this.prisma.teacher.findMany({
      where: { OR: [{ schoolId }, { assignments: { some: { schoolId } } }] },
      include: teacherInclude(actor, schoolId),
      orderBy: { lastName: "asc" },
    });
  }

  // Backs "assign an existing teacher to also teach at this school" — a
  // teacher's Teacher row lives at one home school, so an admin at a
  // DIFFERENT school needs a way to find that existing person (by name,
  // employee number, or email) before calling addAssignment, rather than
  // ever creating a second Teacher record for someone who already has one.
  // Scoped to the organization, not to `schoolId` — that's the whole point.
  async searchAcrossOrg(actor: AuthenticatedUser, schoolId: string, query: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    if (query.trim().length < 2) return [];

    return this.prisma.teacher.findMany({
      where: {
        status: "ACTIVE",
        school: { organizationId: actor.organizationId! },
        OR: [
          { firstName: { contains: query, mode: "insensitive" } },
          { lastName: { contains: query, mode: "insensitive" } },
          { employeeNumber: { contains: query, mode: "insensitive" } },
          { teacherCode: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeNumber: true,
        teacherCode: true,
        email: true,
        phone: true,
        school: { select: { id: true, name: true, type: true } },
      },
      take: 10,
      orderBy: { lastName: "asc" },
    });
  }

  // Same home-school-OR-cross-school-assignment reach as listForSchool —
  // an admin who just assigned an existing teacher here must be able to
  // open that teacher's own detail page, not hit a 404.
  async getOne(actor: AuthenticatedUser, schoolId: string, teacherId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const teacher = await this.prisma.teacher.findFirst({
      where: { id: teacherId, OR: [{ schoolId }, { assignments: { some: { schoolId } } }] },
      include: teacherInclude(actor, schoolId),
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
      include: teacherInclude(actor, schoolId),
    });

    await this.audit.record({
      actor,
      organizationId: actor.organizationId,
      schoolId,
      action: AuditAction.TEACHER_UPDATED,
      module: AuditModuleName.TEACHERS,
      resourceType: "Teacher",
      resourceId: teacherId,
      resourceName: `${updated.firstName} ${updated.lastName}`,
      after: { ...dto },
    });

    return updated;
  }

  // Genuine permanent deletion. TeacherAssignment rows cascade automatically
  // once the Teacher row is deleted — the only manual cleanup needed is the
  // linked login account (if any) and this teacher's photo/document files,
  // neither of which Postgres would clean up on its own (User is a separate
  // aggregate; MediaFile.ownerId isn't a real FK at all).
  async remove(actor: AuthenticatedUser, schoolId: string, teacherId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const teacher = await this.prisma.teacher.findFirst({ where: { id: teacherId, schoolId } });
    if (!teacher) throw new NotFoundException("Teacher not found in this school");

    const mediaFiles = await this.prisma.$transaction(async (tx) => {
      const files = await tx.mediaFile.findMany({ where: { ownerType: "TEACHER", ownerId: teacherId } });
      await tx.mediaFile.deleteMany({ where: { ownerType: "TEACHER", ownerId: teacherId } });

      await tx.teacher.delete({ where: { id: teacherId } });

      if (teacher.userId) {
        await tx.user.delete({ where: { id: teacher.userId } });
      }

      await this.audit.record(
        {
          actor,
          organizationId: actor.organizationId,
          schoolId,
          action: AuditAction.TEACHER_DELETED,
          module: AuditModuleName.TEACHERS,
          resourceType: "Teacher",
          resourceId: teacherId,
          resourceName: `${teacher.firstName} ${teacher.lastName}`,
          severity: "WARNING",
          before: { firstName: teacher.firstName, lastName: teacher.lastName, employeeNumber: teacher.employeeNumber },
        },
        tx,
      );

      return files;
    }, { timeout: 30_000 });

    await Promise.all(mediaFiles.map((f) => this.storage.delete(f.storageKey, f.mimeType).catch(() => undefined)));

    return { success: true };
  }

  async create(actor: AuthenticatedUser, schoolId: string, dto: CreateTeacherDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    for (const a of dto.assignments ?? []) {
      await this.assertAssignmentBelongsToSchool(schoolId, a);
    }

    const assignmentKeys = new Set<string>();
    for (const a of dto.assignments ?? []) {
      const key = `${a.academicYearId}|${a.sectionId}|${a.subjectId}`;
      if (assignmentKeys.has(key)) {
        throw new BadRequestException("The same subject can't be assigned to the same class/section twice");
      }
      assignmentKeys.add(key);
    }

    const employeeNumber = dto.employeeNumber ?? (await this.generateEmployeeNumber(schoolId));

    try {
      return await createWithSequentialCode(
        () => this.prisma.teacher.count(),
        "TCH",
        "teacherCode",
        (teacherCode) =>
          this.prisma.$transaction(async (tx) => {
            const teacher = await tx.teacher.create({
              data: {
                schoolId,
                firstName: dto.firstName,
                lastName: dto.lastName,
                employeeNumber,
                teacherCode,
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

            await this.audit.record(
              {
                actor,
                organizationId: actor.organizationId,
                schoolId,
                action: AuditAction.TEACHER_CREATED,
                module: AuditModuleName.TEACHERS,
                resourceType: "Teacher",
                resourceId: teacher.id,
                resourceName: `${teacher.firstName} ${teacher.lastName}`,
                after: {
                  firstName: teacher.firstName,
                  lastName: teacher.lastName,
                  employeeNumber: teacher.employeeNumber,
                  teacherCode: teacher.teacherCode,
                },
              },
              tx,
            );

            return tx.teacher.findUniqueOrThrow({
              where: { id: teacher.id },
              include: teacherInclude(actor, schoolId),
            });
          }, { timeout: 30_000 }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A teacher with this employee number already exists in this school");
      }
      throw error;
    }
  }

  // A teacher may be assigned to teach at a DIFFERENT school than the one
  // that employs them (Teacher.schoolId is just their home/employment
  // record) — so this deliberately looks the teacher up across the whole
  // organization, not scoped to `schoolId`, then relies on
  // assertAssignmentBelongsToSchool to guarantee the assignment itself
  // (section/subject/year) genuinely belongs to `schoolId`. Cross-organization
  // is still impossible: the lookup is scoped by `school.organizationId`.
  async addAssignment(actor: AuthenticatedUser, schoolId: string, teacherId: string, dto: CreateTeacherAssignmentInputDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const teacher = await this.prisma.teacher.findFirst({
      where: { id: teacherId, school: { organizationId: actor.organizationId! } },
    });
    if (!teacher) throw new NotFoundException("Teacher not found in your organization");

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
        include: ASSIGNMENT_INCLUDE,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("This teacher is already assigned to that section/subject/year");
      }
      throw error;
    }
  }

  // Same cross-school-same-org lookup as addAssignment (a teacher's home
  // school and the school removing their assignment here can differ) —
  // but the assignment lookup itself now explicitly checks schoolId too,
  // which the old same-school teacher check made redundant; without it,
  // relaxing the teacher lookup would let this school's admin delete an
  // assignment that's actually at some OTHER school this teacher teaches at.
  async removeAssignment(actor: AuthenticatedUser, schoolId: string, teacherId: string, assignmentId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const teacher = await this.prisma.teacher.findFirst({
      where: { id: teacherId, school: { organizationId: actor.organizationId! } },
    });
    if (!teacher) throw new NotFoundException("Teacher not found in your organization");

    const assignment = await this.prisma.teacherAssignment.findFirst({ where: { id: assignmentId, teacherId, schoolId } });
    if (!assignment) throw new NotFoundException("Assignment not found for this teacher at this school");

    await this.prisma.teacherAssignment.delete({ where: { id: assignmentId } });
    return { success: true };
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

      await this.audit.record(
        {
          actor,
          organizationId: school.organizationId,
          schoolId,
          action: AuditAction.TEACHER_LOGIN_INVITED,
          module: AuditModuleName.TEACHERS,
          resourceType: "Teacher",
          resourceId: teacher.id,
          resourceName: `${teacher.firstName} ${teacher.lastName}`,
          after: { email: targetEmail },
        },
        tx,
      );

      return user;
    }, { timeout: 30_000 });

    const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3010";
    return { email: result.email, acceptUrl: `${webOrigin}/accept-invite?token=${rawToken}` };
  }

  // For when the original acceptUrl was never actually given to the
  // teacher (lost, not copied, never sent) — inviteLogin itself can't be
  // called again once teacher.userId is set, so this is the only way back.
  // Issues a fresh token/expiry and revokes any still-pending older
  // invitations for the same user, so a since-lost link can't resurface
  // and get used after the fact.
  async resendInvite(actor: AuthenticatedUser, schoolId: string, teacherId: string) {
    const school = await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const teacher = await this.prisma.teacher.findFirst({
      where: { id: teacherId, schoolId },
      include: { user: { select: { id: true, email: true, status: true } } },
    });
    if (!teacher) throw new NotFoundException("Teacher not found in this school");
    if (!teacher.userId || !teacher.user) {
      throw new BadRequestException("This teacher has no login yet — use Invite to log in instead");
    }
    if (teacher.user.status === "ACTIVE") {
      throw new ConflictException("This teacher has already completed their login setup");
    }

    const role = await this.prisma.role.findUniqueOrThrow({ where: { name: "TEACHER" } });
    const rawToken = randomBytes(32).toString("hex");
    const userId = teacher.userId;
    const userEmail = teacher.user.email;

    await this.prisma.$transaction(async (tx) => {
      await tx.invitation.updateMany({
        where: { userId, status: "PENDING" },
        data: { status: "REVOKED" },
      });

      await tx.invitation.create({
        data: {
          organizationId: school.organizationId,
          schoolId,
          roleId: role.id,
          userId,
          invitedByUserId: actor.id,
          tokenHash: hashToken(rawToken),
          expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        },
      });

      await this.audit.record(
        {
          actor,
          organizationId: school.organizationId,
          schoolId,
          action: AuditAction.TEACHER_LOGIN_INVITE_RESENT,
          module: AuditModuleName.TEACHERS,
          resourceType: "Teacher",
          resourceId: teacher.id,
          resourceName: `${teacher.firstName} ${teacher.lastName}`,
          after: { email: userEmail },
        },
        tx,
      );
    }, { timeout: 30_000 });

    const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3010";
    return { email: userEmail, acceptUrl: `${webOrigin}/accept-invite?token=${rawToken}` };
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
