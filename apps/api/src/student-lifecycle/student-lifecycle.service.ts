import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import type { Prisma } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction, AuditModuleName } from "../audit/audit-actions";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { PreviewForm1TransitionDto } from "./dto/preview-form1-transition.dto";
import { ConfirmForm1TransitionDto } from "./dto/confirm-form1-transition.dto";

const MAX_PAGE_SIZE = 100;

export interface LifecycleListFilters {
  schoolId?: string;
  academicYearId?: string;
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

// Primary Completion (Class 8 → COMPLETED) already exists and is untouched —
// see PromotionsService.confirm(), which now just picks a different audit
// action name depending on the resolved outcome. Everything in this service
// is the two things that don't exist yet: reading the lifecycle buckets
// back out (all derived from Student.currentStatus + StudentEnrollment.status
// + PromotionItem — no new stored status anywhere), and the explicit,
// always-separate Form 1 Transition action that crosses from a Primary
// division into a Secondary one in the same school.
@Injectable()
export class StudentLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------
  // Scope resolution — same shape as AuditService.buildWhere: an explicit
  // schoolId is validated against the actor's real access via
  // findOneAccessibleOrThrow (throws NotFoundException, never leaks
  // another school's data); no schoolId means "every school the actor can
  // see" — every school in the org for Super/Org Admin, or exactly their
  // own school(s) for a School Admin (never unrestricted).
  // ---------------------------------------------------------------------
  private async resolveSchoolIds(actor: AuthenticatedUser, schoolId?: string): Promise<string[] | undefined> {
    if (schoolId) {
      await this.schools.findOneAccessibleOrThrow(actor, schoolId);
      return [schoolId];
    }
    if (actor.schoolIds.length > 0) return actor.schoolIds;
    return undefined;
  }

  private requireOrganizationId(actor: AuthenticatedUser): string {
    if (!actor.organizationId) {
      throw new ForbiddenException("This account isn't attached to an organization");
    }
    return actor.organizationId;
  }

  // ---------------------------------------------------------------------
  // Summary — the two-card (Primary / Secondary) numbers for the Overview
  // page. Every count is computed fresh from StudentEnrollment/Student,
  // never cached or denormalized.
  // ---------------------------------------------------------------------
  async getSummary(actor: AuthenticatedUser, filters: { schoolId?: string; academicYearId?: string }) {
    const organizationId = this.requireOrganizationId(actor);
    const schoolIds = await this.resolveSchoolIds(actor, filters.schoolId);

    const [primary, secondary] = await Promise.all([
      this.computePrimarySummary(organizationId, schoolIds, filters.academicYearId),
      this.computeSecondarySummary(organizationId, schoolIds, filters.academicYearId),
    ]);

    return { primary, secondary };
  }

  private async computePrimarySummary(organizationId: string, schoolIds: string[] | undefined, academicYearId?: string) {
    const base: Prisma.StudentEnrollmentWhereInput = {
      organizationId,
      ...(schoolIds ? { schoolId: { in: schoolIds } } : {}),
      ...(academicYearId ? { academicYearId } : {}),
      class: { division: { type: "PRIMARY" } },
    };

    const [totalCompleted, awaitingForm1, enrolledInForm1, transferredOut, withdrawn] = await Promise.all([
      this.prisma.studentEnrollment.count({ where: { ...base, status: "COMPLETED" } }),
      this.prisma.studentEnrollment.count({
        where: { ...base, status: "COMPLETED", student: { currentStatus: "COMPLETED" } },
      }),
      this.prisma.studentEnrollment.count({
        where: { ...base, status: "COMPLETED", promotionFrom: { some: { toEnrollmentId: { not: null } } } },
      }),
      this.prisma.studentEnrollment.count({ where: { ...base, status: "TRANSFERRED_OUT" } }),
      this.prisma.studentEnrollment.count({
        where: {
          ...base,
          OR: [{ status: "WITHDRAWN" }, { status: "COMPLETED", student: { currentStatus: "ARCHIVED" } }],
        },
      }),
    ]);

    return {
      totalCompleted,
      awaitingForm1,
      readyForForm1: awaitingForm1, // same underlying set — see Phase 2 plan: not a distinct stored state
      enrolledInForm1,
      transferredOut,
      withdrawn,
    };
  }

  private async computeSecondarySummary(
    organizationId: string,
    schoolIds: string[] | undefined,
    academicYearId?: string,
  ) {
    const base: Prisma.StudentEnrollmentWhereInput = {
      organizationId,
      ...(schoolIds ? { schoolId: { in: schoolIds } } : {}),
      ...(academicYearId ? { academicYearId } : {}),
      class: { division: { type: "SECONDARY" } },
    };

    const finalClassIds = await this.getFinalClassIds(organizationId, schoolIds, "SECONDARY");

    const [totalGraduated, graduated, transferredOut, graduationPending] = await Promise.all([
      this.prisma.studentEnrollment.count({ where: { ...base, status: "GRADUATED" } }),
      this.prisma.studentEnrollment.count({
        where: { ...base, status: "GRADUATED", student: { currentStatus: "GRADUATED" } },
      }),
      this.prisma.studentEnrollment.count({ where: { ...base, status: "TRANSFERRED_OUT" } }),
      this.prisma.studentEnrollment.count({
        where: {
          organizationId,
          ...(schoolIds ? { schoolId: { in: schoolIds } } : {}),
          ...(academicYearId ? { academicYearId } : {}),
          status: "ACTIVE",
          classId: { in: finalClassIds },
        },
      }),
    ]);

    return {
      totalGraduated,
      graduationPending,
      graduated,
      alumni: graduated, // same underlying set, surfaced as its own page — not a distinct stored state
      transferredOut,
    };
  }

  // "Final class" of a division = the highest `level` class it has — the
  // same rule PromotionsService.resolvePlan() already uses to detect
  // "nothing to promote into," just computed for many divisions/schools at
  // once instead of one section at a time, and used here to find who's
  // *still active* there (candidates for graduation, not yet graduated).
  private async getFinalClassIds(
    organizationId: string,
    schoolIds: string[] | undefined,
    divisionType: "PRIMARY" | "SECONDARY",
  ): Promise<string[]> {
    const divisions = await this.prisma.division.findMany({
      where: {
        type: divisionType,
        school: {
          organizationId,
          ...(schoolIds ? { id: { in: schoolIds } } : {}),
        },
      },
      include: { classes: { select: { id: true, level: true } } },
    });

    const finalClassIds: string[] = [];
    for (const division of divisions) {
      if (division.classes.length === 0) continue;
      const maxLevel = Math.max(...division.classes.map((c) => c.level));
      for (const c of division.classes) {
        if (c.level === maxLevel) finalClassIds.push(c.id);
      }
    }
    return finalClassIds;
  }

  // ---------------------------------------------------------------------
  // List pages
  // ---------------------------------------------------------------------

  async listPrimaryCompleted(actor: AuthenticatedUser, filters: LifecycleListFilters) {
    const organizationId = this.requireOrganizationId(actor);
    const schoolIds = await this.resolveSchoolIds(actor, filters.schoolId);

    const scopeWhere: Prisma.StudentEnrollmentWhereInput = {
      organizationId,
      ...(schoolIds ? { schoolId: { in: schoolIds } } : {}),
      ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
      class: { division: { type: "PRIMARY" } },
    };

    const statusWhere = this.primaryStatusWhere(filters.status);
    const searchWhere = this.searchWhere(filters.search);

    return this.paginateEnrollments({ AND: [scopeWhere, statusWhere, searchWhere] }, filters);
  }

  async listAwaitingEnrollment(actor: AuthenticatedUser, filters: LifecycleListFilters) {
    return this.listPrimaryCompleted(actor, { ...filters, status: "AWAITING" });
  }

  async listSecondaryGraduated(actor: AuthenticatedUser, filters: LifecycleListFilters) {
    const organizationId = this.requireOrganizationId(actor);
    const schoolIds = await this.resolveSchoolIds(actor, filters.schoolId);

    if (filters.status === "PENDING") {
      const finalClassIds = await this.getFinalClassIds(organizationId, schoolIds, "SECONDARY");
      const where: Prisma.StudentEnrollmentWhereInput = {
        AND: [
          {
            organizationId,
            ...(schoolIds ? { schoolId: { in: schoolIds } } : {}),
            ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
            status: "ACTIVE",
            classId: { in: finalClassIds },
          },
          this.searchWhere(filters.search),
        ],
      };
      return this.paginateEnrollments(where, filters);
    }

    const scopeWhere: Prisma.StudentEnrollmentWhereInput = {
      organizationId,
      ...(schoolIds ? { schoolId: { in: schoolIds } } : {}),
      ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
      class: { division: { type: "SECONDARY" } },
    };
    const statusWhere = this.secondaryStatusWhere(filters.status);
    const searchWhere = this.searchWhere(filters.search);

    return this.paginateEnrollments({ AND: [scopeWhere, statusWhere, searchWhere] }, filters);
  }

  async listAlumni(actor: AuthenticatedUser, filters: LifecycleListFilters) {
    return this.listSecondaryGraduated(actor, { ...filters, status: "GRADUATED" });
  }

  private primaryStatusWhere(status?: string): Prisma.StudentEnrollmentWhereInput {
    switch (status) {
      case "AWAITING":
        return { status: "COMPLETED", student: { currentStatus: "COMPLETED" } };
      case "ENROLLED_FORM1":
        return { status: "COMPLETED", promotionFrom: { some: { toEnrollmentId: { not: null } } } };
      case "TRANSFERRED_OUT":
        return { status: "TRANSFERRED_OUT" };
      case "WITHDRAWN":
        return { OR: [{ status: "WITHDRAWN" }, { status: "COMPLETED", student: { currentStatus: "ARCHIVED" } }] };
      default:
        return { status: "COMPLETED" };
    }
  }

  private secondaryStatusWhere(status?: string): Prisma.StudentEnrollmentWhereInput {
    switch (status) {
      case "GRADUATED":
        return { status: "GRADUATED", student: { currentStatus: "GRADUATED" } };
      case "TRANSFERRED_OUT":
        return { status: "TRANSFERRED_OUT" };
      default:
        return { status: "GRADUATED" };
    }
  }

  private searchWhere(search?: string): Prisma.StudentEnrollmentWhereInput {
    if (!search) return {};
    return {
      OR: [
        { studentNumber: { contains: search, mode: "insensitive" } },
        { student: { firstName: { contains: search, mode: "insensitive" } } },
        { student: { lastName: { contains: search, mode: "insensitive" } } },
      ],
    };
  }

  private async paginateEnrollments(where: Prisma.StudentEnrollmentWhereInput, filters: LifecycleListFilters) {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? 25));

    const [total, rows] = await Promise.all([
      this.prisma.studentEnrollment.count({ where }),
      this.prisma.studentEnrollment.findMany({
        where,
        include: {
          student: { select: { id: true, firstName: true, lastName: true, currentStatus: true } },
          school: { select: { id: true, name: true } },
          class: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } },
          academicYear: { select: { id: true, name: true } },
          promotionFrom: { select: { toEnrollmentId: true }, take: 1 },
          transfersOut: { select: { status: true, toSchoolId: true }, take: 1, orderBy: { createdAt: "desc" } },
        },
        orderBy: [{ endDate: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      data: rows.map((r) => ({
        enrollmentId: r.id,
        studentId: r.studentId,
        firstName: r.student.firstName,
        lastName: r.student.lastName,
        studentNumber: r.studentNumber,
        rollNumber: r.rollNumber,
        school: r.school,
        class: r.class,
        section: r.section,
        academicYear: r.academicYear,
        enrollmentStatus: r.status,
        lifecycleStatus: r.student.currentStatus,
        startDate: r.startDate,
        endDate: r.endDate,
        enrolledInForm1: r.promotionFrom.some((p) => p.toEnrollmentId !== null),
        transfer: r.transfersOut[0] ?? null,
      })),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  // ---------------------------------------------------------------------
  // Form 1 Transition — the explicit, separate second step. Never invoked
  // automatically by Primary Completion. Reuses PromotionBatch/PromotionItem
  // exactly like ordinary same-division promotion does; the only structural
  // difference is that toClassId lives in a different Division than the
  // source enrollments, and each student can land in a different section.
  // ---------------------------------------------------------------------

  async previewForm1Transition(actor: AuthenticatedUser, schoolId: string, dto: PreviewForm1TransitionDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const toClass = await this.getForm1ClassOrThrow(schoolId, dto.toClassId);
    await this.getAcademicYearOrThrow(schoolId, dto.toAcademicYearId);

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: { id: { in: dto.enrollmentIds }, schoolId },
      include: { student: true, class: { include: { division: true } } },
    });
    const byId = new Map(enrollments.map((e) => [e.id, e]));

    const eligible: {
      enrollmentId: string;
      studentId: string;
      firstName: string;
      lastName: string;
      studentNumber: string;
      rollNumber: number;
    }[] = [];
    const ineligible: { enrollmentId: string; reason: string }[] = [];

    for (const id of dto.enrollmentIds) {
      const e = byId.get(id);
      if (!e) {
        ineligible.push({ enrollmentId: id, reason: "Enrollment not found in this school" });
        continue;
      }
      if (e.class.division.type !== "PRIMARY") {
        ineligible.push({ enrollmentId: id, reason: "Not a Primary-division enrollment" });
        continue;
      }
      if (e.status !== "COMPLETED") {
        ineligible.push({ enrollmentId: id, reason: `Enrollment status is ${e.status}, not COMPLETED` });
        continue;
      }
      if (e.student.currentStatus !== "COMPLETED") {
        ineligible.push({
          enrollmentId: id,
          reason: `Student is currently ${e.student.currentStatus}, not awaiting enrollment`,
        });
        continue;
      }
      eligible.push({
        enrollmentId: e.id,
        studentId: e.studentId,
        firstName: e.student.firstName,
        lastName: e.student.lastName,
        studentNumber: e.studentNumber,
        rollNumber: e.rollNumber,
      });
    }

    const targetSections = await Promise.all(
      toClass.sections.map(async (s) => {
        const currentActive = await this.prisma.studentEnrollment.count({
          where: { sectionId: s.id, status: "ACTIVE" },
        });
        return {
          id: s.id,
          name: s.name,
          capacity: s.capacity,
          currentActive,
          available: s.capacity === null ? null : s.capacity - currentActive,
        };
      }),
    );

    return {
      toClass: { id: toClass.id, name: toClass.name },
      eligible,
      ineligible,
      targetSections,
    };
  }

  async confirmForm1Transition(actor: AuthenticatedUser, schoolId: string, dto: ConfirmForm1TransitionDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const toClass = await this.getForm1ClassOrThrow(schoolId, dto.toClassId);
    const toYear = await this.getAcademicYearOrThrow(schoolId, dto.toAcademicYearId);

    const enrollmentIds = dto.assignments.map((a) => a.enrollmentId);
    if (new Set(enrollmentIds).size !== enrollmentIds.length) {
      throw new BadRequestException("The same enrollment can't be assigned twice");
    }

    const sectionIds = [...new Set(dto.assignments.map((a) => a.sectionId))];
    const sections = await this.prisma.section.findMany({ where: { id: { in: sectionIds }, classId: toClass.id } });
    if (sections.length !== sectionIds.length) {
      throw new BadRequestException("One or more target sections don't belong to the destination class");
    }
    const sectionById = new Map(sections.map((s) => [s.id, s]));

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: { id: { in: enrollmentIds }, schoolId },
      include: { student: true, class: { include: { division: true } } },
    });
    if (enrollments.length !== enrollmentIds.length) {
      throw new BadRequestException("One or more enrollments were not found in this school");
    }

    // Every batch is scoped to one source academic year, mirroring how
    // PromotionBatch already assumes one fromAcademicYearId per batch for
    // ordinary same-division promotion — a mixed-year selection is rejected
    // outright rather than silently recorded against just the first one.
    const fromAcademicYearIds = new Set(enrollments.map((e) => e.academicYearId));
    if (fromAcademicYearIds.size > 1) {
      throw new BadRequestException(
        "All selected students must be completing from the same academic year — run separate transitions for each year",
      );
    }

    for (const e of enrollments) {
      if (e.class.division.type !== "PRIMARY") {
        throw new BadRequestException(`Student ${e.studentId}'s enrollment is not a Primary-division enrollment`);
      }
      if (e.status !== "COMPLETED") {
        throw new BadRequestException(`Student ${e.studentId} is not COMPLETED (currently ${e.status})`);
      }
      if (e.student.currentStatus !== "COMPLETED") {
        throw new BadRequestException(
          `Student ${e.studentId} is currently ${e.student.currentStatus}, not awaiting enrollment`,
        );
      }
    }

    const incomingBySection = new Map<string, number>();
    for (const a of dto.assignments) {
      incomingBySection.set(a.sectionId, (incomingBySection.get(a.sectionId) ?? 0) + 1);
    }
    for (const section of sections) {
      if (section.capacity !== null) {
        const currentActive = await this.prisma.studentEnrollment.count({
          where: { sectionId: section.id, status: "ACTIVE" },
        });
        const incoming = incomingBySection.get(section.id) ?? 0;
        if (currentActive + incoming > section.capacity) {
          throw new BadRequestException(
            `Section ${section.name} doesn't have room for ${incoming} more student(s) ` +
              `(capacity ${section.capacity}, currently ${currentActive})`,
          );
        }
      }
    }

    const enrollmentById = new Map(enrollments.map((e) => [e.id, e]));

    const { batch, results } = await this.prisma.$transaction(
      async (tx) => {
        const results: {
          studentId: string;
          studentNumber: string;
          fromEnrollmentId: string;
          toEnrollmentId: string;
          sectionId: string;
          rollNumber: number;
        }[] = [];

        const createdBatch = await tx.promotionBatch.create({
          data: {
            schoolId,
            fromAcademicYearId: enrollments[0].academicYearId,
            toAcademicYearId: dto.toAcademicYearId,
            initiatedByUserId: actor.id,
            status: "CONFIRMED",
            confirmedAt: new Date(),
          },
        });

        // Fresh roll numbers per destination section, scoped to the
        // destination academic year — same rule PromotionsService.confirm()
        // already uses, so a section reused across years doesn't carry
        // stale numbering forward.
        const nextRollBySection = new Map<string, number>();
        for (const section of sections) {
          const maxRoll = await tx.studentEnrollment.aggregate({
            where: { sectionId: section.id, academicYearId: dto.toAcademicYearId, status: "ACTIVE" },
            _max: { rollNumber: true },
          });
          nextRollBySection.set(section.id, (maxRoll._max.rollNumber ?? 0) + 1);
        }

        for (const assignment of dto.assignments) {
          const enrollment = enrollmentById.get(assignment.enrollmentId)!;
          const rollNumber = nextRollBySection.get(assignment.sectionId)!;
          nextRollBySection.set(assignment.sectionId, rollNumber + 1);

          // The old Class 8 enrollment's own status is deliberately left as
          // COMPLETED forever — that row's job is to record the true
          // historical fact "this enrollment ended because the student
          // completed Primary," not to be rewritten once something later
          // happens. PromotionItem.toEnrollmentId is what links it forward.
          const newEnrollment = await tx.studentEnrollment.create({
            data: {
              studentId: enrollment.studentId,
              organizationId: enrollment.organizationId,
              schoolId,
              academicYearId: dto.toAcademicYearId,
              classId: toClass.id,
              sectionId: assignment.sectionId,
              studentNumber: enrollment.studentNumber,
              rollNumber,
              status: "ACTIVE",
            },
          });

          await tx.student.update({ where: { id: enrollment.studentId }, data: { currentStatus: "ACTIVE" } });

          // Primary Completion already created a PromotionItem for this
          // enrollment (outcome COMPLETED, toEnrollmentId null) — that's the
          // row the "enrolledInForm1" derived check reads. fromEnrollmentId
          // is @unique, so Form 1 Transition links it forward by updating
          // toEnrollmentId in place rather than creating a second row; the
          // original batchId/outcome stay untouched, preserving the true
          // historical fact of when and how the Primary enrollment ended.
          await tx.promotionItem.update({
            where: { fromEnrollmentId: enrollment.id },
            data: { toEnrollmentId: newEnrollment.id },
          });

          results.push({
            studentId: enrollment.studentId,
            studentNumber: enrollment.studentNumber,
            fromEnrollmentId: enrollment.id,
            toEnrollmentId: newEnrollment.id,
            sectionId: assignment.sectionId,
            rollNumber,
          });
        }

        await this.audit.record(
          {
            actor,
            organizationId: actor.organizationId,
            schoolId,
            action: AuditAction.FORM_1_TRANSITION,
            module: AuditModuleName.STUDENT_LIFECYCLE,
            resourceType: "PromotionBatch",
            resourceId: createdBatch.id,
            after: {
              studentCount: dto.assignments.length,
              toClass: toClass.name,
              toAcademicYear: toYear.name,
              sections: sections.map((s) => s.name),
            },
          },
          tx,
        );

        return { batch: createdBatch, results };
      },
      { timeout: 30_000 },
    );

    return { ...batch, results };
  }

  private async getForm1ClassOrThrow(schoolId: string, classId: string) {
    const toClass = await this.prisma.class.findFirst({
      where: { id: classId, level: 1, division: { schoolId, type: "SECONDARY" } },
      include: { sections: true },
    });
    if (!toClass) {
      throw new BadRequestException(
        "Target class must be a level-1 (Form 1) class in this school's Secondary division",
      );
    }
    return toClass;
  }

  private async getAcademicYearOrThrow(schoolId: string, academicYearId: string) {
    const year = await this.prisma.academicYear.findFirst({ where: { id: academicYearId, schoolId } });
    if (!year) throw new BadRequestException("That academic year does not belong to this school");
    return year;
  }
}
