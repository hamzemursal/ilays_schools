import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { RequestTransferDto } from "./dto/request-transfer.dto";
import { ApproveTransferDto } from "./dto/approve-transfer.dto";

@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
  ) {}

  async request(actor: AuthenticatedUser, studentId: string, dto: RequestTransferDto) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { enrollments: { where: { status: "ACTIVE" } } },
    });
    if (!student || student.organizationId !== actor.organizationId) {
      throw new NotFoundException("Student not found");
    }

    const activeEnrollment = student.enrollments[0];
    if (!activeEnrollment) {
      throw new BadRequestException("Student has no active enrollment to transfer from");
    }
    if (actor.schoolIds.length > 0 && !actor.schoolIds.includes(activeEnrollment.schoolId)) {
      throw new NotFoundException("Student not found");
    }
    if (activeEnrollment.schoolId === dto.toSchoolId) {
      throw new BadRequestException("Student is already enrolled at that school");
    }

    const destSchool = await this.prisma.school.findFirst({
      where: { id: dto.toSchoolId, organizationId: actor.organizationId },
    });
    if (!destSchool) throw new BadRequestException("Destination school not found in this organization");

    const transfer = await this.prisma.transfer.create({
      data: {
        studentId,
        fromEnrollmentId: activeEnrollment.id,
        fromSchoolId: activeEnrollment.schoolId,
        toSchoolId: dto.toSchoolId,
        reason: dto.reason,
        status: "REQUESTED",
        requestedByUserId: actor.id,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        schoolId: activeEnrollment.schoolId,
        actorUserId: actor.id,
        action: "transfer.request",
        resource: "Transfer",
        resourceId: transfer.id,
        after: { toSchoolId: dto.toSchoolId, reason: dto.reason },
      },
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

      await tx.transfer.update({
        where: { id: transferId },
        data: {
          status: "EXECUTED",
          toEnrollmentId: newEnrollment.id,
          approvedByUserId: actor.id,
          transferDate: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          schoolId: transfer.toSchoolId,
          actorUserId: actor.id,
          action: "transfer.approve",
          resource: "Transfer",
          resourceId: transferId,
          after: { newEnrollmentId: newEnrollment.id, studentNumber, rollNumber },
        },
      });
    });

    return this.getOne(actor, transferId);
  }

  async reject(actor: AuthenticatedUser, transferId: string) {
    const transfer = await this.prisma.transfer.findUnique({ where: { id: transferId } });
    if (!transfer) throw new NotFoundException("Transfer not found");
    if (transfer.status !== "REQUESTED") throw new BadRequestException("Transfer is not pending");

    const hasAccess =
      actor.schoolIds.length === 0 ||
      actor.schoolIds.includes(transfer.fromSchoolId) ||
      actor.schoolIds.includes(transfer.toSchoolId);
    if (!hasAccess) throw new NotFoundException("Transfer not found");

    await this.prisma.transfer.update({ where: { id: transferId }, data: { status: "REJECTED" } });

    await this.prisma.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.id,
        action: "transfer.reject",
        resource: "Transfer",
        resourceId: transferId,
      },
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

    await this.prisma.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.id,
        action: "transfer.cancel",
        resource: "Transfer",
        resourceId: transferId,
      },
    });

    return this.getOne(actor, transferId);
  }

  async listForSchool(actor: AuthenticatedUser, schoolId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const transfers = await this.prisma.transfer.findMany({
      where: { OR: [{ fromSchoolId: schoolId }, { toSchoolId: schoolId }] },
      include: this.fullInclude(),
      orderBy: { createdAt: "desc" },
    });
    return this.enrich(transfers);
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
