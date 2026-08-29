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

  async getSummary(actor: AuthenticatedUser, schoolId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const [studentCount, teacherCount, classCount] = await Promise.all([
      this.prisma.studentEnrollment.count({ where: { schoolId, status: "ACTIVE" } }),
      this.prisma.teacher.count({ where: { schoolId, status: "ACTIVE" } }),
      this.prisma.class.count({ where: { division: { schoolId } } }),
    ]);

    // Attendance.date is written from a plain "YYYY-MM-DD" string (see
    // AttendanceService.mark), which `new Date(...)` parses as UTC midnight
    // — matching that construction here, rather than local midnight, is
    // what keeps this query actually finding today's rows.
    const todayKey = new Date().toISOString().slice(0, 10);
    const startOfToday = new Date(todayKey);

    const todayAttendance = await this.prisma.attendance.findMany({
      where: { date: startOfToday, enrollment: { schoolId } },
      select: { status: true },
    });
    const presentCount = todayAttendance.filter((a) => a.status === "PRESENT").length;
    const attendanceMarkedCount = todayAttendance.length;
    const attendanceTodayPercent =
      attendanceMarkedCount > 0 ? Math.round((presentCount / attendanceMarkedCount) * 100) : null;

    const outstandingInvoices = await this.prisma.invoice.findMany({
      where: { enrollment: { schoolId }, status: { in: ["UNPAID", "PARTIALLY_PAID"] } },
      include: { payments: true },
    });
    const outstandingFeesTotal = outstandingInvoices.reduce((sum, inv) => {
      const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
      return sum + (Number(inv.amount) - paid);
    }, 0);

    return {
      studentCount,
      teacherCount,
      classCount,
      attendanceTodayPercent,
      attendanceMarkedCount,
      outstandingFeesTotal,
      outstandingInvoiceCount: outstandingInvoices.length,
    };
  }
}
