import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
  ) {}

  async getSummary(actor: AuthenticatedUser, schoolId: string, academicYearId?: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const years = await this.prisma.academicYear.findMany({ where: { schoolId } });
    const year = academicYearId
      ? years.find((y) => y.id === academicYearId)
      : (years.find((y) => y.isCurrent) ?? years[0]);

    const [classCount, sectionCount, subjectCount, teacherActive, teacherInactive] = await Promise.all([
      this.prisma.class.count({ where: { division: { schoolId } } }),
      this.prisma.section.count({ where: { class: { division: { schoolId } } } }),
      this.prisma.subject.count({ where: { schoolId } }),
      this.prisma.teacher.count({ where: { schoolId, status: "ACTIVE" } }),
      this.prisma.teacher.count({ where: { schoolId, status: { not: "ACTIVE" } } }),
    ]);

    const enrollment = { total: 0, male: 0, female: 0 };
    let hasStudentEnrollment = false;
    let hasTeacherAssignments = false;

    if (year) {
      const [enrollments, assignmentCount] = await Promise.all([
        this.prisma.studentEnrollment.findMany({
          where: { schoolId, academicYearId: year.id, status: "ACTIVE" },
          include: { student: { select: { sex: true } } },
        }),
        this.prisma.teacherAssignment.count({ where: { schoolId, academicYearId: year.id } }),
      ]);
      enrollment.total = enrollments.length;
      enrollment.male = enrollments.filter((e) => e.student.sex === "MALE").length;
      enrollment.female = enrollments.filter((e) => e.student.sex === "FEMALE").length;
      hasStudentEnrollment = enrollment.total > 0;
      hasTeacherAssignments = assignmentCount > 0;
    }

    // Attendance.date is written from a plain "YYYY-MM-DD" string (see
    // AttendanceService.mark), which `new Date(...)` parses as UTC midnight
    // — matching that construction here, rather than local midnight, is
    // what keeps this query actually finding today's rows.
    const todayKey = new Date().toISOString().slice(0, 10);
    const startOfToday = new Date(todayKey);

    const attendanceGroups = await this.prisma.attendance.groupBy({
      by: ["status"],
      where: { date: startOfToday, enrollment: { schoolId } },
      _count: true,
    });
    const attendanceToday = { marked: 0, present: 0, absent: 0, late: 0, excused: 0, percent: null as number | null };
    for (const row of attendanceGroups) {
      attendanceToday.marked += row._count;
      if (row.status === "PRESENT") attendanceToday.present = row._count;
      else if (row.status === "ABSENT") attendanceToday.absent = row._count;
      else if (row.status === "LATE") attendanceToday.late = row._count;
      else if (row.status === "EXCUSED") attendanceToday.excused = row._count;
    }
    attendanceToday.percent =
      attendanceToday.marked > 0 ? Math.round((attendanceToday.present / attendanceToday.marked) * 100) : null;

    const outstandingInvoices = await this.prisma.invoice.findMany({
      where: { enrollment: { schoolId }, status: { in: ["UNPAID", "PARTIALLY_PAID"] } },
      include: { payments: true },
    });
    const outstandingFeesTotal = outstandingInvoices.reduce((sum, inv) => {
      const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
      return sum + (Number(inv.amount) - paid);
    }, 0);

    const setup = {
      academicYear: years.length > 0,
      classes: classCount > 0,
      sections: sectionCount > 0,
      subjects: subjectCount > 0,
      teacherAssignments: hasTeacherAssignments,
      studentEnrollment: hasStudentEnrollment,
    };
    const setupValues = Object.values(setup);
    const progressPercent = Math.round((setupValues.filter(Boolean).length / setupValues.length) * 100);

    return {
      academicYear: year ? { id: year.id, name: year.name } : null,
      academicYears: years.map((y) => ({ id: y.id, name: y.name, isCurrent: y.isCurrent })),
      counts: {
        students: enrollment.total,
        teachers: teacherActive + teacherInactive,
        classes: classCount,
        sections: sectionCount,
        subjects: subjectCount,
      },
      enrollment,
      teachers: { active: teacherActive, inactive: teacherInactive },
      attendanceToday,
      outstandingFeesTotal,
      outstandingInvoiceCount: outstandingInvoices.length,
      setup: { ...setup, progressPercent },
    };
  }
}
