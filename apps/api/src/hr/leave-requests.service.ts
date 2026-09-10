import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { LeaveStatus } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { NotificationsService } from "../notifications/notifications.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction, AuditModuleName } from "../audit/audit-actions";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateLeaveRequestDto } from "./dto/create-leave-request.dto";
import { RejectLeaveRequestDto } from "./dto/reject-leave-request.dto";

const LEAVE_REQUEST_INCLUDE = {
  teacher: { select: { id: true, firstName: true, lastName: true } },
  staff: { select: { id: true, firstName: true, lastName: true } },
} as const;

@Injectable()
export class LeaveRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async listForSchool(actor: AuthenticatedUser, schoolId: string, status?: LeaveStatus) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    return this.prisma.leaveRequest.findMany({
      where: { schoolId, ...(status ? { status } : {}) },
      include: LEAVE_REQUEST_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
  }

  async create(actor: AuthenticatedUser, schoolId: string, dto: CreateLeaveRequestDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const { teacherId, staffId } = await this.resolveExactlyOneEmployee(schoolId, dto.teacherId, dto.staffId);

    if (new Date(dto.endDate) < new Date(dto.startDate)) {
      throw new BadRequestException("endDate cannot be before startDate");
    }

    const leaveRequest = await this.prisma.leaveRequest.create({
      data: {
        schoolId,
        teacherId,
        staffId,
        type: dto.type,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        reason: dto.reason,
        requestedByUserId: actor.id,
      },
      include: LEAVE_REQUEST_INCLUDE,
    });

    await this.audit.record({
      actor,
      organizationId: actor.organizationId,
      schoolId,
      action: AuditAction.LEAVE_REQUESTED,
      module: AuditModuleName.STAFF,
      resourceType: "LeaveRequest",
      resourceId: leaveRequest.id,
      resourceName: this.employeeName(leaveRequest),
      after: { type: dto.type, startDate: dto.startDate, endDate: dto.endDate },
    });

    return leaveRequest;
  }

  async approve(actor: AuthenticatedUser, schoolId: string, leaveRequestId: string) {
    const leaveRequest = await this.findPendingOrThrow(actor, schoolId, leaveRequestId);

    const updated = await this.prisma.leaveRequest.update({
      where: { id: leaveRequestId },
      data: { status: "APPROVED", decidedByUserId: actor.id, decidedAt: new Date() },
      include: LEAVE_REQUEST_INCLUDE,
    });

    await this.audit.record({
      actor,
      organizationId: actor.organizationId,
      schoolId,
      action: AuditAction.LEAVE_APPROVED,
      module: AuditModuleName.STAFF,
      resourceType: "LeaveRequest",
      resourceId: leaveRequestId,
      resourceName: this.employeeName(updated),
      before: { status: leaveRequest.status },
      after: { status: updated.status },
    });

    await this.notifyEmployee(leaveRequest.teacherId, leaveRequest.staffId, {
      title: "Leave request approved",
      body: `Your ${leaveRequest.type.toLowerCase()} leave request was approved.`,
    });

    return updated;
  }

  async reject(actor: AuthenticatedUser, schoolId: string, leaveRequestId: string, dto: RejectLeaveRequestDto) {
    const leaveRequest = await this.findPendingOrThrow(actor, schoolId, leaveRequestId);

    const updated = await this.prisma.leaveRequest.update({
      where: { id: leaveRequestId },
      data: { status: "REJECTED", decidedByUserId: actor.id, decidedAt: new Date(), decisionNote: dto.reason },
      include: LEAVE_REQUEST_INCLUDE,
    });

    await this.audit.record({
      actor,
      organizationId: actor.organizationId,
      schoolId,
      action: AuditAction.LEAVE_REJECTED,
      module: AuditModuleName.STAFF,
      resourceType: "LeaveRequest",
      resourceId: leaveRequestId,
      resourceName: this.employeeName(updated),
      before: { status: leaveRequest.status },
      after: { status: updated.status, reason: dto.reason },
    });

    await this.notifyEmployee(leaveRequest.teacherId, leaveRequest.staffId, {
      title: "Leave request rejected",
      body: `Your ${leaveRequest.type.toLowerCase()} leave request was rejected: ${dto.reason}`,
    });

    return updated;
  }

  // Silently a no-op when the teacher/staff has no portal account
  // (Teacher.userId/Staff.userId are optional) — same "notify if reachable"
  // shape as NotificationsService.notifySchoolStaffWithPermission.
  private async notifyEmployee(
    teacherId: string | null,
    staffId: string | null,
    notif: { title: string; body: string },
  ) {
    const userId = teacherId
      ? (await this.prisma.teacher.findFirst({ where: { id: teacherId }, select: { userId: true } }))?.userId
      : (await this.prisma.staff.findFirst({ where: { id: staffId! }, select: { userId: true } }))?.userId;
    if (userId) await this.notifications.notifyUser(userId, notif);
  }

  private async findPendingOrThrow(actor: AuthenticatedUser, schoolId: string, leaveRequestId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const leaveRequest = await this.prisma.leaveRequest.findFirst({ where: { id: leaveRequestId, schoolId } });
    if (!leaveRequest) throw new NotFoundException("Leave request not found in this school");
    if (leaveRequest.status !== "PENDING") {
      throw new BadRequestException(`This leave request has already been ${leaveRequest.status.toLowerCase()}`);
    }
    return leaveRequest;
  }

  // Enforces the "exactly one of teacherId/staffId" invariant this model
  // relies on (see schema comment on LeaveRequest) and that whichever one is
  // given actually belongs to this school — the same shape of check
  // TeachersService.assertAssignmentBelongsToSchool does for assignments.
  private async resolveExactlyOneEmployee(schoolId: string, teacherId?: string, staffId?: string) {
    if (!teacherId === !staffId) {
      throw new BadRequestException("Provide exactly one of teacherId or staffId");
    }

    if (teacherId) {
      const teacher = await this.prisma.teacher.findFirst({ where: { id: teacherId, schoolId } });
      if (!teacher) throw new BadRequestException("That teacher does not belong to this school");
      return { teacherId, staffId: undefined };
    }

    const staff = await this.prisma.staff.findFirst({ where: { id: staffId, schoolId } });
    if (!staff) throw new BadRequestException("That staff member does not belong to this school");
    return { teacherId: undefined, staffId };
  }

  private employeeName(row: {
    teacher: { firstName: string; lastName: string } | null;
    staff: { firstName: string; lastName: string } | null;
  }): string {
    const person = row.teacher ?? row.staff;
    return person ? `${person.firstName} ${person.lastName}` : "(unknown)";
  }
}
