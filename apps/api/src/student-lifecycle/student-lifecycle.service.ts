import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction, AuditModuleName } from "../audit/audit-actions";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { PreviewForm1TransitionDto } from "./dto/preview-form1-transition.dto";
import { ConfirmForm1TransitionDto } from "./dto/confirm-form1-transition.dto";
import { ReverseFinalOutcomeDto } from "./dto/reverse-final-outcome.dto";

const MAX_PAGE_SIZE = 100;

// Mirrors PromotionsService: Class 8 / Form 4 are the fixed final classes.
const FINAL_LEVEL_BY_DIVISION = { PRIMARY: 8, SECONDARY: 4 } as const;

export interface LifecycleListFilters {
  schoolId?: string;
  academicYearId?: string;
  // Cross-school alternative to academicYearId — AcademicYear rows are
  // per-school, so there's no single id that means "2027" across every
  // school. When no specific school is selected, the frontend sends this
  // instead, and it's matched against the AcademicYear relation's own
  // name field, correctly aggregating every school's "2027" together.
  // academicYearId always wins if both are somehow present.
  academicYearName?: string;
  search?: string;
  status?: string;
  // Alumni Directory only (see listAlumniDirectory).
  divisionType?: "PRIMARY" | "SECONDARY";
  sectionName?: string;
  page?: number;
  pageSize?: number;
}

// A COMPLETED (Primary) or GRADUATED (Secondary) enrollment is never rewritten
// by a transfer. A student who finished and then moved to another school is
// found through the executed Transfer record instead.
const movedAfterFinishing = (finished: "COMPLETED" | "GRADUATED"): Prisma.StudentEnrollmentWhereInput => ({
  status: finished,
  transfersOut: { some: { status: "EXECUTED" } },
});

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

  // academicYearId is an exact match against one school's own row — used
  // whenever a specific school is selected. academicYearName matches the
  // AcademicYear relation's name field instead, which is how the same
  // "2027" is aggregated correctly across every school's own distinct
  // AcademicYear row when the actor is looking at more than one school.
  private academicYearWhere(academicYearId?: string, academicYearName?: string): Prisma.StudentEnrollmentWhereInput {
    if (academicYearId) return { academicYearId };
    if (academicYearName) return { academicYear: { name: academicYearName } };
    return {};
  }

  // Real, DB-backed year options for the "All Schools" case — every
  // distinct AcademicYear.name across the actor's accessible schools (or
  // just one, if schoolId is given), never a hardcoded list. isCurrentHere
  // is true if any matching row across those schools is currently marked
  // current, so the frontend can still show a "(current)" hint.
  async listAcademicYearNames(actor: AuthenticatedUser, schoolId?: string) {
    const organizationId = this.requireOrganizationId(actor);
    const schoolIds = await this.resolveSchoolIds(actor, schoolId);

    const years = await this.prisma.academicYear.findMany({
      where: { school: { organizationId, ...(schoolIds ? { id: { in: schoolIds } } : {}) } },
      select: { name: true, isCurrent: true, startDate: true },
    });

    const byName = new Map<string, { name: string; isCurrentAnywhere: boolean; latestStartDate: Date }>();
    for (const y of years) {
      const existing = byName.get(y.name);
      if (!existing) {
        byName.set(y.name, { name: y.name, isCurrentAnywhere: y.isCurrent, latestStartDate: y.startDate });
      } else {
        existing.isCurrentAnywhere = existing.isCurrentAnywhere || y.isCurrent;
        if (y.startDate > existing.latestStartDate) existing.latestStartDate = y.startDate;
      }
    }

    return [...byName.values()]
      .sort((a, b) => b.latestStartDate.getTime() - a.latestStartDate.getTime())
      .map(({ name, isCurrentAnywhere }) => ({ name, isCurrentAnywhere }));
  }

  // ---------------------------------------------------------------------
  // Summary — the two-card (Primary / Secondary) numbers for the Overview
  // page. Every count is computed fresh from StudentEnrollment/Student,
  // never cached or denormalized.
  // ---------------------------------------------------------------------
  async getSummary(
    actor: AuthenticatedUser,
    filters: { schoolId?: string; academicYearId?: string; academicYearName?: string },
  ) {
    const organizationId = this.requireOrganizationId(actor);
    const schoolIds = await this.resolveSchoolIds(actor, filters.schoolId);

    const [primary, secondary] = await Promise.all([
      this.computePrimarySummary(organizationId, schoolIds, filters.academicYearId, filters.academicYearName),
      this.computeSecondarySummary(organizationId, schoolIds, filters.academicYearId, filters.academicYearName),
    ]);

    return { primary, secondary };
  }

  private async computePrimarySummary(
    organizationId: string,
    schoolIds: string[] | undefined,
    academicYearId?: string,
    academicYearName?: string,
  ) {
    const base: Prisma.StudentEnrollmentWhereInput = {
      organizationId,
      ...(schoolIds ? { schoolId: { in: schoolIds } } : {}),
      ...this.academicYearWhere(academicYearId, academicYearName),
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
      this.prisma.studentEnrollment.count({
        where: { ...base, OR: [{ status: "TRANSFERRED_OUT" }, movedAfterFinishing("COMPLETED")] },
      }),
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
    academicYearName?: string,
  ) {
    const base: Prisma.StudentEnrollmentWhereInput = {
      organizationId,
      ...(schoolIds ? { schoolId: { in: schoolIds } } : {}),
      ...this.academicYearWhere(academicYearId, academicYearName),
      class: { division: { type: "SECONDARY" } },
    };

    const finalClassIds = await this.getFinalClassIds(organizationId, schoolIds, "SECONDARY");

    const [totalGraduated, graduated, transferredOut, graduationPending] = await Promise.all([
      this.prisma.studentEnrollment.count({ where: { ...base, status: "GRADUATED" } }),
      this.prisma.studentEnrollment.count({
        where: { ...base, status: "GRADUATED", student: { currentStatus: "GRADUATED" } },
      }),
      this.prisma.studentEnrollment.count({
        where: { ...base, OR: [{ status: "TRANSFERRED_OUT" }, movedAfterFinishing("GRADUATED")] },
      }),
      this.prisma.studentEnrollment.count({
        where: {
          organizationId,
          ...(schoolIds ? { schoolId: { in: schoolIds } } : {}),
          ...this.academicYearWhere(academicYearId, academicYearName),
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

  // "Final class" of a division is FIXED — Class 8 (Primary) / Form 4
  // (Secondary), the same FINAL_LEVEL_BY_DIVISION rule PromotionsService
  // enforces when graduating. Never "the highest level configured": a school
  // that has only set up Form 1–2 so far must not show its Form 2 students as
  // graduation candidates. Used here to find who's *still active* in a final
  // class (candidates for graduation, not yet graduated).
  private async getFinalClassIds(
    organizationId: string,
    schoolIds: string[] | undefined,
    divisionType: "PRIMARY" | "SECONDARY",
  ): Promise<string[]> {
    const classes = await this.prisma.class.findMany({
      where: {
        level: FINAL_LEVEL_BY_DIVISION[divisionType],
        division: {
          type: divisionType,
          school: {
            organizationId,
            ...(schoolIds ? { id: { in: schoolIds } } : {}),
          },
        },
      },
      select: { id: true },
    });
    return classes.map((c) => c.id);
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
      ...this.academicYearWhere(filters.academicYearId, filters.academicYearName),
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
            ...this.academicYearWhere(filters.academicYearId, filters.academicYearName),
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
      ...this.academicYearWhere(filters.academicYearId, filters.academicYearName),
      class: { division: { type: "SECONDARY" } },
    };
    const statusWhere = this.secondaryStatusWhere(filters.status);
    const searchWhere = this.searchWhere(filters.search);

    return this.paginateEnrollments({ AND: [scopeWhere, statusWhere, searchWhere] }, filters);
  }

  async listAlumni(actor: AuthenticatedUser, filters: LifecycleListFilters) {
    return this.listSecondaryGraduated(actor, { ...filters, status: "GRADUATED" });
  }

  // The Alumni Directory: everyone who finished a division's FIXED final class
  // and did not continue from it —
  //   * Secondary: a Form 4 enrollment that ended GRADUATED;
  //   * Primary:   a Class 8 enrollment that ended COMPLETED and was never
  //                linked forward into Form 1 (Completed — Not Continuing).
  // Anchored on the finishing enrollment itself, not Student.currentStatus,
  // so a graduate stays in the directory even if their student record's
  // status later changes. Read-only; reuses the existing Student/enrollment
  // rows — nothing is copied into a separate alumni record.
  async listAlumniDirectory(actor: AuthenticatedUser, filters: LifecycleListFilters) {
    const organizationId = this.requireOrganizationId(actor);
    const schoolIds = await this.resolveSchoolIds(actor, filters.schoolId);

    const scopeWhere: Prisma.StudentEnrollmentWhereInput = {
      organizationId,
      ...(schoolIds ? { schoolId: { in: schoolIds } } : {}),
      ...this.academicYearWhere(filters.academicYearId, filters.academicYearName),
    };
    const secondary: Prisma.StudentEnrollmentWhereInput = {
      status: "GRADUATED",
      class: { level: FINAL_LEVEL_BY_DIVISION.SECONDARY, division: { type: "SECONDARY" } },
    };
    const primary: Prisma.StudentEnrollmentWhereInput = {
      status: "COMPLETED",
      class: { level: FINAL_LEVEL_BY_DIVISION.PRIMARY, division: { type: "PRIMARY" } },
      promotionFrom: { none: { toEnrollmentId: { not: null } } },
    };
    const divisionWhere: Prisma.StudentEnrollmentWhereInput =
      filters.divisionType === "SECONDARY" ? secondary : filters.divisionType === "PRIMARY" ? primary : { OR: [secondary, primary] };

    const baseWhere: Prisma.StudentEnrollmentWhereInput = { AND: [scopeWhere, divisionWhere, this.searchWhere(filters.search)] };
    const where: Prisma.StudentEnrollmentWhereInput = filters.sectionName
      ? { AND: [baseWhere, { section: { name: filters.sectionName } }] }
      : baseWhere;

    const [page, sections] = await Promise.all([
      this.paginateEnrollments(where, filters),
      // Section filter options — the real section names present in the
      // current result set (ignoring the section filter itself).
      this.prisma.section.findMany({
        where: { enrollments: { some: baseWhere } },
        select: { name: true },
        distinct: ["name"],
        orderBy: { name: "asc" },
      }),
    ]);
    return { ...page, facets: { sectionNames: sections.map((s) => s.name) } };
  }

  private primaryStatusWhere(status?: string): Prisma.StudentEnrollmentWhereInput {
    switch (status) {
      case "AWAITING":
        return { status: "COMPLETED", student: { currentStatus: "COMPLETED" } };
      case "ENROLLED_FORM1":
        return { status: "COMPLETED", promotionFrom: { some: { toEnrollmentId: { not: null } } } };
      case "TRANSFERRED_OUT":
        return { OR: [{ status: "TRANSFERRED_OUT" }, movedAfterFinishing("COMPLETED")] };
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
        return { OR: [{ status: "TRANSFERRED_OUT" }, movedAfterFinishing("GRADUATED")] };
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
          class: { select: { id: true, name: true, division: { select: { type: true } } } },
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
        class: { id: r.class.id, name: r.class.name },
        divisionType: r.class.division.type,
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

  // The school the new Form 1 enrollment is created in. `schoolId` (the path
  // param) is always the SOURCE school — the one holding the completed Class 8
  // enrollment. toSchoolId, when given and different, must be another school
  // of the SAME organization that the actor can also access; the student
  // record and their permanent Student ID are shared org-wide, so only the
  // enrollment row changes school.
  private async resolveDestinationSchoolId(actor: AuthenticatedUser, sourceSchoolId: string, toSchoolId?: string) {
    const source = await this.schools.findOneAccessibleOrThrow(actor, sourceSchoolId);
    if (!toSchoolId || toSchoolId === sourceSchoolId) return sourceSchoolId;
    const destination = await this.schools.findOneAccessibleOrThrow(actor, toSchoolId);
    if (destination.organizationId !== source.organizationId) {
      throw new BadRequestException("The destination school must belong to the same organization");
    }
    return destination.id;
  }

  // Student IDs are unique per (school, year, status). A permanent ID coming
  // from ANOTHER school could, rarely, collide with an ID the destination
  // school already issued for that year — reported per student here instead
  // of failing the whole transaction on the database constraint. Within the
  // same school the ID was issued by that school itself, so there is nothing
  // to check (unchanged same-school behaviour).
  private async studentNumbersTakenAt(
    sourceSchoolId: string,
    destSchoolId: string,
    academicYearId: string,
    studentNumbers: string[],
  ) {
    if (destSchoolId === sourceSchoolId || studentNumbers.length === 0) return new Set<string>();
    const taken = await this.prisma.studentEnrollment.findMany({
      where: { schoolId: destSchoolId, academicYearId, status: "ACTIVE", studentNumber: { in: studentNumbers } },
      select: { studentNumber: true },
    });
    return new Set(taken.map((t) => t.studentNumber));
  }

  async previewForm1Transition(actor: AuthenticatedUser, schoolId: string, dto: PreviewForm1TransitionDto) {
    const destSchoolId = await this.resolveDestinationSchoolId(actor, schoolId, dto.toSchoolId);
    const toYear = await this.getAcademicYearOrThrow(destSchoolId, dto.toAcademicYearId);
    const toClass = await this.getForm1ClassOrThrow(destSchoolId, dto.toClassId, dto.toAcademicYearId, toYear.name);

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: { id: { in: dto.enrollmentIds }, schoolId },
      include: { student: true, class: { include: { division: true } } },
    });
    const byId = new Map(enrollments.map((e) => [e.id, e]));
    const takenNumbers = await this.studentNumbersTakenAt(
      schoolId,
      destSchoolId,
      dto.toAcademicYearId,
      enrollments.map((e) => e.studentNumber),
    );

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
      if (takenNumbers.has(e.studentNumber)) {
        ineligible.push({
          enrollmentId: id,
          reason: `Student ID ${e.studentNumber} is already in use at the destination school for ${toYear.name}`,
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
          where: { sectionId: s.id, academicYearId: dto.toAcademicYearId, status: "ACTIVE" },
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
    const destSchoolId = await this.resolveDestinationSchoolId(actor, schoolId, dto.toSchoolId);
    const toYear = await this.getAcademicYearOrThrow(destSchoolId, dto.toAcademicYearId);
    const toClass = await this.getForm1ClassOrThrow(destSchoolId, dto.toClassId, dto.toAcademicYearId, toYear.name);

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

    const takenNumbers = await this.studentNumbersTakenAt(
      schoolId,
      destSchoolId,
      dto.toAcademicYearId,
      enrollments.map((e) => e.studentNumber),
    );
    if (takenNumbers.size > 0) {
      throw new BadRequestException(
        `Student ID ${[...takenNumbers].join(", ")} is already in use at the destination school for ${toYear.name}`,
      );
    }

    const incomingBySection = new Map<string, number>();
    for (const a of dto.assignments) {
      incomingBySection.set(a.sectionId, (incomingBySection.get(a.sectionId) ?? 0) + 1);
    }
    for (const section of sections) {
      if (section.capacity !== null) {
        const currentActive = await this.prisma.studentEnrollment.count({
          where: { sectionId: section.id, academicYearId: dto.toAcademicYearId, status: "ACTIVE" },
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
              schoolId: destSchoolId,
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
              ...(destSchoolId !== schoolId ? { toSchoolId: destSchoolId } : {}),
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

  // Undo a Graduation (Form 4) or Primary Completion (Class 8) that was
  // recorded by mistake: the finishing enrollment goes back to ACTIVE in the
  // very same school, year, class and section, the student back to ACTIVE,
  // and the promotion record of that outcome is removed so the student can be
  // progressed again later. Only while nothing has happened since — never
  // once the student continued to Form 1, transferred, was archived or holds
  // another active enrollment. The Student ID never changes; results,
  // attendance and history are untouched. Audited with the reason.
  async reverseFinalOutcome(actor: AuthenticatedUser, schoolId: string, enrollmentId: string, dto: ReverseFinalOutcomeDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const enrollment = await this.prisma.studentEnrollment.findFirst({
      where: { id: enrollmentId, schoolId },
      include: { student: true, academicYear: true, class: true, section: true, promotionFrom: true },
    });
    if (!enrollment) throw new NotFoundException("Enrollment not found in this school");

    if (enrollment.status !== "GRADUATED" && enrollment.status !== "COMPLETED") {
      throw new BadRequestException("Only a Graduated or Completed enrollment can be restored");
    }
    if (enrollment.student.currentStatus !== enrollment.status) {
      throw new BadRequestException(
        `This student has moved on since (currently ${enrollment.student.currentStatus}) — the ${enrollment.status.toLowerCase()} outcome can no longer be undone here`,
      );
    }
    const item = enrollment.promotionFrom[0] ?? null;
    if (item?.toEnrollmentId) {
      throw new BadRequestException("This student has already continued to Form 1 — the completion can no longer be undone here");
    }
    const otherActive = await this.prisma.studentEnrollment.findFirst({
      where: { studentId: enrollment.studentId, status: "ACTIVE" },
    });
    if (otherActive) {
      throw new BadRequestException("This student already has an active enrollment — the outcome can no longer be undone here");
    }
    const numberTaken = await this.prisma.studentEnrollment.findFirst({
      where: { schoolId, academicYearId: enrollment.academicYearId, studentNumber: enrollment.studentNumber, status: "ACTIVE" },
    });
    if (numberTaken) {
      throw new BadRequestException(`Student ID ${enrollment.studentNumber} is already active in ${enrollment.academicYear.name}`);
    }

    // Keep the old roll number unless another active student took it meanwhile.
    const rollTaken = await this.prisma.studentEnrollment.findFirst({
      where: {
        sectionId: enrollment.sectionId,
        academicYearId: enrollment.academicYearId,
        rollNumber: enrollment.rollNumber,
        status: "ACTIVE",
      },
    });
    let rollNumber = enrollment.rollNumber;
    if (rollTaken) {
      const max = await this.prisma.studentEnrollment.aggregate({
        where: { sectionId: enrollment.sectionId, academicYearId: enrollment.academicYearId, status: "ACTIVE" },
        _max: { rollNumber: true },
      });
      rollNumber = (max._max.rollNumber ?? 0) + 1;
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.studentEnrollment.update({
        where: { id: enrollment.id },
        data: { status: "ACTIVE", endDate: null, rollNumber },
      });
      await tx.student.update({ where: { id: enrollment.studentId }, data: { currentStatus: "ACTIVE" } });
      if (item) await tx.promotionItem.delete({ where: { id: item.id } });

      await this.audit.record(
        {
          actor,
          organizationId: actor.organizationId,
          schoolId,
          action: AuditAction.FINAL_OUTCOME_REVERSED,
          module: AuditModuleName.STUDENT_LIFECYCLE,
          resourceType: "StudentEnrollment",
          resourceId: enrollment.id,
          before: {
            enrollmentStatus: enrollment.status,
            studentStatus: enrollment.student.currentStatus,
            promotionBatchId: item?.batchId ?? null,
            rollNumber: enrollment.rollNumber,
          },
          after: {
            enrollmentStatus: "ACTIVE",
            studentStatus: "ACTIVE",
            class: enrollment.class.name,
            section: enrollment.section.name,
            academicYear: enrollment.academicYear.name,
            rollNumber,
            reason: dto.reason?.trim() || null,
          },
        },
        tx,
      );

      return {
        enrollmentId: enrollment.id,
        studentId: enrollment.studentId,
        restoredFrom: enrollment.status,
        academicYear: enrollment.academicYear.name,
        className: enrollment.class.name,
        sectionName: enrollment.section.name,
        rollNumber,
      };
    });
  }

  // The destination must be the Form 1 OF THE DESTINATION ACADEMIC YEAR: a
  // Form 1 of another year (or one with no year yet) is refused.
  private async getForm1ClassOrThrow(schoolId: string, classId: string, academicYearId: string, academicYearName?: string) {
    const toClass = await this.prisma.class.findFirst({
      where: { id: classId, level: 1, academicYearId, division: { schoolId, type: "SECONDARY" } },
      include: { sections: true },
    });
    if (!toClass) {
      throw new BadRequestException(
        `Target class must be a level-1 (Form 1) class of ${academicYearName ?? "the destination academic year"} in this school's Secondary division`,
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
