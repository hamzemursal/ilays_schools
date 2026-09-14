import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma, type AttendanceSession, type AttendanceStatus, type Sex, type StudentStatus } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AttendanceService } from "../attendance/attendance.service";
import { StudentLedgerService, type FeeStatus } from "../finance/student-ledger.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";

export interface StudentDirectoryFilters {
  academicYearId: string;
  classId?: string;
  sectionId?: string;
  search?: string;
  gender?: Sex;
  studentStatus?: StudentStatus;
  hasParent?: boolean;
  feeStatus?: FeeStatus;
  hasOutstandingBalance?: boolean;
  attendanceDate?: string;
  attendanceSession?: AttendanceSession;
  // "NOT_RECORDED" is a real, distinct state — never treated as ABSENT.
  attendanceStatus?: AttendanceStatus | "NOT_RECORDED";
}

const MAX_IDS = 5000;

// The Advanced Student List's backend — deliberately a new service/module
// rather than adding this to StudentsService directly. AttendanceService and
// StudentLedgerService both already depend on StudentsService, so having
// StudentsService depend on them back would create a module cycle; this
// service sits "above" all three instead (see StudentDirectoryModule).
//
// Design: simple, column-backed filters (year/class/section/search/gender/
// status/hasParent) run as one indexed Prisma query to get the full matching
// enrollment-id list, in the school's real display order. Only when a
// derived filter (fee/attendance) is actually requested do we bulk-compute
// those maps for that whole candidate set before filtering — still a small,
// fixed number of grouped queries, never one query per student. Pagination
// always happens last, and full row detail (student/guardian/class/section)
// is only ever fetched for the ids actually about to be shown or exported.
@Injectable()
export class StudentDirectoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly attendance: AttendanceService,
    private readonly ledger: StudentLedgerService,
  ) {}

  // Shared by search() and the export flow: the full, ordered list of
  // enrollment ids matching every filter (including derived fee/attendance
  // ones), with no pagination and no row-detail fetch yet.
  private async getFilteredOrderedIds(actor: AuthenticatedUser, schoolId: string, filters: StudentDirectoryFilters) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    if (!filters.academicYearId) throw new BadRequestException("academicYearId is required");

    const canViewAttendance = actor.permissions.includes("attendance.view");
    const canViewFinance = actor.permissions.includes("finance.ledger.view");
    const attendanceDate = filters.attendanceDate ?? new Date().toISOString().slice(0, 10);
    const attendanceSession: AttendanceSession = filters.attendanceSession ?? "MORNING";

    const search = filters.search?.trim();
    const searchAsRoll = search && /^\d+$/.test(search) ? Number(search) : undefined;

    const where: Prisma.StudentEnrollmentWhereInput = {
      schoolId,
      status: "ACTIVE",
      academicYearId: filters.academicYearId,
      ...(filters.classId ? { classId: filters.classId } : {}),
      ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
      ...(filters.gender ? { student: { sex: filters.gender } } : {}),
      ...(filters.studentStatus ? { student: { currentStatus: filters.studentStatus } } : {}),
      ...(filters.hasParent === true ? { student: { guardians: { some: { status: "ACTIVE" } } } } : {}),
      ...(filters.hasParent === false ? { student: { guardians: { none: { status: "ACTIVE" } } } } : {}),
      ...(search
        ? {
            OR: [
              { student: { firstName: { contains: search, mode: "insensitive" } } },
              { student: { lastName: { contains: search, mode: "insensitive" } } },
              { studentNumber: { contains: search, mode: "insensitive" } },
              ...(searchAsRoll !== undefined ? [{ rollNumber: searchAsRoll }] : []),
              { student: { guardians: { some: { guardian: { firstName: { contains: search, mode: "insensitive" } } } } } },
              { student: { guardians: { some: { guardian: { lastName: { contains: search, mode: "insensitive" } } } } } },
              { student: { guardians: { some: { guardian: { phone: { contains: search } } } } } },
            ],
          }
        : {}),
    };

    const candidates = await this.prisma.studentEnrollment.findMany({
      where,
      select: { id: true },
      orderBy: [{ class: { level: "asc" } }, { section: { name: "asc" } }, { rollNumber: "asc" }],
      take: MAX_IDS,
    });
    let orderedIds = candidates.map((c) => c.id);

    const needsFinance =
      canViewFinance && (filters.feeStatus !== undefined || filters.hasOutstandingBalance !== undefined);
    const needsAttendance = canViewAttendance && filters.attendanceStatus !== undefined;

    let financeMap: Awaited<ReturnType<StudentLedgerService["getSummaryForEnrollments"]>> | null = null;
    let attendanceMap: Awaited<ReturnType<AttendanceService["getTodayStatusForEnrollments"]>> | null = null;

    if (needsFinance) {
      financeMap = await this.ledger.getSummaryForEnrollments(orderedIds);
      orderedIds = orderedIds.filter((id) => {
        const summary = financeMap!.get(id)!;
        if (filters.feeStatus !== undefined && summary.feeStatus !== filters.feeStatus) return false;
        if (filters.hasOutstandingBalance === true && summary.balance <= 0) return false;
        if (filters.hasOutstandingBalance === false && summary.balance > 0) return false;
        return true;
      });
    }
    if (needsAttendance) {
      attendanceMap = await this.attendance.getTodayStatusForEnrollments(orderedIds, attendanceDate);
      orderedIds = orderedIds.filter((id) => {
        const status = attendanceMap!.get(id)![attendanceSession];
        return filters.attendanceStatus === "NOT_RECORDED" ? status === null : status === filters.attendanceStatus;
      });
    }

    return { orderedIds, canViewAttendance, canViewFinance, attendanceDate, financeMap, attendanceMap };
  }

  // Full detail rows for exactly the given enrollment ids, in the order
  // given — shared by search()'s current page and by the export flow.
  private async getRowsForIds(
    ids: string[],
    opts: {
      canViewAttendance: boolean;
      canViewFinance: boolean;
      attendanceDate: string;
      financeMap: Awaited<ReturnType<StudentLedgerService["getSummaryForEnrollments"]>> | null;
      attendanceMap: Awaited<ReturnType<AttendanceService["getTodayStatusForEnrollments"]>> | null;
    },
  ) {
    if (ids.length === 0) return [];

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: { id: { in: ids } },
      include: {
        student: {
          include: {
            guardians: {
              where: { status: "ACTIVE" },
              include: { guardian: true },
              orderBy: [{ isPrimaryContact: "desc" }],
            },
          },
        },
        class: true,
        section: true,
      },
    });
    const byId = new Map(enrollments.map((e) => [e.id, e]));

    const financeMap = opts.canViewFinance && !opts.financeMap ? await this.ledger.getSummaryForEnrollments(ids) : opts.financeMap;
    const attendanceMap =
      opts.canViewAttendance && !opts.attendanceMap
        ? await this.attendance.getTodayStatusForEnrollments(ids, opts.attendanceDate)
        : opts.attendanceMap;

    return ids.map((id) => {
      const e = byId.get(id)!;
      const primaryGuardian = e.student.guardians[0]?.guardian;
      const primaryLink = e.student.guardians[0];
      return {
        enrollmentId: e.id,
        studentId: e.studentId,
        firstName: e.student.firstName,
        lastName: e.student.lastName,
        studentNumber: e.studentNumber,
        rollNumber: e.rollNumber,
        classId: e.classId,
        className: e.class.name,
        sectionId: e.sectionId,
        sectionName: e.section.name,
        academicYearId: e.academicYearId,
        sex: e.student.sex,
        status: e.student.currentStatus,
        dateOfBirth: e.student.dateOfBirth,
        // The date this student started their CURRENT enrollment — the
        // closest real, existing field to "Admission Date"; Student itself
        // has no separate admission-date field.
        admissionDate: e.startDate,
        hasPortalAccount: e.student.userId !== null,
        guardianCount: e.student.guardians.length,
        guardian: primaryGuardian
          ? {
              id: primaryGuardian.id,
              name: `${primaryGuardian.firstName} ${primaryGuardian.lastName}`,
              relationship: primaryLink!.relationship,
              isPrimaryContact: primaryLink!.isPrimaryContact,
              phone: primaryGuardian.phone,
              email: primaryGuardian.email,
              address: primaryGuardian.address,
            }
          : null,
        attendanceToday: opts.canViewAttendance ? (attendanceMap!.get(id) ?? { MORNING: null, AFTERNOON: null }) : null,
        finance: opts.canViewFinance ? (financeMap!.get(id) ?? null) : null,
      };
    });
  }

  // Powers the Advanced Student List's summary cards — these must reflect
  // the FULL current filtered set, not just the one page of rows the table
  // shows, so this deliberately does its own bulk pass over every matching
  // id rather than reusing search()'s paginated result.
  async summary(actor: AuthenticatedUser, schoolId: string, filters: StudentDirectoryFilters) {
    const ctx = await this.getFilteredOrderedIds(actor, schoolId, filters);
    const total = ctx.orderedIds.length;

    if (total === 0) {
      return { total, active: 0, presentToday: ctx.canViewAttendance ? 0 : null, outstandingBalances: ctx.canViewFinance ? 0 : null };
    }

    const students = await this.prisma.studentEnrollment.findMany({
      where: { id: { in: ctx.orderedIds } },
      select: { id: true, student: { select: { currentStatus: true } } },
    });
    const active = students.filter((s) => s.student.currentStatus === "ACTIVE").length;

    let presentToday: number | null = null;
    if (ctx.canViewAttendance) {
      const attendanceMap = ctx.attendanceMap ?? (await this.attendance.getTodayStatusForEnrollments(ctx.orderedIds, ctx.attendanceDate));
      presentToday = ctx.orderedIds.filter((id) => {
        const day = attendanceMap.get(id)!;
        return day.MORNING === "PRESENT" || day.AFTERNOON === "PRESENT";
      }).length;
    }

    let outstandingBalances: number | null = null;
    if (ctx.canViewFinance) {
      const financeMap = ctx.financeMap ?? (await this.ledger.getSummaryForEnrollments(ctx.orderedIds));
      outstandingBalances = ctx.orderedIds.filter((id) => financeMap.get(id)!.balance > 0).length;
    }

    return { total, active, presentToday, outstandingBalances };
  }

  async search(actor: AuthenticatedUser, schoolId: string, filters: StudentDirectoryFilters & { page?: number; pageSize?: number }) {
    const ctx = await this.getFilteredOrderedIds(actor, schoolId, filters);
    const total = ctx.orderedIds.length;
    const pageSize = Math.min(Math.max(filters.pageSize ?? 25, 1), 200);
    const page = Math.max(filters.page ?? 1, 1);
    const pageIds = ctx.orderedIds.slice((page - 1) * pageSize, page * pageSize);

    const items = await this.getRowsForIds(pageIds, ctx);
    return { items, total, page, pageSize };
  }

  // Every matching enrollment's full row, no pagination — used by export,
  // which must cover the Admin's whole current filtered view.
  async searchAll(actor: AuthenticatedUser, schoolId: string, filters: StudentDirectoryFilters) {
    const ctx = await this.getFilteredOrderedIds(actor, schoolId, filters);
    return this.getRowsForIds(ctx.orderedIds, ctx);
  }
}
