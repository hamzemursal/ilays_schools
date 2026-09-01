import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes, createHash } from "node:crypto";
import { Prisma } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateSchoolDto } from "./dto/create-school.dto";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

@Injectable()
export class SchoolsService {
  constructor(private readonly prisma: PrismaService) {}

  // Every query here is scoped to the caller's organization, and further
  // restricted to their specific schools when they have any — this is the
  // service-layer half of tenant isolation (see architecture blueprint,
  // section E). A School Admin can never see another school by guessing an ID.
  private accessibleWhere(actor: AuthenticatedUser): Prisma.SchoolWhereInput {
    if (!actor.organizationId) {
      throw new ForbiddenException("This account isn't attached to an organization");
    }
    const where: Prisma.SchoolWhereInput = { organizationId: actor.organizationId };
    if (actor.schoolIds.length > 0) {
      where.id = { in: actor.schoolIds };
    }
    return where;
  }

  async findAccessible(actor: AuthenticatedUser) {
    const schools = await this.prisma.school.findMany({
      where: this.accessibleWhere(actor),
      orderBy: { createdAt: "desc" },
    });
    return this.withCounts(schools);
  }

  // Enrolled-student and teacher counts, plus whether an active School Admin
  // exists yet — computed once here (via groupBy, not N+1 per-school
  // queries) so both the schools list/card-grid and the system-wide summary
  // below can share the exact same numbers instead of two separate
  // aggregations drifting apart.
  private async withCounts<T extends { id: string }>(schools: T[]) {
    const schoolIds = schools.map((s) => s.id);
    if (schoolIds.length === 0) {
      return schools.map((s) => ({ ...s, studentCount: 0, teacherCount: 0, hasActiveAdmin: false }));
    }

    const [studentGroups, teacherGroups, schoolAdminRole] = await Promise.all([
      this.prisma.studentEnrollment.groupBy({
        by: ["schoolId"],
        where: { schoolId: { in: schoolIds }, status: "ACTIVE" },
        _count: { _all: true },
      }),
      this.prisma.teacher.groupBy({
        by: ["schoolId"],
        where: { schoolId: { in: schoolIds } },
        _count: { _all: true },
      }),
      this.prisma.role.findUnique({ where: { name: "SCHOOL_ADMIN" } }),
    ]);

    const studentCountBySchool = new Map(studentGroups.map((g) => [g.schoolId, g._count._all]));
    const teacherCountBySchool = new Map(teacherGroups.map((g) => [g.schoolId, g._count._all]));

    let schoolsWithActiveAdmin = new Set<string>();
    if (schoolAdminRole) {
      const adminLinks = await this.prisma.userSchool.findMany({
        where: { schoolId: { in: schoolIds }, user: { status: "ACTIVE", roles: { some: { roleId: schoolAdminRole.id } } } },
        select: { schoolId: true },
      });
      schoolsWithActiveAdmin = new Set(adminLinks.map((l) => l.schoolId));
    }

    return schools.map((s) => ({
      ...s,
      studentCount: studentCountBySchool.get(s.id) ?? 0,
      teacherCount: teacherCountBySchool.get(s.id) ?? 0,
      hasActiveAdmin: schoolsWithActiveAdmin.has(s.id),
    }));
  }

  // The Super Admin's system-wide overview — every figure is derived from
  // the same School/StudentEnrollment/Teacher/Guardian/AuditLog relationships
  // used everywhere else (accessibleWhere() still applies, so a School Admin
  // calling this would only ever see totals for their own school(s), never
  // another school's data). There is no dedicated "Staff" model in this
  // schema — Teacher is the only staff type with real profile records, so
  // `staff` is reported as the teacher count rather than inventing a number
  // for roles (finance/HR/etc.) that have no underlying records at all.
  async getSystemSummary(actor: AuthenticatedUser) {
    const schools = await this.findAccessible(actor);
    const schoolIds = schools.map((s) => s.id);

    const primarySchools = schools.filter((s) => s.type === "PRIMARY" || s.type === "PRIMARY_AND_SECONDARY").length;
    const secondarySchools = schools.filter((s) => s.type === "SECONDARY" || s.type === "PRIMARY_AND_SECONDARY").length;
    const activeSchools = schools.filter((s) => s.status === "ACTIVE").length;
    const inactiveSchools = schools.filter((s) => s.status === "INACTIVE").length;
    const totalStudents = schools.reduce((sum, s) => sum + s.studentCount, 0);
    const totalTeachers = schools.reduce((sum, s) => sum + s.teacherCount, 0);

    const [maleStudents, femaleStudents, totalGuardians, recentActivityRaw] = await Promise.all([
      schoolIds.length > 0
        ? this.prisma.studentEnrollment.count({
            where: { schoolId: { in: schoolIds }, status: "ACTIVE", student: { sex: "MALE" } },
          })
        : Promise.resolve(0),
      schoolIds.length > 0
        ? this.prisma.studentEnrollment.count({
            where: { schoolId: { in: schoolIds }, status: "ACTIVE", student: { sex: "FEMALE" } },
          })
        : Promise.resolve(0),
      schoolIds.length > 0
        ? this.prisma.guardian.count({
            where: { students: { some: { student: { enrollments: { some: { schoolId: { in: schoolIds } } } } } } },
          })
        : Promise.resolve(0),
      this.prisma.auditLog.findMany({
        where: { organizationId: actor.organizationId },
        orderBy: { createdAt: "desc" },
        take: 15,
      }),
    ]);

    const actorIds = [...new Set(recentActivityRaw.map((l) => l.actorUserId).filter((id): id is string => !!id))];
    const users =
      actorIds.length > 0
        ? await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, email: true } })
        : [];
    const emailById = new Map(users.map((u) => [u.id, u.email]));
    const recentActivity = recentActivityRaw.map((l) => ({
      ...l,
      actorEmail: l.actorUserId ? (emailById.get(l.actorUserId) ?? "(deleted user)") : "(system)",
    }));

    const alerts: { severity: "warning" | "info"; message: string; schoolId: string }[] = [];
    for (const s of schools) {
      if (!s.hasActiveAdmin) {
        alerts.push({ severity: "warning", message: `${s.name} has no active School Admin yet`, schoolId: s.id });
      }
      if (s.studentCount === 0) {
        alerts.push({ severity: "info", message: `${s.name} has no students enrolled yet`, schoolId: s.id });
      }
    }

    return {
      totals: {
        schools: schools.length,
        primarySchools,
        secondarySchools,
        activeSchools,
        inactiveSchools,
        students: totalStudents,
        maleStudents,
        femaleStudents,
        teachers: totalTeachers,
        guardians: totalGuardians,
        staff: totalTeachers,
      },
      schools,
      recentActivity,
      alerts,
    };
  }

  async findOneAccessibleOrThrow(actor: AuthenticatedUser, id: string) {
    // AND, not spread: accessibleWhere() may itself set `id: { in: [...] }`,
    // and spreading `{ ...accessibleWhere(actor), id }` would let the plain
    // `id` key silently overwrite that restriction instead of narrowing it.
    const school = await this.prisma.school.findFirst({
      where: { AND: [this.accessibleWhere(actor), { id }] },
    });
    if (!school) throw new NotFoundException("School not found");
    return school;
  }

  // Deliberately NOT scoped by accessibleWhere()'s schoolIds restriction —
  // this exists only so someone with transfers.create (but not schools.view,
  // e.g. a School Admin) can pick a destination school for a transfer.
  // Cross-school by nature, so it returns every active school in the same
  // organization, but only the id/name a picker needs — nothing else.
  async listDirectory(actor: AuthenticatedUser) {
    if (!actor.organizationId) {
      throw new ForbiddenException("This account isn't attached to an organization");
    }
    return this.prisma.school.findMany({
      where: { organizationId: actor.organizationId, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }

  async listDivisions(actor: AuthenticatedUser, schoolId: string) {
    await this.findOneAccessibleOrThrow(actor, schoolId);
    return this.prisma.division.findMany({ where: { schoolId }, orderBy: { type: "asc" } });
  }

  async create(actor: AuthenticatedUser, dto: CreateSchoolDto) {
    if (!actor.organizationId) {
      throw new ForbiddenException("This account isn't attached to an organization");
    }

    const divisionTypes = dto.type === "PRIMARY_AND_SECONDARY" ? (["PRIMARY", "SECONDARY"] as const) : ([dto.type] as const);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Creating a school produces the school + its division(s) implied by
        // the chosen type — nothing else. No classes, sections, teachers,
        // students, or parents get created here; that's the School Admin's
        // job once they've been invited.
        const school = await tx.school.create({
          data: {
            organizationId: actor.organizationId!,
            name: dto.name,
            type: dto.type,
            address: dto.address,
            phone: dto.phone,
            email: dto.email,
          },
        });

        await tx.division.createMany({
          data: divisionTypes.map((type) => ({ schoolId: school.id, type })),
        });

        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            schoolId: school.id,
            actorUserId: actor.id,
            action: "school.create",
            resource: "School",
            resourceId: school.id,
            after: { name: school.name, type: school.type },
          },
        });

        return school;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A school with this name already exists in your organization");
      }
      throw error;
    }
  }

  async inviteAdmin(actor: AuthenticatedUser, schoolId: string, email: string) {
    const school = await this.findOneAccessibleOrThrow(actor, schoolId);

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser?.status === "ACTIVE") {
      throw new ConflictException("A user with this email already has an active account");
    }

    const role = await this.prisma.role.findUniqueOrThrow({ where: { name: "SCHOOL_ADMIN" } });

    const user = await this.prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, organizationId: school.organizationId, status: "PENDING_SETUP" },
    });

    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });

    await this.prisma.userSchool.upsert({
      where: { userId_schoolId: { userId: user.id, schoolId: school.id } },
      update: {},
      create: { userId: user.id, schoolId: school.id },
    });

    const rawToken = randomBytes(32).toString("hex");
    await this.prisma.invitation.create({
      data: {
        organizationId: school.organizationId,
        schoolId: school.id,
        roleId: role.id,
        userId: user.id,
        invitedByUserId: actor.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: school.organizationId,
        schoolId: school.id,
        actorUserId: actor.id,
        action: "school_admin.invite",
        resource: "User",
        resourceId: user.id,
        after: { email },
      },
    });

    const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3010";
    return { email, acceptUrl: `${webOrigin}/accept-invite?token=${rawToken}` };
  }

  // Real counts of everything this school owns, shown to the admin before
  // they can even see the confirm-delete button — see remove() below for
  // exactly what each of these becomes once confirmed.
  async getDeletionImpact(actor: AuthenticatedUser, schoolId: string) {
    const school = await this.findOneAccessibleOrThrow(actor, schoolId);

    const [enrollmentIds, feeStructureIds] = await Promise.all([
      this.prisma.studentEnrollment.findMany({ where: { schoolId }, select: { id: true } }),
      this.prisma.feeStructure.findMany({ where: { schoolId }, select: { id: true } }),
    ]);
    const enrIds = enrollmentIds.map((e) => e.id);
    const feeIds = feeStructureIds.map((f) => f.id);

    const [
      enrollments,
      teachers,
      academicYears,
      classes,
      sections,
      subjects,
      exams,
      examSubjects,
      results,
      attendanceRecords,
      feeStructures,
      invoices,
      payments,
      transfers,
      promotionBatches,
      promotionItems,
      announcements,
    ] = await Promise.all([
      Promise.resolve(enrIds.length),
      this.prisma.teacher.count({ where: { schoolId } }),
      this.prisma.academicYear.count({ where: { schoolId } }),
      this.prisma.class.count({ where: { division: { schoolId } } }),
      this.prisma.section.count({ where: { class: { division: { schoolId } } } }),
      this.prisma.subject.count({ where: { schoolId } }),
      this.prisma.exam.count({ where: { schoolId } }),
      this.prisma.examSubject.count({ where: { exam: { schoolId } } }),
      this.prisma.result.count({ where: { enrollment: { schoolId } } }),
      this.prisma.attendance.count({ where: { enrollment: { schoolId } } }),
      Promise.resolve(feeIds.length),
      this.prisma.invoice.count({
        where: { OR: [{ enrollmentId: { in: enrIds } }, { feeStructureId: { in: feeIds } }] },
      }),
      this.prisma.payment.count({
        where: { invoice: { OR: [{ enrollmentId: { in: enrIds } }, { feeStructureId: { in: feeIds } }] } },
      }),
      this.prisma.transfer.count({ where: { fromEnrollmentId: { in: enrIds } } }),
      this.prisma.promotionBatch.count({ where: { schoolId } }),
      this.prisma.promotionItem.count({ where: { fromEnrollmentId: { in: enrIds } } }),
      this.prisma.announcement.count({ where: { schoolId } }),
    ]);

    const counts = {
      enrollments,
      teachers,
      academicYears,
      classes,
      sections,
      subjects,
      exams,
      examSubjects,
      results,
      attendanceRecords,
      feeStructures,
      invoices,
      payments,
      transfers,
      promotionBatches,
      promotionItems,
      announcements,
    };

    return {
      school: { id: school.id, name: school.name, hasActiveAdmin: (await this.withCounts([school]))[0].hasActiveAdmin },
      counts,
      hasAnyData: Object.values(counts).some((c) => c > 0),
    };
  }

  // A genuine, permanent delete — per product decision, a School is never
  // blocked from deletion just because it has real history (students,
  // teachers, years of academic/financial records). StudentEnrollment and
  // Teacher are both onDelete: Restrict against School, and a chain of
  // further Restrict relations hangs off StudentEnrollment itself
  // (Invoice's two parents, Transfer, PromotionItem) — every step below
  // exists only to clear those specific blockers, in the order they'd
  // actually fail in, before the final delete. Everything else the school
  // owns (AcademicYear, Division→Class→Section, Subject, Announcement,
  // Exam→ExamSubject→Result, FeeStructure, UserSchool, Invitation,
  // ImportBatch) is onDelete: Cascade and needs no manual handling — but
  // only once StudentEnrollment is gone, since several of those Cascade
  // chains (AcademicYear, FeeStructure, Class/Section) are themselves
  // blocked by StudentEnrollment via their own Restrict relations.
  //
  // PromotionBatch and TeacherAssignment carry a schoolId column with no
  // actual foreign key in the schema (a deliberate denormalization elsewhere
  // in this codebase) — Postgres won't block or cascade on them, so leaving
  // them alone would silently create orphans. PromotionBatch is deleted
  // explicitly here for that reason; TeacherAssignment needs no equivalent
  // step because it's already cascaded away via its own (real) teacherId
  // relation once that Teacher row is deleted below.
  async remove(actor: AuthenticatedUser, schoolId: string) {
    const school = await this.findOneAccessibleOrThrow(actor, schoolId);

    await this.prisma.$transaction(
      async (tx) => {
        const enrollments = await tx.studentEnrollment.findMany({ where: { schoolId }, select: { id: true } });
        const feeStructures = await tx.feeStructure.findMany({ where: { schoolId }, select: { id: true } });
        const enrIds = enrollments.map((e) => e.id);
        const feeIds = feeStructures.map((f) => f.id);

        const invoices = await tx.invoice.findMany({
          where: { OR: [{ enrollmentId: { in: enrIds } }, { feeStructureId: { in: feeIds } }] },
          select: { id: true },
        });
        const invoiceIds = invoices.map((i) => i.id);

        // Restrict-blockers, cleared in the order they'd otherwise fail:
        // Payment -> Invoice, then PromotionBatch/PromotionItem and
        // Transfer -> StudentEnrollment.
        await tx.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
        await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
        // Deletes the school's own PromotionBatch rows and cascades their
        // PromotionItem children; the second call is a defensive fallback
        // for any PromotionItem whose batch (if any) doesn't share this
        // school's id — never leave one dangling on a Restrict FK.
        await tx.promotionBatch.deleteMany({ where: { schoolId } });
        await tx.promotionItem.deleteMany({ where: { fromEnrollmentId: { in: enrIds } } });
        // Only the "from" side — a transfer whose *destination* enrollment
        // is at this school still belongs to its origin school's history;
        // toEnrollmentId is onDelete: SetNull, so that transfer survives
        // with its link cleared, not deleted out from under the other school.
        await tx.transfer.deleteMany({ where: { fromEnrollmentId: { in: enrIds } } });

        // Clears School -> Teacher; cascades TeacherAssignment automatically.
        await tx.teacher.deleteMany({ where: { schoolId } });

        // Clears School -> StudentEnrollment; cascades Attendance and Result
        // automatically. Student itself is org-level and is never touched —
        // it survives with zero enrollments at this (now-deleted) school,
        // same as every other student-facing delete in this codebase.
        await tx.studentEnrollment.deleteMany({ where: { schoolId } });

        // Cascades AcademicYear, Division -> Class -> Section -> ClassSubject,
        // Subject, Announcement, Exam -> ExamSubject -> Result (already
        // empty), FeeStructure (now unblocked), UserSchool, Invitation, and
        // ImportBatch -> ImportRow automatically.
        await tx.school.delete({ where: { id: schoolId } });

        await tx.auditLog.create({
          data: {
            organizationId: school.organizationId,
            schoolId: school.id,
            actorUserId: actor.id,
            action: "school.delete",
            resource: "School",
            resourceId: school.id,
            before: { name: school.name, type: school.type, address: school.address },
          },
        });
      },
      { timeout: 30_000 },
    );

    return { success: true };
  }
}
