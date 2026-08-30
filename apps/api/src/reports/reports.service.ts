import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
  ) {}

  // Per class/section active-enrollment counts for one academic year —
  // reuses StudentEnrollment exactly as the rest of the app does, no new
  // aggregation model.
  async enrollmentByClass(actor: AuthenticatedUser, schoolId: string, academicYearId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const classes = await this.prisma.class.findMany({
      where: { division: { schoolId } },
      include: {
        sections: {
          include: { _count: { select: { enrollments: { where: { academicYearId, status: "ACTIVE" } } } } },
        },
      },
      orderBy: [{ division: { type: "asc" } }, { level: "asc" }],
    });

    return classes.map((c) => ({
      classId: c.id,
      className: c.name,
      sections: c.sections.map((s) => ({ sectionId: s.id, sectionName: s.name, enrolled: s._count.enrollments })),
      totalEnrolled: c.sections.reduce((sum, s) => sum + s._count.enrollments, 0),
    }));
  }

  // Per class/section attendance totals for a date range within one
  // academic year — a single groupBy rather than N per-section calls, since
  // this covers every section in the school at once.
  async attendanceByClass(
    actor: AuthenticatedUser,
    schoolId: string,
    academicYearId: string,
    from?: string,
    to?: string,
  ) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const sections = await this.prisma.section.findMany({
      where: { class: { division: { schoolId } } },
      include: { class: true },
    });

    const dateFilter =
      from || to ? { date: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {};

    const groups = await this.prisma.attendance.groupBy({
      by: ["status", "enrollmentId"],
      where: {
        ...dateFilter,
        enrollment: { schoolId, academicYearId },
      },
      _count: true,
    });

    // Map enrollmentId -> sectionId so counts can be rolled up per section
    // without re-querying attendance per section.
    const enrollmentIds = [...new Set(groups.map((g) => g.enrollmentId))];
    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: { id: { in: enrollmentIds } },
      select: { id: true, sectionId: true },
    });
    const sectionByEnrollment = new Map(enrollments.map((e) => [e.id, e.sectionId]));

    const bySection = new Map<string, { present: number; absent: number; late: number; excused: number }>();
    for (const g of groups) {
      const sectionId = sectionByEnrollment.get(g.enrollmentId);
      if (!sectionId) continue;
      const bucket = bySection.get(sectionId) ?? { present: 0, absent: 0, late: 0, excused: 0 };
      if (g.status === "PRESENT") bucket.present += g._count;
      else if (g.status === "ABSENT") bucket.absent += g._count;
      else if (g.status === "LATE") bucket.late += g._count;
      else if (g.status === "EXCUSED") bucket.excused += g._count;
      bySection.set(sectionId, bucket);
    }

    return sections.map((s) => {
      const counts = bySection.get(s.id) ?? { present: 0, absent: 0, late: 0, excused: 0 };
      const total = counts.present + counts.absent + counts.late + counts.excused;
      return { sectionId: s.id, sectionName: s.name, className: s.class.name, total, ...counts };
    });
  }
}
