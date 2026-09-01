import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { GuardiansService } from "./guardians.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

// Every method here is a parent looking at their own data — gated only by
// authentication (JwtAuthGuard), never @RequirePermissions. Authorization is
// "this student belongs to my own Guardian record", enforced by
// GuardiansService.assertGuardianCanAccessStudent on every child-scoped call.
// This is also the school-isolation boundary: a guardian can only ever be
// linked to students an admin explicitly linked them to.
@Injectable()
export class GuardianPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guardians: GuardiansService,
  ) {}

  async myProfile(actor: AuthenticatedUser) {
    const guardian = await this.prisma.guardian.findFirst({
      where: { userId: actor.id },
      include: { user: { select: { id: true, email: true, status: true } } },
    });
    return guardian;
  }

  async myChildren(actor: AuthenticatedUser) {
    const guardian = await this.guardians.getSelfGuardianOrThrow(actor);

    const links = await this.prisma.studentGuardian.findMany({
      where: { guardianId: guardian.id, status: "ACTIVE" },
      include: {
        student: {
          include: {
            enrollments: {
              where: { status: "ACTIVE" },
              include: { school: true, class: true, section: true, academicYear: true },
              orderBy: { startDate: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    return links.map((l) => ({
      studentId: l.studentId,
      firstName: l.student.firstName,
      lastName: l.student.lastName,
      sex: l.student.sex,
      dateOfBirth: l.student.dateOfBirth,
      currentStatus: l.student.currentStatus,
      relationship: l.relationship,
      isPrimaryContact: l.isPrimaryContact,
      enrollment: l.student.enrollments[0]
        ? {
            schoolName: l.student.enrollments[0].school.name,
            className: l.student.enrollments[0].class.name,
            sectionName: l.student.enrollments[0].section.name,
            academicYearName: l.student.enrollments[0].academicYear.name,
            studentNumber: l.student.enrollments[0].studentNumber,
            rollNumber: l.student.enrollments[0].rollNumber,
          }
        : null,
    }));
  }

  async myChild(actor: AuthenticatedUser, studentId: string) {
    await this.guardians.assertGuardianCanAccessStudent(actor, studentId);

    const student = await this.prisma.student.findUniqueOrThrow({
      where: { id: studentId },
      include: {
        enrollments: {
          include: { school: true, class: true, section: true, academicYear: true },
          orderBy: { startDate: "desc" },
        },
      },
    });

    return student;
  }

  // Every academic year the student has actually been enrolled in — the
  // year selector's options on the parent portal's Attendance page. Flagging
  // hasAttendance up front means the frontend never has to guess which
  // historical years are worth offering versus ones with an enrollment but
  // no marked days yet.
  async myChildAcademicYears(actor: AuthenticatedUser, studentId: string) {
    await this.guardians.assertGuardianCanAccessStudent(actor, studentId);

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: { studentId },
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
      where: { enrollment: { studentId } },
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

  async myChildSubjects(actor: AuthenticatedUser, studentId: string, academicYearId?: string) {
    await this.guardians.assertGuardianCanAccessStudent(actor, studentId);

    const enrollment = await this.prisma.studentEnrollment.findFirst({
      where: academicYearId ? { studentId, academicYearId } : { studentId, status: "ACTIVE" },
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
  // EXCUSED mark per enrollment per day (see Attendance in schema.prisma),
  // never per subject. There's no timetable/period model in this system, so
  // there is no real per-subject attendance to report; the portal UI must
  // present this as a daily total, not silently imply it's subject-specific.
  async myChildAttendance(actor: AuthenticatedUser, studentId: string, academicYearId?: string) {
    await this.guardians.assertGuardianCanAccessStudent(actor, studentId);

    const records = await this.prisma.attendance.findMany({
      where: { enrollment: { studentId, ...(academicYearId ? { academicYearId } : {}) } },
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
  // teacher's draft, not something a parent should see or rely on.
  async myChildResults(actor: AuthenticatedUser, studentId: string) {
    await this.guardians.assertGuardianCanAccessStudent(actor, studentId);

    const results = await this.prisma.result.findMany({
      where: { enrollment: { studentId }, status: "APPROVED" },
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

  async myChildInvoices(actor: AuthenticatedUser, studentId: string) {
    await this.guardians.assertGuardianCanAccessStudent(actor, studentId);

    const invoices = await this.prisma.invoice.findMany({
      where: { enrollment: { studentId } },
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

  // Announcements for every school any of this guardian's active children
  // attend, restricted to audiences a parent should see.
  async myAnnouncements(actor: AuthenticatedUser) {
    const guardian = await this.guardians.getSelfGuardianOrThrow(actor);

    const links = await this.prisma.studentGuardian.findMany({
      where: { guardianId: guardian.id, status: "ACTIVE" },
      include: { student: { include: { enrollments: { where: { status: "ACTIVE" }, select: { schoolId: true } } } } },
    });
    const schoolIds = Array.from(new Set(links.flatMap((l) => l.student.enrollments.map((e) => e.schoolId))));
    if (schoolIds.length === 0) return [];

    return this.prisma.announcement.findMany({
      where: { schoolId: { in: schoolIds }, audience: { in: ["ALL", "PARENTS"] } },
      include: { school: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async myNotifications(actor: AuthenticatedUser) {
    const guardian = await this.guardians.getSelfGuardianOrThrow(actor);
    return this.prisma.notification.findMany({
      where: { guardianId: guardian.id },
      orderBy: { createdAt: "desc" },
    });
  }

  async markNotificationRead(actor: AuthenticatedUser, notificationId: string) {
    const guardian = await this.guardians.getSelfGuardianOrThrow(actor);
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, guardianId: guardian.id },
    });
    if (!notification) throw new NotFoundException("Notification not found");

    return this.prisma.notification.update({ where: { id: notificationId }, data: { isRead: true } });
  }
}
