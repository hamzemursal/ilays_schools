import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

// A SECONDARY student looking at their own data — every method below is
// gated only by authentication (JwtAuthGuard), never @RequirePermissions,
// same reasoning as GuardianPortalService. The security boundary here is
// stronger than the Guardian Portal's: there is no studentId route param
// anywhere, so there is nothing for a student to tamper with in the URL —
// every query resolves strictly from the authenticated actor's own userId.
@Injectable()
export class StudentPortalService {
  constructor(private readonly prisma: PrismaService) {}

  // Re-verified on every single call, not just once at account creation —
  // a student later transferred/promoted out of a SECONDARY division must
  // lose portal access immediately, even though their account (and
  // Student.userId link) still exists. This is the one gate every method
  // in this service goes through first.
  private async getSelfOrThrow(actor: AuthenticatedUser) {
    const student = await this.prisma.student.findFirst({ where: { userId: actor.id } });
    if (!student) {
      throw new NotFoundException("No student profile linked to this account");
    }

    const enrollment = await this.prisma.studentEnrollment.findFirst({
      where: { studentId: student.id, status: "ACTIVE" },
      include: { school: true, academicYear: true, class: { include: { division: true } }, section: true },
      orderBy: { startDate: "desc" },
    });
    if (!enrollment) {
      throw new ForbiddenException("No active enrollment found for this account");
    }
    if (enrollment.class.division.type !== "SECONDARY") {
      throw new ForbiddenException("Student Portal access is only available to secondary students");
    }

    return { student, enrollment };
  }

  async myProfile(actor: AuthenticatedUser) {
    const { student, enrollment } = await this.getSelfOrThrow(actor);
    return {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      dateOfBirth: student.dateOfBirth,
      sex: student.sex,
      currentStatus: student.currentStatus,
      loginId: enrollment.studentNumber,
      enrollment: {
        status: enrollment.status,
        schoolName: enrollment.school.name,
        academicYearId: enrollment.academicYearId,
        academicYearName: enrollment.academicYear.name,
        className: enrollment.class.name,
        sectionName: enrollment.section.name,
        rollNumber: enrollment.rollNumber,
      },
    };
  }

  // Every academic year this student has actually been enrolled in — same
  // shape as GuardianPortalService.myChildAcademicYears, just resolved from
  // the authenticated actor's own Student instead of a studentId param.
  async myAcademicYears(actor: AuthenticatedUser) {
    const { student } = await this.getSelfOrThrow(actor);

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: { studentId: student.id },
      include: { academicYear: true },
      orderBy: { academicYear: { startDate: "desc" } },
    });

    const seen = new Set<string>();
    const years = enrollments.filter((e) => {
      if (seen.has(e.academicYearId)) return false;
      seen.add(e.academicYearId);
      return true;
    });

    const attendanceCounts = await this.prisma.attendance.groupBy({
      by: ["enrollmentId"],
      where: { enrollment: { studentId: student.id } },
      _count: true,
    });
    const enrollmentIdsWithAttendance = new Set(attendanceCounts.map((c) => c.enrollmentId));
    const enrollmentIdsByYear = new Map<string, string[]>();
    for (const e of enrollments) {
      const list = enrollmentIdsByYear.get(e.academicYearId) ?? [];
      list.push(e.id);
      enrollmentIdsByYear.set(e.academicYearId, list);
    }

    return years.map((e) => ({
      id: e.academicYearId,
      name: e.academicYear.name,
      isCurrent: e.academicYear.isCurrent,
      hasAttendance: (enrollmentIdsByYear.get(e.academicYearId) ?? []).some((id) =>
        enrollmentIdsWithAttendance.has(id),
      ),
    }));
  }

  async mySubjects(actor: AuthenticatedUser, academicYearId?: string) {
    const { student } = await this.getSelfOrThrow(actor);

    const enrollment = await this.prisma.studentEnrollment.findFirst({
      where: academicYearId ? { studentId: student.id, academicYearId } : { studentId: student.id, status: "ACTIVE" },
      orderBy: { startDate: "desc" },
    });
    if (!enrollment) return [];

    const [classSubjects, assignments] = await Promise.all([
      this.prisma.classSubject.findMany({ where: { classId: enrollment.classId }, include: { subject: true } }),
      this.prisma.teacherAssignment.findMany({
        where: { sectionId: enrollment.sectionId, academicYearId: enrollment.academicYearId },
        include: { subject: true, teacher: { select: { id: true, firstName: true, lastName: true } } },
      }),
    ]);

    return classSubjects.map((cs) => {
      const assignment = assignments.find((a) => a.subjectId === cs.subjectId);
      return {
        subjectId: cs.subjectId,
        name: cs.subject.name,
        code: cs.subject.code,
        teacher: assignment
          ? { firstName: assignment.teacher.firstName, lastName: assignment.teacher.lastName }
          : null,
      };
    });
  }

  // This is the student's whole-day attendance — one PRESENT/ABSENT/LATE/
  // EXCUSED mark per enrollment per day. There is no subject dimension in
  // this schema (see Attendance in schema.prisma) and no timetable model,
  // so there is no real subject-level attendance to report here, ever.
  async myAttendance(actor: AuthenticatedUser, academicYearId?: string) {
    const { student } = await this.getSelfOrThrow(actor);

    const records = await this.prisma.attendance.findMany({
      where: { enrollment: { studentId: student.id, ...(academicYearId ? { academicYearId } : {}) } },
      include: { enrollment: { include: { academicYear: true, class: true, section: true } } },
      orderBy: { date: "desc" },
    });

    const total = records.length;
    const present = records.filter((r) => r.status === "PRESENT").length;
    const absent = records.filter((r) => r.status === "ABSENT").length;
    const late = records.filter((r) => r.status === "LATE").length;
    const excused = records.filter((r) => r.status === "EXCUSED").length;
    const percentage = total > 0 ? Math.round(((present + late) / total) * 1000) / 10 : null;

    return {
      summary: { total, present, absent, late, excused, percentage },
      records: records.map((r) => ({
        id: r.id,
        date: r.date,
        status: r.status,
        note: r.note,
        className: r.enrollment.class.name,
        sectionName: r.enrollment.section.name,
      })),
    };
  }

  // Only APPROVED results — an entered-but-not-yet-approved mark is still a
  // teacher's draft, not something a student should see or rely on.
  async myResults(actor: AuthenticatedUser) {
    const { student } = await this.getSelfOrThrow(actor);

    const results = await this.prisma.result.findMany({
      where: { enrollment: { studentId: student.id }, status: "APPROVED" },
      include: { examSubject: { include: { exam: true, subject: true } } },
      orderBy: { createdAt: "desc" },
    });

    return results.map((r) => ({
      id: r.id,
      examName: r.examSubject.exam.name,
      examType: r.examSubject.exam.type,
      subjectName: r.examSubject.subject.name,
      marksObtained: Number(r.marksObtained),
      maxMarks: r.examSubject.maxMarks,
      percentage: Math.round((Number(r.marksObtained) / r.examSubject.maxMarks) * 1000) / 10,
      examDate: r.examSubject.examDate,
    }));
  }

  async myInvoices(actor: AuthenticatedUser) {
    const { student } = await this.getSelfOrThrow(actor);

    const invoices = await this.prisma.invoice.findMany({
      where: { enrollment: { studentId: student.id } },
      include: { feeStructure: true, payments: { orderBy: { paidAt: "desc" } } },
      orderBy: { createdAt: "desc" },
    });

    return invoices.map((inv) => {
      const paid = inv.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      return {
        id: inv.id,
        feeName: inv.feeStructure.name,
        amount: Number(inv.amount),
        paid,
        balance: Number(inv.amount) - paid,
        status: inv.status,
        dueDate: inv.dueDate,
        payments: inv.payments.map((p) => ({
          id: p.id,
          amount: Number(p.amount),
          method: p.method,
          paidAt: p.paidAt,
          reference: p.reference,
        })),
      };
    });
  }

  // AnnouncementAudience has no STUDENTS value (only ALL/PARENTS/TEACHERS —
  // see schema.prisma) — ALL is the only category genuinely meant for a
  // student to see, so that's the only filter applied here. Nothing is
  // fabricated to simulate student-specific targeting that doesn't exist.
  async myAnnouncements(actor: AuthenticatedUser) {
    const { enrollment } = await this.getSelfOrThrow(actor);

    return this.prisma.announcement.findMany({
      where: { schoolId: enrollment.schoolId, audience: "ALL" },
      include: { school: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }
}
