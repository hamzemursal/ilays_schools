import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import { randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { GuardiansService } from "../guardians/guardians.service";
import { StorageService } from "../storage/storage.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction, AuditModuleName } from "../audit/audit-actions";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateStudentDto } from "./dto/create-student.dto";
import { UpdateStudentDto } from "./dto/update-student.dto";
import { EnrollmentInputDto } from "./dto/enrollment-input.dto";

type Tx = Prisma.TransactionClient;

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly guardians: GuardiansService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
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

  async update(actor: AuthenticatedUser, studentId: string, dto: UpdateStudentDto) {
    await this.assertAccessibleStudent(actor, studentId);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.student.update({
          where: { id: studentId },
          data: {
            firstName: dto.firstName,
            lastName: dto.lastName,
            dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
            sex: dto.sex,
            legacyStudentNumber: dto.legacyStudentNumber,
          },
        });

        if (dto.enrollment) {
          await this.updateActiveEnrollment(tx, actor, studentId, dto.enrollment);
        }
      }, { timeout: 30_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("That roll number is already in use in the selected class, section, and year");
      }
      throw error;
    }

    return this.getFullDetail(actor, studentId);
  }

  // Corrects the CURRENT active enrollment row in place (class/section/year/
  // roll number) — deliberately distinct from Promotion/Transfer, which end
  // the old enrollment and create a new one to record a real academic
  // transition. This is just fixing a data-entry mistake, so the existing
  // row (and its startDate, studentNumber, and enrollment id used by
  // attendance/results) is preserved; only these four fields change. No-ops
  // if nothing actually changed, and never touches any other enrollment row,
  // so enrollment history stays intact either way.
  private async updateActiveEnrollment(tx: Tx, actor: AuthenticatedUser, studentId: string, input: EnrollmentInputDto) {
    const active = await tx.studentEnrollment.findFirst({ where: { studentId, status: "ACTIVE" } });
    if (!active) {
      throw new BadRequestException("This student has no active enrollment to update");
    }

    const rollNumber = input.rollNumber ?? active.rollNumber;
    const unchanged =
      active.academicYearId === input.academicYearId &&
      active.classId === input.classId &&
      active.sectionId === input.sectionId &&
      active.rollNumber === rollNumber;
    if (unchanged) return;

    const section = await tx.section.findFirst({
      where: { id: input.sectionId, classId: input.classId, class: { division: { schoolId: active.schoolId } } },
    });
    if (!section) throw new BadRequestException("That section does not belong to the specified class in this school");

    const academicYear = await tx.academicYear.findFirst({
      where: { id: input.academicYearId, schoolId: active.schoolId },
    });
    if (!academicYear) throw new BadRequestException("That academic year does not belong to this school");

    // Only re-check capacity when actually moving into a different
    // section/year — staying put (e.g. just fixing the roll number) never
    // needs it, since this enrollment already counts against that section.
    const movingSection = input.sectionId !== active.sectionId || input.academicYearId !== active.academicYearId;
    if (movingSection && section.capacity !== null) {
      const activeCount = await tx.studentEnrollment.count({
        where: { sectionId: section.id, academicYearId: input.academicYearId, status: "ACTIVE" },
      });
      if (activeCount >= section.capacity) {
        throw new BadRequestException(`Section ${section.name} is at capacity (${section.capacity})`);
      }
    }

    await tx.studentEnrollment.update({
      where: { id: active.id },
      data: {
        academicYearId: input.academicYearId,
        classId: input.classId,
        sectionId: input.sectionId,
        rollNumber,
      },
    });

    await this.audit.record(
      {
        actor,
        organizationId: actor.organizationId,
        schoolId: active.schoolId,
        action: AuditAction.STUDENT_UPDATED,
        module: AuditModuleName.STUDENTS,
        resourceType: "StudentEnrollment",
        resourceId: active.id,
        before: {
          academicYearId: active.academicYearId,
          classId: active.classId,
          sectionId: active.sectionId,
          rollNumber: active.rollNumber,
        },
        after: { academicYearId: input.academicYearId, classId: input.classId, sectionId: input.sectionId, rollNumber },
      },
      tx,
    );
  }

  // Archiving never deletes the student — it withdraws the active enrollment
  // (preserving attendance/marks history tied to it) and marks the student
  // record itself as archived, so it drops out of active rosters everywhere.
  async archive(actor: AuthenticatedUser, studentId: string) {
    const student = await this.assertAccessibleStudent(actor, studentId);

    if (student.currentStatus === "ARCHIVED") {
      throw new BadRequestException("This student is already archived");
    }

    await this.prisma.$transaction(async (tx) => {
      const activeEnrollment = await tx.studentEnrollment.findFirst({
        where: { studentId, status: "ACTIVE" },
      });

      if (activeEnrollment) {
        await tx.studentEnrollment.update({
          where: { id: activeEnrollment.id },
          data: { status: "WITHDRAWN", endDate: new Date() },
        });
      }

      await tx.student.update({
        where: { id: studentId },
        data: { currentStatus: "ARCHIVED" },
      });

      await this.audit.record(
        {
          actor,
          organizationId: actor.organizationId,
          schoolId: activeEnrollment?.schoolId,
          action: AuditAction.STUDENT_ARCHIVED,
          module: AuditModuleName.STUDENTS,
          resourceType: "Student",
          resourceId: studentId,
          resourceName: `${student.firstName} ${student.lastName}`,
          before: { currentStatus: student.currentStatus },
          after: { currentStatus: "ARCHIVED" },
        },
        tx,
      );
    }, { timeout: 30_000 });

    return this.getFullDetail(actor, studentId);
  }

  // Genuine permanent deletion — the student row and every dependent record
  // that only ever existed because of this student (enrollment history,
  // attendance, results, invoices/payments, transfers, promotion items,
  // guardian links, photos/documents) are removed for good. Unlike archive(),
  // there is no surviving row afterward. Only Restrict-guarded relations need
  // explicit cleanup here — Cascade relations (StudentGuardian, Attendance,
  // Result) are handled by Postgres itself once their parent row is deleted.
  async remove(actor: AuthenticatedUser, studentId: string) {
    const student = await this.assertAccessibleStudent(actor, studentId);

    // Explicit timeout for the same reason as SchoolsService.remove()/
    // AcademicYearsService.remove(): a per-enrollment loop of sequential
    // deletes can run past Prisma's 5s interactive-transaction default,
    // especially for a student with several past enrollments/invoices.
    const mediaFiles = await this.prisma.$transaction(async (tx) => {
      const enrollments = await tx.studentEnrollment.findMany({ where: { studentId } });

      await tx.transfer.deleteMany({ where: { studentId } });

      for (const enrollment of enrollments) {
        const invoices = await tx.invoice.findMany({ where: { enrollmentId: enrollment.id }, select: { id: true } });
        const invoiceIds = invoices.map((i) => i.id);
        if (invoiceIds.length > 0) {
          await tx.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
          await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
        }
        await tx.promotionItem.deleteMany({ where: { fromEnrollmentId: enrollment.id } });
      }

      await tx.studentEnrollment.deleteMany({ where: { studentId } });

      const files = await tx.mediaFile.findMany({ where: { ownerType: "STUDENT", ownerId: studentId } });
      await tx.mediaFile.deleteMany({ where: { ownerType: "STUDENT", ownerId: studentId } });

      await tx.student.delete({ where: { id: studentId } });

      await this.audit.record(
        {
          actor,
          organizationId: actor.organizationId,
          schoolId: enrollments[0]?.schoolId,
          action: AuditAction.STUDENT_DELETED,
          module: AuditModuleName.STUDENTS,
          resourceType: "Student",
          resourceId: studentId,
          resourceName: `${student.firstName} ${student.lastName}`,
          severity: "WARNING",
          before: { firstName: student.firstName, lastName: student.lastName, currentStatus: student.currentStatus },
        },
        tx,
      );

      return files;
    }, { timeout: 30_000 });

    await Promise.all(mediaFiles.map((f) => this.storage.delete(f.storageKey, f.mimeType).catch(() => undefined)));

    return { success: true };
  }

  async listForSchool(
    actor: AuthenticatedUser,
    schoolId: string,
    filters: { academicYearId?: string; classId?: string; sectionId?: string; search?: string } = {},
  ) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const search = filters.search?.trim();
    const searchAsRoll = search && /^\d+$/.test(search) ? Number(search) : undefined;

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: {
        schoolId,
        status: "ACTIVE",
        ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
        ...(filters.classId ? { classId: filters.classId } : {}),
        ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
        ...(search
          ? {
              OR: [
                { student: { firstName: { contains: search, mode: "insensitive" } } },
                { student: { lastName: { contains: search, mode: "insensitive" } } },
                { studentNumber: { contains: search, mode: "insensitive" } },
                ...(searchAsRoll !== undefined ? [{ rollNumber: searchAsRoll }] : []),
                // Parent/guardian name or phone — real, existing relationship
                // (StudentGuardian), not a field invented for this search.
                { student: { guardians: { some: { guardian: { firstName: { contains: search, mode: "insensitive" } } } } } },
                { student: { guardians: { some: { guardian: { lastName: { contains: search, mode: "insensitive" } } } } } },
                { student: { guardians: { some: { guardian: { phone: { contains: search } } } } } },
              ],
            }
          : {}),
      },
      include: {
        student: {
          include: {
            guardians: {
              where: { status: "ACTIVE" },
              include: { guardian: true },
              orderBy: [{ isPrimaryContact: "desc" }],
              take: 1,
            },
          },
        },
        class: true,
        section: true,
      },
      orderBy: [{ class: { level: "asc" } }, { section: { name: "asc" } }, { rollNumber: "asc" }],
    });

    return enrollments.map((e) => {
      const primaryGuardian = e.student.guardians[0]?.guardian;
      return {
        enrollmentId: e.id,
        studentId: e.studentId,
        firstName: e.student.firstName,
        lastName: e.student.lastName,
        studentNumber: e.studentNumber,
        rollNumber: e.rollNumber,
        className: e.class.name,
        sectionName: e.section.name,
        classId: e.classId,
        sectionId: e.sectionId,
        academicYearId: e.academicYearId,
        sex: e.student.sex,
        status: e.student.currentStatus,
        guardianName: primaryGuardian ? `${primaryGuardian.firstName} ${primaryGuardian.lastName}` : null,
        guardianPhone: primaryGuardian?.phone ?? null,
      };
    });
  }

  async getOne(actor: AuthenticatedUser, studentId: string) {
    await this.assertAccessibleStudent(actor, studentId);
    return this.getFullDetail(actor, studentId);
  }

  // Shared by getOne/update/archive so every mutation hands back the same
  // enrollments+guardians shape the frontend's StudentDetail expects, instead
  // of the bare Student row a plain prisma.student.update() would return.
  private async getFullDetail(actor: AuthenticatedUser, studentId: string) {
    const student = await this.prisma.student.findUniqueOrThrow({ where: { id: studentId } });

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: {
        studentId,
        ...(actor.schoolIds.length > 0 ? { schoolId: { in: actor.schoolIds } } : {}),
      },
      include: { school: true, academicYear: true, class: true, section: true },
      orderBy: { startDate: "desc" },
    });

    const guardianList = await this.guardians.listForStudent(actor, studentId);

    // Surfaced on the profile so a transferred-away enrollment's "why" isn't
    // lost once TransfersService.approve() overwrites its status to
    // TRANSFERRED_OUT — the Transfer row itself (reason, decision, route)
    // is the only place that context still lives.
    const transfers = await this.prisma.transfer.findMany({
      where: {
        studentId,
        ...(actor.schoolIds.length > 0
          ? { OR: [{ fromSchoolId: { in: actor.schoolIds } }, { toSchoolId: { in: actor.schoolIds } }] }
          : {}),
      },
      select: {
        id: true,
        status: true,
        reason: true,
        transferDate: true,
        createdAt: true,
        fromEnrollment: {
          select: {
            school: { select: { id: true, name: true } },
            class: { select: { name: true } },
            section: { select: { name: true } },
            academicYear: { select: { name: true } },
          },
        },
        toEnrollment: {
          select: {
            school: { select: { id: true, name: true } },
            class: { select: { name: true } },
            section: { select: { name: true } },
            academicYear: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return { ...student, enrollments, guardians: guardianList, transfers };
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
    //
    // History: this used to also match on lastName+DOB alone, but that was
    // reverted (commit eb52156) for too many false positives — many
    // students in the same school legitimately share a last name. This is
    // a deliberately tighter version, not a repeat of that mistake: it
    // requires the FULL name (first + last) together with DOB, which two
    // unrelated students share far less often than a surname alone. It
    // runs unconditionally (previously the check ran only when
    // legacyStudentNumber was supplied, so a student with no prior ID got
    // no check at all); legacyStudentNumber is still checked too, when
    // present, as an independent OR condition.
    if (!dto.confirmDespiteDuplicates) {
      const candidates = await this.findDuplicateCandidates(actor.organizationId!, dto, dateOfBirth);
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
    const rollNumber = dto.enrollment.rollNumber ?? (await this.generateRollNumber(section.id, academicYear.id));

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

        await this.audit.record(
          {
            actor,
            organizationId: actor.organizationId,
            schoolId,
            action: AuditAction.STUDENT_CREATED,
            module: AuditModuleName.STUDENTS,
            resourceType: "Student",
            resourceId: student.id,
            resourceName: `${student.firstName} ${student.lastName}`,
            after: { firstName: student.firstName, lastName: student.lastName, studentNumber, rollNumber },
          },
          tx,
        );

        return { student, enrollment, guardians: linkedGuardians };
      }, { timeout: 30_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("That roll number or student number is already in use in this school");
      }
      throw error;
    }
  }

  // Extracted so ImportsService can run the exact same check as a read-only
  // dry run while staging a CSV row — no ConflictException, just the
  // candidate list (empty means "no duplicate"). create() above is still
  // the only place that decides what to DO with a non-empty result.
  async findDuplicateCandidates(
    organizationId: string,
    dto: Pick<CreateStudentDto, "firstName" | "lastName" | "legacyStudentNumber">,
    dateOfBirth: Date,
  ) {
    return this.prisma.student.findMany({
      where: {
        organizationId,
        OR: [
          {
            dateOfBirth,
            firstName: { equals: dto.firstName, mode: "insensitive" },
            lastName: { equals: dto.lastName, mode: "insensitive" },
          },
          ...(dto.legacyStudentNumber
            ? [{ legacyStudentNumber: { equals: dto.legacyStudentNumber, mode: "insensitive" as const } }]
            : []),
        ],
      },
      take: 5,
    });
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

  // Scoped by academicYearId to match the roll number's actual uniqueness
  // rule (schoolId+academicYearId+classId+sectionId+rollNumber+status) and
  // the same "resets per year" behavior generateStudentNumber uses — without
  // this, a section reused across years would keep climbing instead of
  // restarting at 1 each year.
  private async generateRollNumber(sectionId: string, academicYearId: string): Promise<number> {
    const result = await this.prisma.studentEnrollment.aggregate({
      where: { sectionId, academicYearId, status: "ACTIVE" },
      _max: { rollNumber: true },
    });
    return (result._max.rollNumber ?? 0) + 1;
  }

  // Student Portal accounts exist only for SECONDARY students — never
  // PRIMARY, per product decision. The school's own School.type isn't
  // enough to decide this: a PRIMARY_AND_SECONDARY school has both
  // Divisions at once, so the only real per-student signal is which
  // Division the student's *current* class actually belongs to. This is
  // the single gate every path to a Student login must go through.
  async createPortalAccount(actor: AuthenticatedUser, studentId: string) {
    const student = await this.assertAccessibleStudent(actor, studentId);
    if (student.userId) {
      throw new ConflictException("This student already has a portal account");
    }

    const enrollment = await this.prisma.studentEnrollment.findFirst({
      where: { studentId, status: "ACTIVE" },
      include: { class: { include: { division: true } }, school: true },
      orderBy: { startDate: "desc" },
    });
    if (!enrollment) {
      throw new BadRequestException("This student has no active enrollment — cannot determine their division");
    }
    if (enrollment.class.division.type !== "SECONDARY") {
      throw new BadRequestException(
        "Student Portal accounts are only available for secondary students. This student is currently enrolled in a primary division.",
      );
    }

    // Never a real inbox — students aren't required to have an email. The
    // studentNumber (e.g. "STU-2027-00003") is unique for this school's
    // whole history (see generateStudentNumber), so qualifying it with the
    // schoolId is enough to guarantee it's globally unique across schools.
    const loginEmail = `${enrollment.studentNumber.toLowerCase()}@${enrollment.schoolId}.student.ilays.local`;
    const temporaryPassword = randomBytes(9).toString("base64url");
    const passwordHash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });

    const role = await this.prisma.role.findUniqueOrThrow({ where: { name: "STUDENT" } });

    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: loginEmail,
          organizationId: student.organizationId,
          status: "ACTIVE",
          passwordHash,
          mustChangePassword: true,
        },
      });

      await tx.student.update({ where: { id: studentId }, data: { userId: user.id } });

      await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
      await tx.userSchool.create({ data: { userId: user.id, schoolId: enrollment.schoolId } });

      await this.audit.record(
        {
          actor,
          organizationId: student.organizationId,
          schoolId: enrollment.schoolId,
          action: AuditAction.STUDENT_PORTAL_ACCOUNT_CREATED,
          module: AuditModuleName.STUDENTS,
          resourceType: "Student",
          resourceId: studentId,
          resourceName: `${student.firstName} ${student.lastName}`,
          after: { loginId: enrollment.studentNumber },
        },
        tx,
      );
    }, { timeout: 30_000 });

    return { loginId: enrollment.studentNumber, temporaryPassword };
  }
}
