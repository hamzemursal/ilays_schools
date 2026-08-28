import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
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

    return transfer;
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

    const activeCount = await this.prisma.studentEnrollment.count({
      where: { sectionId: section.id, status: "ACTIVE" },
    });
    if (activeCount >= section.capacity) {
      throw new BadRequestException(`Section ${section.name} is at capacity (${section.capacity})`);
    }

    const studentNumber = dto.studentNumber ?? (await this.generateStudentNumber(transfer.toSchoolId));
    const rollNumber = dto.rollNumber ?? (await this.generateRollNumber(section.id));

    return this.prisma.$transaction(async (tx) => {
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

      const updated = await tx.transfer.update({
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

      return updated;
    });
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

    const updated = await this.prisma.transfer.update({ where: { id: transferId }, data: { status: "REJECTED" } });

    await this.prisma.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.id,
        action: "transfer.reject",
        resource: "Transfer",
        resourceId: transferId,
      },
    });

    return updated;
  }

  async listForSchool(actor: AuthenticatedUser, schoolId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    return this.prisma.transfer.findMany({
      where: { OR: [{ fromSchoolId: schoolId }, { toSchoolId: schoolId }] },
      include: { student: true },
      orderBy: { createdAt: "desc" },
    });
  }

  private async generateStudentNumber(schoolId: string): Promise<string> {
    const count = await this.prisma.studentEnrollment.count({ where: { schoolId } });
    return String(count + 1).padStart(5, "0");
  }

  private async generateRollNumber(sectionId: string): Promise<number> {
    const result = await this.prisma.studentEnrollment.aggregate({
      where: { sectionId, status: "ACTIVE" },
      _max: { rollNumber: true },
    });
    return (result._max.rollNumber ?? 0) + 1;
  }
}
