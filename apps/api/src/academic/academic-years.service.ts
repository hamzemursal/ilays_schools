import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction, AuditModuleName } from "../audit/audit-actions";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateAcademicYearDto } from "./dto/create-academic-year.dto";
import { UpdateAcademicYearDto } from "./dto/update-academic-year.dto";

@Injectable()
export class AcademicYearsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: AuthenticatedUser, schoolId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    return this.prisma.academicYear.findMany({ where: { schoolId }, orderBy: { startDate: "desc" } });
  }

  async create(actor: AuthenticatedUser, schoolId: string, dto: CreateAcademicYearDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.isCurrent) {
          await tx.academicYear.updateMany({ where: { schoolId, isCurrent: true }, data: { isCurrent: false } });
        }
        return tx.academicYear.create({
          data: {
            schoolId,
            name: dto.name,
            startDate: new Date(dto.startDate),
            endDate: new Date(dto.endDate),
            isCurrent: dto.isCurrent ?? false,
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("An academic year with this name already exists for this school");
      }
      throw error;
    }
  }

  async update(actor: AuthenticatedUser, schoolId: string, id: string, dto: UpdateAcademicYearDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const year = await this.prisma.academicYear.findFirst({ where: { id, schoolId } });
    if (!year) throw new NotFoundException("Academic year not found");

    return this.prisma.$transaction(async (tx) => {
      if (dto.isCurrent) {
        await tx.academicYear.updateMany({ where: { schoolId, isCurrent: true }, data: { isCurrent: false } });
      }
      return tx.academicYear.update({
        where: { id },
        data: { isCurrent: dto.isCurrent },
      });
    });
  }

  private async getOwnedYearOrThrow(actor: AuthenticatedUser, schoolId: string, id: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const year = await this.prisma.academicYear.findFirst({ where: { id, schoolId } });
    if (!year) throw new NotFoundException("Academic year not found");
    return year;
  }

  // Real counts only — no fabricated numbers. Classes and Sections are
  // deliberately excluded: they belong to a Division, not an AcademicYear,
  // and are reused across years (the same "Class 7" row carries different
  // StudentEnrollment rows year to year), so deleting one year never
  // deletes or even touches them.
  //
  // Invoices/Payments are counted through BOTH directions — an enrollment
  // in this year, or a fee structure defined for this year — since either
  // one alone would block the eventual delete (both are onDelete: Restrict
  // on Invoice) and an admin deserves to see the real total before
  // confirming, not just half of it.
  async getDeletionImpact(actor: AuthenticatedUser, schoolId: string, id: string) {
    const year = await this.getOwnedYearOrThrow(actor, schoolId, id);

    const [enrollmentIds, feeStructureIds] = await Promise.all([
      this.prisma.studentEnrollment.findMany({ where: { academicYearId: id }, select: { id: true } }),
      this.prisma.feeStructure.findMany({ where: { academicYearId: id }, select: { id: true } }),
    ]);
    const enrIds = enrollmentIds.map((e) => e.id);
    const feeIds = feeStructureIds.map((f) => f.id);

    const [
      enrollments,
      teacherAssignments,
      exams,
      examSubjects,
      results,
      attendanceRecords,
      feeStructures,
      invoices,
      payments,
      transfers,
      promotionItems,
    ] = await Promise.all([
      Promise.resolve(enrIds.length),
      this.prisma.teacherAssignment.count({ where: { academicYearId: id } }),
      this.prisma.exam.count({ where: { academicYearId: id } }),
      this.prisma.examSubject.count({ where: { exam: { academicYearId: id } } }),
      this.prisma.result.count({ where: { enrollment: { academicYearId: id } } }),
      this.prisma.attendance.count({ where: { enrollment: { academicYearId: id } } }),
      Promise.resolve(feeIds.length),
      this.prisma.invoice.count({
        where: { OR: [{ enrollmentId: { in: enrIds } }, { feeStructureId: { in: feeIds } }] },
      }),
      this.prisma.payment.count({
        where: { invoice: { OR: [{ enrollmentId: { in: enrIds } }, { feeStructureId: { in: feeIds } }] } },
      }),
      this.prisma.transfer.count({ where: { fromEnrollment: { academicYearId: id } } }),
      this.prisma.promotionItem.count({ where: { fromEnrollment: { academicYearId: id } } }),
    ]);

    const counts = {
      enrollments,
      teacherAssignments,
      exams,
      examSubjects,
      results,
      attendanceRecords,
      feeStructures,
      invoices,
      payments,
      transfers,
      promotionItems,
    };

    return {
      academicYear: { id: year.id, name: year.name, isCurrent: year.isCurrent },
      counts,
      hasAnyData: Object.values(counts).some((c) => c > 0),
    };
  }

  // Genuine permanent deletion, including everything the year owns — per
  // product decision, an AcademicYear is never blocked from deletion just
  // because it has history (unlike School/Class/Section elsewhere in this
  // app). StudentEnrollment.academicYear and Invoice's two parents are all
  // onDelete: Restrict, so Postgres would otherwise refuse this outright;
  // every step below exists only to clear those specific blockers, in the
  // order they'd actually fail in, before the final delete. Everything
  // else (TeacherAssignment, Exam→ExamSubject→Result, FeeStructure,
  // Attendance) is onDelete: Cascade and needs no manual handling.
  async remove(actor: AuthenticatedUser, schoolId: string, id: string) {
    const year = await this.getOwnedYearOrThrow(actor, schoolId, id);

    // Same reasoning as SchoolsService.remove()'s explicit timeout: this
    // clears several Restrict-blockers in sequence before the final delete,
    // and Prisma's 5s interactive-transaction default has been observed to
    // be too tight for that many round trips.
    await this.prisma.$transaction(async (tx) => {
      const enrollments = await tx.studentEnrollment.findMany({ where: { academicYearId: id }, select: { id: true } });
      const feeStructures = await tx.feeStructure.findMany({ where: { academicYearId: id }, select: { id: true } });
      const enrIds = enrollments.map((e) => e.id);
      const feeIds = feeStructures.map((f) => f.id);

      const invoices = await tx.invoice.findMany({
        where: { OR: [{ enrollmentId: { in: enrIds } }, { feeStructureId: { in: feeIds } }] },
        select: { id: true },
      });
      const invoiceIds = invoices.map((i) => i.id);

      // Restrict-blockers, cleared in the order they'd otherwise fail:
      // Payment -> Invoice, then Transfer/PromotionItem -> StudentEnrollment.
      await tx.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
      await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
      await tx.transfer.deleteMany({ where: { fromEnrollmentId: { in: enrIds } } });
      await tx.promotionItem.deleteMany({ where: { fromEnrollmentId: { in: enrIds } } });

      // Cascades Attendance and Result automatically.
      await tx.studentEnrollment.deleteMany({ where: { academicYearId: id } });

      // Cascades TeacherAssignment, Exam -> ExamSubject -> Result, and
      // FeeStructure (now unblocked) automatically.
      await tx.academicYear.delete({ where: { id } });

      await this.audit.record(
        {
          actor,
          organizationId: actor.organizationId,
          schoolId,
          action: AuditAction.ACADEMIC_YEAR_DELETED,
          module: AuditModuleName.ACADEMIC,
          resourceType: "AcademicYear",
          resourceId: id,
          resourceName: year.name,
          severity: "CRITICAL",
          before: { name: year.name, isCurrent: year.isCurrent },
        },
        tx,
      );
    }, { timeout: 30_000 });

    return { success: true };
  }
}
