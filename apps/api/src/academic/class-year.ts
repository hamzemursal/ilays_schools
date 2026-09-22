import { BadRequestException } from "@nestjs/common";
import type { AcademicYear, Prisma } from "@school-erp/database";

// Classes (and through them sections) belong to ONE academic year: the same
// school has its own "Form 3" for 2025-2026 and another for 2026-2027. These
// are the only helpers the rest of the backend needs to respect that, so no
// service invents its own year rule.
//
// While the rollout is staged (Phase 5B), a class that predates the change can
// still have a NULL academicYearId until class_year_backfill() has run. The
// rule that keeps this safe:
//   * READS tolerate such "unstamped" classes (classYearReadWhere) so nothing
//     disappears from a screen before the backfill;
//   * every WRITE that ties a class to a year-specific record (an enrollment,
//     an exam subject, a fee, an assignment, a promotion, a transfer ...) goes
//     through assertClassInYear and REFUSES an unstamped class.

type YearDb = { academicYear: { findFirst: (args: Prisma.AcademicYearFindFirstArgs) => Promise<AcademicYear | null> } };

// The school's academic year for a request:
//   * an explicit id must belong to the school (BadRequest otherwise);
//   * no id -> the CURRENT academic year;
//   * no current year -> the LATEST year (by start date), so a school between
//     years still has a sensible default;
//   * null only when the school has no academic year at all.
export async function resolveSchoolYear(db: YearDb, schoolId: string, academicYearId?: string | null): Promise<AcademicYear | null> {
  if (academicYearId) {
    const year = await db.academicYear.findFirst({ where: { id: academicYearId, schoolId } });
    if (!year) throw new BadRequestException("That academic year does not belong to this school");
    return year;
  }
  const current = await db.academicYear.findFirst({ where: { schoolId, isCurrent: true } });
  if (current) return current;
  return db.academicYear.findFirst({ where: { schoolId }, orderBy: { startDate: "desc" } });
}

// Where-clause for READ queries over classes of one year. It also matches
// classes that are still unstamped (legacy, before the backfill), never another
// year's classes.
export function classYearReadWhere(academicYearId: string): Prisma.ClassWhereInput {
  return { OR: [{ academicYearId }, { academicYearId: null }] };
}

type YearedClass = { name: string; academicYearId: string | null };

// The write-side guard: this class must belong to exactly this academic year.
export function assertClassInYear(cls: YearedClass, academicYearId: string, academicYearName?: string): void {
  assertClassStamped(cls);
  if (cls.academicYearId !== academicYearId) {
    const year = academicYearName ? ` (${academicYearName})` : "";
    throw new BadRequestException(
      `${cls.name} belongs to a different academic year than the selected one${year}. Choose the ${cls.name} of that year.`,
    );
  }
}

// A class with no academic year yet cannot take part in any year-specific write.
export function assertClassStamped(cls: YearedClass): void {
  if (cls.academicYearId === null || cls.academicYearId === undefined) {
    throw new BadRequestException(
      `${cls.name} has no academic year yet. Run the class year backfill (class_year_backfill) before changing anything that involves it.`,
    );
  }
}
