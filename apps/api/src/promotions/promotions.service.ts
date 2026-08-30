import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { PromoteSectionDto } from "./dto/promote-section.dto";

type Outcome = "PROMOTED" | "COMPLETED" | "GRADUATED";

@Injectable()
export class PromotionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
  ) {}

  private async resolvePlan(schoolId: string, sectionId: string) {
    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, class: { division: { schoolId } } },
      include: { class: { include: { division: true } } },
    });
    if (!section) throw new NotFoundException("Section not found in this school");

    const nextClass = await this.prisma.class.findFirst({
      where: { divisionId: section.class.divisionId, level: section.class.level + 1 },
    });

    const outcome: Outcome = nextClass
      ? "PROMOTED"
      : section.class.division.type === "PRIMARY"
        ? "COMPLETED"
        : "GRADUATED";

    return { section, currentClass: section.class, nextClass, outcome };
  }

  async preview(actor: AuthenticatedUser, schoolId: string, sectionId: string, fromAcademicYearId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const { currentClass, nextClass, outcome } = await this.resolvePlan(schoolId, sectionId);

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: { sectionId, academicYearId: fromAcademicYearId, status: "ACTIVE" },
      include: { student: true },
      orderBy: { rollNumber: "asc" },
    });

    let targetSections: {
      id: string;
      name: string;
      capacity: number | null;
      currentActive: number;
      available: number | null;
    }[] = [];
    if (outcome === "PROMOTED" && nextClass) {
      const sections = await this.prisma.section.findMany({ where: { classId: nextClass.id } });
      targetSections = await Promise.all(
        sections.map(async (s) => {
          const currentActive = await this.prisma.studentEnrollment.count({
            where: { sectionId: s.id, status: "ACTIVE" },
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

    return {
      outcome,
      currentClass: { id: currentClass.id, name: currentClass.name },
      nextClass: nextClass ? { id: nextClass.id, name: nextClass.name } : null,
      targetSections,
      students: enrollments.map((e) => ({
        studentId: e.studentId,
        enrollmentId: e.id,
        firstName: e.student.firstName,
        lastName: e.student.lastName,
        rollNumber: e.rollNumber,
        studentNumber: e.studentNumber,
      })),
    };
  }

  async confirm(actor: AuthenticatedUser, schoolId: string, sectionId: string, dto: PromoteSectionDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const { currentClass, nextClass, outcome } = await this.resolvePlan(schoolId, sectionId);

    const toAcademicYear = await this.prisma.academicYear.findFirst({
      where: { id: dto.toAcademicYearId, schoolId },
    });
    if (!toAcademicYear) throw new BadRequestException("That academic year does not belong to this school");

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: { sectionId, academicYearId: dto.fromAcademicYearId, status: "ACTIVE" },
    });
    if (enrollments.length === 0) {
      throw new BadRequestException("No active students in this section for that academic year");
    }

    let targetSection: { id: string; name: string; capacity: number | null } | null = null;
    if (outcome === "PROMOTED") {
      if (!dto.targetSectionId) {
        throw new BadRequestException("targetSectionId is required when promoting to a next class");
      }
      targetSection = await this.prisma.section.findFirst({
        where: { id: dto.targetSectionId, classId: nextClass!.id },
      });
      if (!targetSection) throw new BadRequestException("That section does not belong to the target class");

      if (targetSection.capacity !== null) {
        const activeCount = await this.prisma.studentEnrollment.count({
          where: { sectionId: targetSection.id, status: "ACTIVE" },
        });
        if (activeCount + enrollments.length > targetSection.capacity) {
          throw new BadRequestException(
            `Target section ${targetSection.name} doesn't have room for ${enrollments.length} more student(s) ` +
              `(capacity ${targetSection.capacity}, currently ${activeCount})`,
          );
        }
      }
    }

    return this.prisma.$transaction(async (tx) => {
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

      let nextRoll = 0;
      if (targetSection) {
        const maxRoll = await tx.studentEnrollment.aggregate({
          where: { sectionId: targetSection.id, status: "ACTIVE" },
          _max: { rollNumber: true },
        });
        nextRoll = (maxRoll._max.rollNumber ?? 0) + 1;
      }

      for (const enrollment of enrollments) {
        await tx.studentEnrollment.update({
          where: { id: enrollment.id },
          data: { status: outcome, endDate: new Date() },
        });

        let toEnrollmentId: string | null = null;
        if (outcome === "PROMOTED" && targetSection) {
          const created = await tx.studentEnrollment.create({
            data: {
              studentId: enrollment.studentId,
              organizationId: enrollment.organizationId,
              schoolId,
              academicYearId: dto.toAcademicYearId,
              classId: nextClass!.id,
              sectionId: targetSection.id,
              // Student number carries over across years by design — see the
              // schema comment on this constraint's per-year scope.
              studentNumber: enrollment.studentNumber,
              rollNumber: nextRoll++,
              status: "ACTIVE",
            },
          });
          toEnrollmentId = created.id;
        } else if (outcome === "COMPLETED" || outcome === "GRADUATED") {
          await tx.student.update({ where: { id: enrollment.studentId }, data: { currentStatus: outcome } });
        }

        await tx.promotionItem.create({
          data: {
            batchId: batch.id,
            studentId: enrollment.studentId,
            fromEnrollmentId: enrollment.id,
            toEnrollmentId,
            outcome,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          schoolId,
          actorUserId: actor.id,
          action: "promotion.confirm",
          resource: "PromotionBatch",
          resourceId: batch.id,
          after: {
            outcome,
            studentCount: enrollments.length,
            fromClass: currentClass.name,
            toClass: nextClass?.name ?? null,
          },
        },
      });

      return tx.promotionBatch.findUniqueOrThrow({ where: { id: batch.id }, include: { items: true } });
    });
  }
}
