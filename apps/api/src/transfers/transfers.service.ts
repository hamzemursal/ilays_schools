import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type TransferStatus } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction, AuditModuleName } from "../audit/audit-actions";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { RequestTransferDto } from "./dto/request-transfer.dto";
import { ApproveTransferDto } from "./dto/approve-transfer.dto";
import { RejectTransferDto } from "./dto/reject-transfer.dto";

// A student can be transferred from an ACTIVE enrollment (the ordinary
// case) or a COMPLETED/GRADUATED one — a student currently awaiting their
// next enrollment after finishing Primary or Secondary (see
// StudentLifecycleService), who has no active enrollment at all but still
// has a real "current standing" worth transferring from. Anything else
// (PROMOTED, TRANSFERRED_OUT, WITHDRAWN) is already-resolved history with
// its own successor enrollment recorded elsewhere.
const TRANSFERABLE_ENROLLMENT_STATUSES = new Set(["ACTIVE", "COMPLETED", "GRADUATED"]);

const MAX_PAGE_SIZE = 100;

export interface TransferListFilters {
  // The school whose inbox/outbox this list represents — required to make
  // "direction" meaningful. Omitted entirely means org-wide (Super/Org
  // Admin only; a School Admin with no schoolId falls back to their own
  // school(s) instead, same as every other org-wide-capable list in this
  // app — see StudentLifecycleService.resolveSchoolIds for the identical
  // pattern).
  schoolId?: string;
  direction?: "incoming" | "outgoing";
  originSchoolId?: string;
  destinationSchoolId?: string;
  status?: TransferStatus;
  academicYearId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly audit: AuditService,
  ) {}

  async request(actor: AuthenticatedUser, studentId: string, dto: RequestTransferDto) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { enrollments: { orderBy: { startDate: "desc" }, take: 1 } },
    });
    if (!student || student.organizationId !== actor.organizationId) {
      throw new NotFoundException("Student not found");
    }

    const sourceEnrollment = student.enrollments[0];
    if (!sourceEnrollment || !TRANSFERABLE_ENROLLMENT_STATUSES.has(sourceEnrollment.status)) {
      throw new BadRequestException("Student has no current enrollment to transfer from");
    }
    if (actor.schoolIds.length > 0 && !actor.schoolIds.includes(sourceEnrollment.schoolId)) {
      throw new NotFoundException("Student not found");
    }
    if (sourceEnrollment.schoolId === dto.toSchoolId) {
      throw new BadRequestException("Student is already enrolled at that school");
    }

    const destSchool = await this.prisma.school.findFirst({
      where: { id: dto.toSchoolId, organizationId: actor.organizationId },
    });
    if (!destSchool) throw new BadRequestException("Destination school not found in this organization");

    const existingPending = await this.prisma.transfer.findFirst({
      where: { studentId, status: "REQUESTED" },
    });
    if (existingPending) {
      throw new BadRequestException(
        "This student already has a pending transfer request — cancel it before requesting another",
      );
    }

    const transfer = await this.prisma.transfer.create({
      data: {
        studentId,
        fromEnrollmentId: sourceEnrollment.id,
        fromSchoolId: sourceEnrollment.schoolId,
        toSchoolId: dto.toSchoolId,
        reason: dto.reason,
        status: "REQUESTED",
        requestedByUserId: actor.id,
      },
    });

    await this.audit.record({
      actor,
      organizationId: actor.organizationId,
      schoolId: sourceEnrollment.schoolId,
      action: AuditAction.TRANSFER_REQUESTED,
      module: AuditModuleName.TRANSFERS,
      resourceType: "Transfer",
      resourceId: transfer.id,
      after: { toSchoolId: dto.toSchoolId, reason: dto.reason },
    });

    return this.getOne(actor, transfer.id);
  }

  async approve(actor: AuthenticatedUser, transferId: string, dto: ApproveTransferDto) {
    const transfer = await this.prisma.transfer.findUnique({ where: { id: transferId } });
    if (!transfer) throw new NotFoundException("Transfer not found");
    if (transfer.status !== "REQUESTED") throw new BadRequestException("Transfer is not pending");

    // Only the destination school's admin can approve — they're the ones
    // assigning the class/section/roll number the student is joining.
    await this.schools.findOneAccessibleOrThrow(actor, transfer.toSchoolId);

    const section = await this.prisma.section.findFirst({
      where: { id: dto.sectionId, classId: dto.classId, class: { division: { schoolId: transfer.toSchoolId } } },
    });
    if (!section) throw new BadRequestException("That section does not belong to the destination school's class");

    const academicYear = await this.prisma.academicYear.findFirst({
      where: { id: dto.academicYearId, schoolId: transfer.toSchoolId },
    });
    if (!academicYear) throw new BadRequestException("That academic year does not belong to the destination school");

    if (section.capacity !== null) {
      const activeCount = await this.prisma.studentEnrollment.count({
        where: { sectionId: section.id, status: "ACTIVE" },
      });
      if (activeCount >= section.capacity) {
        throw new BadRequestException(`Section ${section.name} is at capacity (${section.capacity})`);
      }
    }

    const studentNumber =
      dto.studentNumber ?? (await this.generateStudentNumber(transfer.toSchoolId, dto.academicYearId, academicYear.name));
    const rollNumber = dto.rollNumber ?? (await this.generateRollNumber(section.id, dto.academicYearId));

    await this.prisma.$transaction(async (tx) => {
      await tx.studentEnrollment.update({
        where: { id: transfer.fromEnrollmentId },
        data: { status: "TRANSFERRED_OUT", endDate: new Date() },
      });

      const newEnrollment = await tx.studentEnrollment.create({
        data: {
          studentId: transfer.studentId,
          organizationId: actor.organizationId!,
          schoolId: transfer.toSchoolId,
          academicYearId: dto.academicYearId,
          classId: dto.classId,
          sectionId: dto.sectionId,
          studentNumber,
          rollNumber,
          status: "ACTIVE",
        },
      });

      // A no-op for the ordinary case (an already-ACTIVE student stays
      // ACTIVE), but necessary for a student transferred from the awaiting-
      // enrollment state (COMPLETED/GRADUATED, no active enrollment) — this
      // is the moment they get a real active enrollment again, and
      // currentStatus must reflect that instead of leaving them stuck
      // showing as "awaiting" indefinitely.
      await tx.student.update({ where: { id: transfer.studentId }, data: { currentStatus: "ACTIVE" } });

      await tx.transfer.update({
        where: { id: transferId },
        data: {
          status: "EXECUTED",
          toEnrollmentId: newEnrollment.id,
          approvedByUserId: actor.id,
          transferDate: new Date(),
        },
      });

      await this.audit.record(
        {
          actor,
          organizationId: actor.organizationId,
          schoolId: transfer.toSchoolId,
          action: AuditAction.TRANSFER_APPROVED,
          module: AuditModuleName.TRANSFERS,
          resourceType: "Transfer",
          resourceId: transferId,
          after: { newEnrollmentId: newEnrollment.id, studentNumber, rollNumber },
        },
        tx,
      );
    }, { timeout: 30_000 });

    return this.getOne(actor, transferId);
  }

  async reject(actor: AuthenticatedUser, transferId: string, dto: RejectTransferDto) {
    const transfer = await this.prisma.transfer.findUnique({ where: { id: transferId } });
    if (!transfer) throw new NotFoundException("Transfer not found");
    if (transfer.status !== "REQUESTED") throw new BadRequestException("Transfer is not pending");

    // Only the destination school decides accept/reject — same access rule
    // as approve(), tighter than getOne()'s "either side can view."
    await this.schools.findOneAccessibleOrThrow(actor, transfer.toSchoolId);

    await this.prisma.transfer.update({
      where: { id: transferId },
      data: { status: "REJECTED", rejectionReason: dto.reason },
    });

    await this.audit.record({
      actor,
      organizationId: actor.organizationId,
      schoolId: transfer.toSchoolId,
      action: AuditAction.TRANSFER_REJECTED,
      module: AuditModuleName.TRANSFERS,
      resourceType: "Transfer",
      resourceId: transferId,
      after: { reason: dto.reason },
    });

    return this.getOne(actor, transferId);
  }

  // Only the requesting (origin) school can withdraw its own still-pending
  // request — the destination school's equivalent action is reject(), not
  // this. Only a REQUESTED transfer can ever be cancelled; anything already
  // decided one way or the other is final.
  async cancel(actor: AuthenticatedUser, transferId: string) {
    const transfer = await this.prisma.transfer.findUnique({ where: { id: transferId } });
    if (!transfer) throw new NotFoundException("Transfer not found");
    if (transfer.status !== "REQUESTED") throw new BadRequestException("Only a pending transfer can be cancelled");

    const hasAccess = actor.schoolIds.length === 0 || actor.schoolIds.includes(transfer.fromSchoolId);
    if (!hasAccess) throw new NotFoundException("Transfer not found");

    await this.prisma.transfer.update({ where: { id: transferId }, data: { status: "CANCELLED" } });

    await this.audit.record({
      actor,
      organizationId: actor.organizationId,
      schoolId: transfer.fromSchoolId,
      action: AuditAction.TRANSFER_CANCELLED,
      module: AuditModuleName.TRANSFERS,
      resourceType: "Transfer",
      resourceId: transferId,
    });

    return this.getOne(actor, transferId);
  }

  // Same scoping shape as StudentLifecycleService.resolveSchoolIds: an
  // explicit schoolId is validated via findOneAccessibleOrThrow (never
  // leaks another school's data); no schoolId means "every school the
  // actor can see" — every school in the org for Super/Org Admin, or
  // exactly their own school(s) for a School Admin.
  private async resolveViewpointSchoolIds(actor: AuthenticatedUser, schoolId?: string): Promise<string[] | undefined> {
    if (schoolId) {
      await this.schools.findOneAccessibleOrThrow(actor, schoolId);
      return [schoolId];
    }
    if (actor.schoolIds.length > 0) return actor.schoolIds;
    return undefined;
  }

  async list(actor: AuthenticatedUser, filters: TransferListFilters) {
    const schoolIds = await this.resolveViewpointSchoolIds(actor, filters.schoolId);

    const scopeWhere: Prisma.TransferWhereInput = schoolIds
      ? filters.direction === "incoming"
        ? { toSchoolId: { in: schoolIds } }
        : filters.direction === "outgoing"
          ? { fromSchoolId: { in: schoolIds } }
          : { OR: [{ fromSchoolId: { in: schoolIds } }, { toSchoolId: { in: schoolIds } }] }
      : { student: { organizationId: actor.organizationId! } };

    const where: Prisma.TransferWhereInput = {
      AND: [
        scopeWhere,
        filters.originSchoolId ? { fromSchoolId: filters.originSchoolId } : {},
        filters.destinationSchoolId ? { toSchoolId: filters.destinationSchoolId } : {},
        filters.status ? { status: filters.status } : {},
        filters.academicYearId
          ? { OR: [{ fromEnrollment: { academicYearId: filters.academicYearId } }, { toEnrollment: { academicYearId: filters.academicYearId } }] }
          : {},
        filters.dateFrom ? { createdAt: { gte: new Date(filters.dateFrom) } } : {},
        filters.dateTo ? { createdAt: { lte: new Date(filters.dateTo) } } : {},
        filters.search
          ? {
              OR: [
                { student: { firstName: { contains: filters.search, mode: "insensitive" } } },
                { student: { lastName: { contains: filters.search, mode: "insensitive" } } },
                { fromEnrollment: { studentNumber: { contains: filters.search, mode: "insensitive" } } },
                { toEnrollment: { studentNumber: { contains: filters.search, mode: "insensitive" } } },
              ],
            }
          : {},
      ],
    };

    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? 25));

    const [total, rows] = await Promise.all([
      this.prisma.transfer.count({ where }),
      this.prisma.transfer.findMany({
        where,
        include: this.fullInclude(),
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      data: await this.enrich(rows),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  // The Incoming/Outgoing summary cards — always split by direction, even
  // for a Super Admin's org-wide view (every transfer is simultaneously
  // "outgoing" from one school and "incoming" to another, so without a
  // specific viewpoint school the two sides are necessarily the same set;
  // the split is still returned for a consistent response shape, but the
  // frontend's org-wide page reads it as one combined total instead).
  async getSummary(actor: AuthenticatedUser, schoolId?: string) {
    const schoolIds = await this.resolveViewpointSchoolIds(actor, schoolId);
    const base: Prisma.TransferWhereInput = schoolIds ? {} : { student: { organizationId: actor.organizationId! } };
    const incomingBase: Prisma.TransferWhereInput = schoolIds ? { toSchoolId: { in: schoolIds } } : base;
    const outgoingBase: Prisma.TransferWhereInput = schoolIds ? { fromSchoolId: { in: schoolIds } } : base;

    const countByStatus = async (scopeWhere: Prisma.TransferWhereInput) => {
      const [pending, rejected, completed, cancelled] = await Promise.all([
        this.prisma.transfer.count({ where: { ...scopeWhere, status: "REQUESTED" } }),
        this.prisma.transfer.count({ where: { ...scopeWhere, status: "REJECTED" } }),
        this.prisma.transfer.count({ where: { ...scopeWhere, status: "EXECUTED" } }),
        this.prisma.transfer.count({ where: { ...scopeWhere, status: "CANCELLED" } }),
      ]);
      return { pending, rejected, completed, cancelled };
    };

    const [incoming, outgoing] = await Promise.all([countByStatus(incomingBase), countByStatus(outgoingBase)]);
    return { incoming, outgoing };
  }

  // A School Admin may only view a transfer that touches their own
  // school — either side, same rule as reject()/cancel()'s access check.
  async getOne(actor: AuthenticatedUser, transferId: string) {
    const transfer = await this.prisma.transfer.findUnique({ where: { id: transferId }, include: this.fullInclude() });
    if (!transfer) throw new NotFoundException("Transfer not found");

    const hasAccess =
      actor.schoolIds.length === 0 ||
      actor.schoolIds.includes(transfer.fromSchoolId) ||
      actor.schoolIds.includes(transfer.toSchoolId);
    if (!hasAccess) throw new NotFoundException("Transfer not found");

    return (await this.enrich([transfer]))[0];
  }

  private fullInclude() {
    return {
      student: true,
      fromEnrollment: { include: { class: true, section: true, academicYear: true } },
      toEnrollment: { include: { class: true, section: true, academicYear: true } },
    } satisfies Prisma.TransferInclude;
  }

  // fromSchoolId/toSchoolId and requestedByUserId/approvedByUserId are plain
  // columns with no Prisma relation (see schema.prisma) — a transfer must
  // stay resolvable even after one side's School or User is gone (a
  // deleted school's transfer history intentionally survives on the
  // *other* school, per SchoolsService.remove), so these are resolved here
  // by a manual batch lookup instead of a real `include`.
  private async enrich<
    T extends {
      fromSchoolId: string;
      toSchoolId: string;
      requestedByUserId: string;
      approvedByUserId: string | null;
    },
  >(transfers: T[]) {
    const schoolIds = [...new Set(transfers.flatMap((t) => [t.fromSchoolId, t.toSchoolId]))];
    const userIds = [
      ...new Set(transfers.flatMap((t) => [t.requestedByUserId, t.approvedByUserId].filter((id): id is string => !!id))),
    ];

    const [schools, users] = await Promise.all([
      schoolIds.length > 0 ? this.prisma.school.findMany({ where: { id: { in: schoolIds } }, select: { id: true, name: true } }) : [],
      userIds.length > 0 ? this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } }) : [],
    ]);
    const schoolName = new Map(schools.map((s) => [s.id, s.name]));
    const userEmail = new Map(users.map((u) => [u.id, u.email]));

    return transfers.map((t) => ({
      ...t,
      fromSchoolName: schoolName.get(t.fromSchoolId) ?? "(deleted school)",
      toSchoolName: schoolName.get(t.toSchoolId) ?? "(deleted school)",
      requestedByEmail: userEmail.get(t.requestedByUserId) ?? "(deleted user)",
      approvedByEmail: t.approvedByUserId ? (userEmail.get(t.approvedByUserId) ?? "(deleted user)") : null,
    }));
  }

  // Same "STU-{year}-{sequence}" format and per-(school, year) scope as
  // StudentsService.generateStudentNumber — a transferred student is a new
  // admission at the destination school, so it gets a fresh code the same
  // way a directly-enrolled student would.
  private async generateStudentNumber(
    schoolId: string,
    academicYearId: string,
    academicYearName: string,
  ): Promise<string> {
    const count = await this.prisma.studentEnrollment.count({ where: { schoolId, academicYearId } });
    const sequence = String(count + 1).padStart(5, "0");
    return `STU-${academicYearName}-${sequence}`;
  }

  // Scoped by academicYearId — see StudentsService.generateRollNumber for why.
  private async generateRollNumber(sectionId: string, academicYearId: string): Promise<number> {
    const result = await this.prisma.studentEnrollment.aggregate({
      where: { sectionId, academicYearId, status: "ACTIVE" },
      _max: { rollNumber: true },
    });
    return (result._max.rollNumber ?? 0) + 1;
  }
}
