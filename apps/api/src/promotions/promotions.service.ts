import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { ExamsService } from "../exams/exams.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction, AuditModuleName } from "../audit/audit-actions";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { PromoteSectionDto } from "./dto/promote-section.dto";
import { assertClassInYear } from "../academic/class-year";

type NaturalOutcome = "PROMOTED" | "COMPLETED" | "GRADUATED";

// The same confirm() write path handles three different real-world events —
// an ordinary same-division promotion, a Primary division running out of
// classes (Primary Completion), and a Secondary division running out of
// classes (Secondary Graduation). Only the audit trail needs to tell these
// apart; the transaction/roll-number/capacity logic below is identical
// either way, so this is the one place that decides which label applies.
// RETAINED is always its own distinct action regardless of the section's
// natural outcome — a student can be retained whether their section as a
// whole would otherwise promote, complete, or graduate.
const AUDIT_ACTION_BY_NATURAL_OUTCOME: Record<NaturalOutcome, string> = {
  PROMOTED: AuditAction.PROMOTION_CONFIRMED,
  COMPLETED: AuditAction.PRIMARY_COMPLETION,
  GRADUATED: AuditAction.SECONDARY_GRADUATION,
};

// The last class of each division, per the school's own structure (Class.level
// is documented as 1..8 Primary / 1..4 Secondary). Finishing the division
// (Primary Completion / Graduation) is only ever possible from THIS class —
// never inferred from "no next class exists", which would let a missing
// Form 3 turn every Form 2 student into a graduate.
const FINAL_LEVEL_BY_DIVISION = { PRIMARY: 8, SECONDARY: 4 } as const;

export interface SectionWithCapacity {
  id: string;
  name: string;
  capacity: number | null;
  currentActive: number;
  available: number | null;
}

@Injectable()
export class PromotionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly exams: ExamsService,
    private readonly audit: AuditService,
  ) {}

  // The plan for promoting ONE section's cohort of `fromAcademicYearId` into
  // `toYear`. Classes are academic-year scoped, so:
  //   * the source section's class must belong to the year being promoted from;
  //   * PROMOTED students move into the class one level up IN THE DESTINATION
  //     year (nextClass);
  //   * RETAINED students stay on the SAME level but in the DESTINATION year
  //     (retainedClass) - never back on the old year's class;
  //   * a class that does not exist in the destination year is reported, never
  //     silently replaced by an old-year one.
  // toYear is null only for a preview when the school has no later year yet.
  private async resolvePlan(
    schoolId: string,
    sectionId: string,
    fromAcademicYearId: string,
    toYear: { id: string; name: string } | null,
  ) {
    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, class: { division: { schoolId } } },
      include: { class: { include: { division: true } } },
    });
    if (!section) throw new NotFoundException("Section not found in this school");
    assertClassInYear(section.class, fromAcademicYearId);

    const divisionType = section.class.division.type;
    const isFinalClass = section.class.level >= FINAL_LEVEL_BY_DIVISION[divisionType];

    let nextClass: { id: string; name: string; academicYearId: string | null } | null = null;
    let retainedClass: { id: string; name: string; academicYearId: string | null } | null = null;
    if (toYear) {
      retainedClass = await this.prisma.class.findFirst({
        where: { divisionId: section.class.divisionId, level: section.class.level, academicYearId: toYear.id },
      });
      // Only the division's real final class can finish it. Every other class
      // MUST have a next class set up in the destination year - if it doesn't,
      // that's an incomplete structure the Admin needs to fix first, not a
      // graduation.
      if (!isFinalClass) {
        nextClass = await this.prisma.class.findFirst({
          where: { divisionId: section.class.divisionId, level: section.class.level + 1, academicYearId: toYear.id },
        });
        if (!nextClass) {
          const nextName = `${divisionType === "PRIMARY" ? "Class" : "Form"} ${section.class.level + 1}`;
          throw new BadRequestException(
            `${section.class.name} can't be promoted yet - ${nextName} has not been created for ${toYear.name}. Create ${nextName} (with its sections) in that academic year first.`,
          );
        }
        assertClassInYear(nextClass, toYear.id, toYear.name);
      }
      if (retainedClass) assertClassInYear(retainedClass, toYear.id, toYear.name);
    }

    const naturalOutcome: NaturalOutcome = !isFinalClass ? "PROMOTED" : divisionType === "PRIMARY" ? "COMPLETED" : "GRADUATED";

    return { section, currentClass: section.class, nextClass, retainedClass, naturalOutcome };
  }

  // A capacity is only ever compared with the ACTIVE roster of the DESTINATION
  // academic year.
  private async sectionsWithCapacity(classId: string, academicYearId: string): Promise<SectionWithCapacity[]> {
    const sections = await this.prisma.section.findMany({ where: { classId } });
    return Promise.all(
      sections.map(async (s) => {
        const currentActive = await this.prisma.studentEnrollment.count({
          where: { sectionId: s.id, academicYearId, status: "ACTIVE" },
        });
        // null capacity means unlimited — available has no ceiling either.
        return {
          id: s.id,
          name: s.name,
          capacity: s.capacity,
          currentActive,
          available: s.capacity === null ? null : s.capacity - currentActive,
        };
      }),
    );
  }

  // Per-student review data: each active enrollment's real Term 1/Term 2/
  // Annual result (from ExamsService — never recomputed here, never a
  // second source of truth) plus the outcome the system suggests, which the
  // Admin reviews and can override entirely in confirm() below. Eligible
  // students are suggested this section's natural outcome (promote/complete/
  // graduate); ineligible students are suggested RETAINED; a student with an
  // Incomplete annual result gets no suggestion at all — the Admin must
  // decide explicitly rather than the system guessing at missing data.
  // toAcademicYearId is optional: without it the next LATER academic year of
  // the school is used, and if there is none the preview still shows each
  // student's results but offers no destination sections.
  async preview(
    actor: AuthenticatedUser,
    schoolId: string,
    sectionId: string,
    fromAcademicYearId: string,
    toAcademicYearId?: string,
  ) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const fromYear = await this.prisma.academicYear.findFirst({ where: { id: fromAcademicYearId, schoolId } });
    if (!fromYear) throw new BadRequestException("That academic year does not belong to this school");

    let toYear: { id: string; name: string } | null;
    if (toAcademicYearId) {
      const year = await this.prisma.academicYear.findFirst({ where: { id: toAcademicYearId, schoolId } });
      if (!year) throw new BadRequestException("That academic year does not belong to this school");
      if (year.id === fromYear.id || year.startDate <= fromYear.startDate) {
        throw new BadRequestException("The destination academic year must be a later year than the one being promoted from");
      }
      toYear = year;
    } else {
      toYear = await this.prisma.academicYear.findFirst({
        where: { schoolId, startDate: { gt: fromYear.startDate } },
        orderBy: { startDate: "asc" },
      });
    }

    const { currentClass, nextClass, retainedClass, naturalOutcome } = await this.resolvePlan(
      schoolId,
      sectionId,
      fromAcademicYearId,
      toYear,
    );

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: { sectionId, academicYearId: fromAcademicYearId, status: "ACTIVE" },
      include: { student: true },
      orderBy: { rollNumber: "asc" },
    });

    const students = await Promise.all(
      enrollments.map(async (e) => {
        const { term1Percentage, term2Percentage, annualPercentage, eligible } = await this.exams.getAnnualResult(
          e.id,
          fromAcademicYearId,
        );
        const suggestedOutcome = eligible === null ? null : eligible ? naturalOutcome : "RETAINED";

        return {
          studentId: e.studentId,
          enrollmentId: e.id,
          firstName: e.student.firstName,
          lastName: e.student.lastName,
          rollNumber: e.rollNumber,
          studentNumber: e.studentNumber,
          term1Percentage,
          term2Percentage,
          annualPercentage,
          eligible,
          suggestedOutcome,
        };
      }),
    );

    const warnings: string[] = [];
    if (!toYear) warnings.push("There is no later academic year yet. Create the destination academic year first - Promotion never creates one.");
    else if (!retainedClass) {
      warnings.push(`${currentClass.name} has not been created for ${toYear.name}, so students cannot be retained until it is.`);
    }

    // currentClassSections is the pool for RETAINED students (the same level,
    // in the DESTINATION year); nextClassSections the pool for PROMOTED ones.
    const [retainedClassSections, nextClassSections] = await Promise.all([
      toYear && retainedClass ? this.sectionsWithCapacity(retainedClass.id, toYear.id) : Promise.resolve([]),
      toYear && nextClass ? this.sectionsWithCapacity(nextClass.id, toYear.id) : Promise.resolve([]),
    ]);

    return {
      naturalOutcome,
      currentClass: { id: currentClass.id, name: currentClass.name },
      nextClass: nextClass ? { id: nextClass.id, name: nextClass.name } : null,
      retainedClass: retainedClass ? { id: retainedClass.id, name: retainedClass.name } : null,
      targetAcademicYear: toYear ? { id: toYear.id, name: toYear.name } : null,
      currentClassSections: retainedClassSections,
      nextClassSections,
      warnings,
      students,
    };
  }

  async confirm(actor: AuthenticatedUser, schoolId: string, sectionId: string, dto: PromoteSectionDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    // Promotion never creates an academic year — the Admin must have already
    // created the destination year (and prepared its classes/sections).
    const [fromAcademicYear, toAcademicYear] = await Promise.all([
      this.prisma.academicYear.findFirst({ where: { id: dto.fromAcademicYearId, schoolId } }),
      this.prisma.academicYear.findFirst({ where: { id: dto.toAcademicYearId, schoolId } }),
    ]);
    if (!fromAcademicYear) throw new BadRequestException("That academic year does not belong to this school");
    if (!toAcademicYear) {
      throw new BadRequestException(
        "The destination academic year doesn't exist in this school. Create it first — Promotion never creates a new academic year.",
      );
    }
    if (toAcademicYear.id === fromAcademicYear.id || toAcademicYear.startDate <= fromAcademicYear.startDate) {
      throw new BadRequestException("The destination academic year must be a later year than the one being promoted from");
    }

    // Source class must be of the year being promoted; PROMOTED targets come
    // from the destination year's next level, RETAINED from its same level.
    const { currentClass, nextClass, retainedClass, naturalOutcome } = await this.resolvePlan(
      schoolId,
      sectionId,
      dto.fromAcademicYearId,
      toAcademicYear,
    );

    if (dto.assignments.length === 0) {
      throw new BadRequestException("At least one student assignment is required");
    }
    const enrollmentIds = dto.assignments.map((a) => a.enrollmentId);
    if (new Set(enrollmentIds).size !== enrollmentIds.length) {
      throw new BadRequestException("The same enrollment can't be assigned twice");
    }

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: { id: { in: enrollmentIds }, sectionId, academicYearId: dto.fromAcademicYearId, status: "ACTIVE" },
    });
    if (enrollments.length !== enrollmentIds.length) {
      throw new BadRequestException(
        "One or more enrollments are not active students in this section for that academic year",
      );
    }
    const enrollmentById = new Map(enrollments.map((e) => [e.id, e]));

    const [retainedSectionIds, nextClassSectionIds] = await Promise.all([
      retainedClass
        ? this.prisma.section.findMany({ where: { classId: retainedClass.id } }).then((s) => new Set(s.map((x) => x.id)))
        : Promise.resolve(new Set<string>()),
      nextClass
        ? this.prisma.section.findMany({ where: { classId: nextClass.id } }).then((s) => new Set(s.map((x) => x.id)))
        : Promise.resolve(new Set<string>()),
    ]);

    // Validate every assignment's outcome against real structural
    // constraints before touching the database, and tally how many
    // students are headed into each target section for a single capacity
    // check per section (not per student).
    const incomingBySection = new Map<string, number>();
    for (const a of dto.assignments) {
      // The only outcomes a class can produce are its own natural one or
      // RETAINED — a Form 2 student can never be sent as GRADUATED (or
      // COMPLETED), whatever the client asks for.
      if (a.outcome !== "RETAINED" && a.outcome !== naturalOutcome) {
        throw new BadRequestException(`${currentClass.name} students can only be ${naturalOutcome.toLowerCase()} or retained`);
      }
      if (a.outcome === "PROMOTED") {
        if (!nextClass) {
          throw new BadRequestException("There is no next class to promote into — use COMPLETED or GRADUATED instead");
        }
        if (!a.targetSectionId || !nextClassSectionIds.has(a.targetSectionId)) {
          throw new BadRequestException(`A valid section in ${nextClass.name} is required to promote this student`);
        }
        incomingBySection.set(a.targetSectionId, (incomingBySection.get(a.targetSectionId) ?? 0) + 1);
      } else if (a.outcome === "RETAINED") {
        if (!retainedClass) {
          throw new BadRequestException(
            `${currentClass.name} has not been created for ${toAcademicYear.name}. Create it (with its sections) in that academic year before retaining students.`,
          );
        }
        if (!a.targetSectionId || !retainedSectionIds.has(a.targetSectionId)) {
          throw new BadRequestException(
            `A valid section in ${retainedClass.name} (${toAcademicYear.name}) is required to retain this student`,
          );
        }
        incomingBySection.set(a.targetSectionId, (incomingBySection.get(a.targetSectionId) ?? 0) + 1);
      }
      // COMPLETED / GRADUATED: no target section, no new enrollment.
    }

    // A student whose Annual Result is below the pass mark can only be
    // retained — never promoted, completed or graduated, whatever the client
    // sent. (Incomplete results are left to the Admin's explicit decision.)
    const advancing = dto.assignments.filter((a) => a.outcome !== "RETAINED");
    const annualResults = await Promise.all(
      advancing.map((a) => this.exams.getAnnualResult(a.enrollmentId, dto.fromAcademicYearId)),
    );
    const belowPassMark = advancing.filter((_, i) => annualResults[i].eligible === false);
    if (belowPassMark.length > 0) {
      throw new BadRequestException(
        `${belowPassMark.length} student(s) have an Annual Result below 50% and can only be retained, not promoted or graduated`,
      );
    }

    for (const [targetSectionId, incoming] of incomingBySection) {
      const section = await this.prisma.section.findUniqueOrThrow({ where: { id: targetSectionId } });
      if (section.capacity !== null) {
        // Only the DESTINATION academic year's roster counts against capacity.
        const currentActive = await this.prisma.studentEnrollment.count({
          where: { sectionId: targetSectionId, academicYearId: dto.toAcademicYearId, status: "ACTIVE" },
        });
        if (currentActive + incoming > section.capacity) {
          throw new BadRequestException(
            `Target section ${section.name} doesn't have room for ${incoming} more student(s) ` +
              `(capacity ${section.capacity}, currently ${currentActive})`,
          );
        }
      }
    }

    // Explicit timeout for the same reason as the other multi-step
    // bulk transactions in this codebase: a per-enrollment loop can run
    // past Prisma's 5s interactive-transaction default for a large section.
    return this.prisma.$transaction(
      async (tx) => {
        const batch = await tx.promotionBatch.create({
          data: {
            schoolId,
            fromAcademicYearId: dto.fromAcademicYearId,
            toAcademicYearId: dto.toAcademicYearId,
            initiatedByUserId: actor.id,
            status: "CONFIRMED",
            confirmedAt: new Date(),
          },
        });

        // Roll numbers are scoped by toAcademicYearId — a section reused
        // across years resets its numbering each year rather than carrying
        // it forward (see StudentsService.generateRollNumber for the same
        // rule) — tracked per target section since promoted and retained
        // students can land in different sections within the same batch.
        const nextRollBySection = new Map<string, number>();
        const nextRollFor = async (targetSectionId: string) => {
          if (!nextRollBySection.has(targetSectionId)) {
            const maxRoll = await tx.studentEnrollment.aggregate({
              where: { sectionId: targetSectionId, academicYearId: dto.toAcademicYearId, status: "ACTIVE" },
              _max: { rollNumber: true },
            });
            nextRollBySection.set(targetSectionId, (maxRoll._max.rollNumber ?? 0) + 1);
          }
          const roll = nextRollBySection.get(targetSectionId)!;
          nextRollBySection.set(targetSectionId, roll + 1);
          return roll;
        };

        const outcomeCounts: Record<string, number> = {};

        for (const a of dto.assignments) {
          const enrollment = enrollmentById.get(a.enrollmentId)!;
          await tx.studentEnrollment.update({
            where: { id: enrollment.id },
            data: { status: a.outcome, endDate: new Date() },
          });

          let toEnrollmentId: string | null = null;
          if (a.outcome === "PROMOTED" || a.outcome === "RETAINED") {
            // Never the old year's class: both come from the destination year.
            const targetClassId = a.outcome === "PROMOTED" ? nextClass!.id : retainedClass!.id;
            const roll = await nextRollFor(a.targetSectionId!);
            const created = await tx.studentEnrollment.create({
              data: {
                studentId: enrollment.studentId,
                organizationId: enrollment.organizationId,
                schoolId,
                academicYearId: dto.toAcademicYearId,
                classId: targetClassId,
                sectionId: a.targetSectionId!,
                // Student number carries over across years by design — see
                // the schema comment on this constraint's per-year scope.
                studentNumber: enrollment.studentNumber,
                rollNumber: roll,
                status: "ACTIVE",
              },
            });
            toEnrollmentId = created.id;
          } else {
            // COMPLETED or GRADUATED — no new enrollment; the student
            // becomes Primary Completed / Graduated org-wide, surfaced via
            // Student Lifecycle until (if ever) re-enrolled.
            await tx.student.update({ where: { id: enrollment.studentId }, data: { currentStatus: a.outcome } });
          }

          await tx.promotionItem.create({
            data: {
              batchId: batch.id,
              studentId: enrollment.studentId,
              fromEnrollmentId: enrollment.id,
              toEnrollmentId,
              outcome: a.outcome,
            },
          });

          outcomeCounts[a.outcome] = (outcomeCounts[a.outcome] ?? 0) + 1;
        }

        const retainedCount = outcomeCounts.RETAINED ?? 0;
        const naturalOutcomeCount = outcomeCounts[naturalOutcome] ?? 0;

        if (naturalOutcomeCount > 0) {
          await this.audit.record(
            {
              actor,
              organizationId: actor.organizationId,
              schoolId,
              action: AUDIT_ACTION_BY_NATURAL_OUTCOME[naturalOutcome],
              module: naturalOutcome === "PROMOTED" ? AuditModuleName.PROMOTIONS : AuditModuleName.STUDENT_LIFECYCLE,
              resourceType: "PromotionBatch",
              resourceId: batch.id,
              after: { outcome: naturalOutcome, studentCount: naturalOutcomeCount, fromClass: currentClass.name, toClass: nextClass?.name ?? null },
            },
            tx,
          );
        }
        if (retainedCount > 0) {
          await this.audit.record(
            {
              actor,
              organizationId: actor.organizationId,
              schoolId,
              action: AuditAction.STUDENT_RETAINED,
              module: AuditModuleName.PROMOTIONS,
              resourceType: "PromotionBatch",
              resourceId: batch.id,
              after: { outcome: "RETAINED", studentCount: retainedCount, class: currentClass.name, toAcademicYear: toAcademicYear.name },
            },
            tx,
          );
        }

        return tx.promotionBatch.findUniqueOrThrow({ where: { id: batch.id }, include: { items: true } });
      },
      { timeout: 30_000 },
    );
  }
}
