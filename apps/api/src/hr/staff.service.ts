import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction, AuditModuleName } from "../audit/audit-actions";
import { createWithSequentialCode } from "../common/sequential-code.util";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateStaffDto } from "./dto/create-staff.dto";
import { UpdateStaffDto } from "./dto/update-staff.dto";
import { CreateStaffAssignmentInputDto } from "./dto/create-staff-assignment-input.dto";

// Includes the school a given assignment is actually AT — never assume
// that's the same as the staff member's own home school (Staff.schoolId);
// StaffAssignment.school is what makes this school's admin pages show a
// cross-school-assigned staff member correctly, same as
// TeacherAssignment.school does for Teacher.
const STAFF_ASSIGNMENT_INCLUDE = {
  school: { select: { id: true, name: true, type: true } },
  department: true,
} as const;

const STAFF_INCLUDE = { department: true, assignments: { include: STAFF_ASSIGNMENT_INCLUDE } } as const;

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly audit: AuditService,
  ) {}

  // A staff member shows up here either because this is their home school
  // (Staff.schoolId) or because they hold at least one StaffAssignment at
  // this school despite being employed elsewhere — same OR-matching as
  // TeachersService.listForSchool, for the same reason: a staff member
  // just cross-school-assigned here (see assignToSchool) must not vanish
  // from the very school admin who assigned them.
  async listForSchool(actor: AuthenticatedUser, schoolId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    return this.prisma.staff.findMany({
      where: { OR: [{ schoolId }, { assignments: { some: { schoolId } } }] },
      include: STAFF_INCLUDE,
      orderBy: { lastName: "asc" },
    });
  }

  async getOne(actor: AuthenticatedUser, schoolId: string, staffId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, OR: [{ schoolId }, { assignments: { some: { schoolId } } }] },
      include: STAFF_INCLUDE,
    });
    if (!staff) throw new NotFoundException("Staff member not found in this school");
    return staff;
  }

  // Backs "assign an existing staff member to also work at this school" —
  // the same organization-wide search TeachersService.searchAcrossOrg
  // offers, so a School Admin never creates a second Staff record for
  // someone who already has one elsewhere in the organization.
  async searchAcrossOrg(actor: AuthenticatedUser, schoolId: string, query: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    if (query.trim().length < 2) return [];

    return this.prisma.staff.findMany({
      where: {
        status: "ACTIVE",
        school: { organizationId: actor.organizationId! },
        OR: [
          { firstName: { contains: query, mode: "insensitive" } },
          { lastName: { contains: query, mode: "insensitive" } },
          { staffNumber: { contains: query, mode: "insensitive" } },
          { staffCode: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        staffNumber: true,
        staffCode: true,
        email: true,
        phone: true,
        school: { select: { id: true, name: true, type: true } },
      },
      take: 10,
      orderBy: { lastName: "asc" },
    });
  }

  // Upsert on the [staffId, schoolId] unique pair — assigning someone who
  // already has an (INACTIVE) assignment here reactivates that same row
  // rather than fighting the unique constraint with a second one, which
  // also naturally covers "un-deactivate this person at this school."
  async assignToSchool(actor: AuthenticatedUser, schoolId: string, staffId: string, dto: CreateStaffAssignmentInputDto) {
    const school = await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, school: { organizationId: actor.organizationId! } },
    });
    if (!staff) throw new NotFoundException("Staff member not found in your organization");

    if (dto.departmentId) {
      await this.assertDepartmentBelongsToSchool(schoolId, dto.departmentId);
    }

    const assignment = await this.prisma.staffAssignment.upsert({
      where: { staffId_schoolId: { staffId, schoolId } },
      create: { staffId, schoolId, departmentId: dto.departmentId, role: dto.role, status: "ACTIVE" },
      update: { departmentId: dto.departmentId, role: dto.role, status: "ACTIVE" },
      include: STAFF_ASSIGNMENT_INCLUDE,
    });

    await this.audit.record({
      actor,
      organizationId: school.organizationId,
      schoolId,
      action: AuditAction.STAFF_ASSIGNED_TO_SCHOOL,
      module: AuditModuleName.STAFF,
      resourceType: "Staff",
      resourceId: staffId,
      resourceName: `${staff.firstName} ${staff.lastName}`,
      after: { schoolId, departmentId: dto.departmentId, role: dto.role },
    });

    return assignment;
  }

  // Soft — sets status: INACTIVE rather than deleting the row, so a staff
  // member's assignment history (and their payroll/leave/attendance
  // records, which point at Staff directly and are unaffected either way)
  // is never destroyed just because they've stopped working at this
  // school. assignToSchool's upsert reactivates this exact row later if
  // they come back.
  async deactivateAssignment(actor: AuthenticatedUser, schoolId: string, staffId: string, assignmentId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, school: { organizationId: actor.organizationId! } },
    });
    if (!staff) throw new NotFoundException("Staff member not found in your organization");

    const assignment = await this.prisma.staffAssignment.findFirst({ where: { id: assignmentId, staffId, schoolId } });
    if (!assignment) throw new NotFoundException("Assignment not found for this staff member at this school");

    const updated = await this.prisma.staffAssignment.update({
      where: { id: assignmentId },
      data: { status: "INACTIVE" },
      include: STAFF_ASSIGNMENT_INCLUDE,
    });

    await this.audit.record({
      actor,
      organizationId: actor.organizationId,
      schoolId,
      action: AuditAction.STAFF_ASSIGNMENT_DEACTIVATED,
      module: AuditModuleName.STAFF,
      resourceType: "Staff",
      resourceId: staffId,
      resourceName: `${staff.firstName} ${staff.lastName}`,
    });

    return updated;
  }

  async create(actor: AuthenticatedUser, schoolId: string, dto: CreateStaffDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    if (dto.departmentId) {
      await this.assertDepartmentBelongsToSchool(schoolId, dto.departmentId);
    }

    const staffNumber = dto.staffNumber ?? (await this.generateStaffNumber(schoolId));

    try {
      return await createWithSequentialCode(
        () => this.prisma.staff.count(),
        "STF",
        "staffCode",
        async (staffCode) => {
          const staff = await this.prisma.staff.create({
            data: {
              schoolId,
              firstName: dto.firstName,
              lastName: dto.lastName,
              staffNumber,
              staffCode,
              departmentId: dto.departmentId,
              jobTitle: dto.jobTitle,
              phone: dto.phone,
              email: dto.email,
              address: dto.address,
              employmentDate: dto.employmentDate ? new Date(dto.employmentDate) : undefined,
            },
            include: STAFF_INCLUDE,
          });

          await this.audit.record({
            actor,
            organizationId: actor.organizationId,
            schoolId,
            action: AuditAction.STAFF_CREATED,
            module: AuditModuleName.STAFF,
            resourceType: "Staff",
            resourceId: staff.id,
            resourceName: `${staff.firstName} ${staff.lastName}`,
            after: { firstName: staff.firstName, lastName: staff.lastName, staffNumber: staff.staffNumber, staffCode: staff.staffCode },
          });

          return staff;
        },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A staff member with this staff number already exists in this school");
      }
      throw error;
    }
  }

  async update(actor: AuthenticatedUser, schoolId: string, staffId: string, dto: UpdateStaffDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const staff = await this.prisma.staff.findFirst({ where: { id: staffId, schoolId } });
    if (!staff) throw new NotFoundException("Staff member not found in this school");

    if (dto.departmentId) {
      await this.assertDepartmentBelongsToSchool(schoolId, dto.departmentId);
    }

    const updated = await this.prisma.staff.update({
      where: { id: staffId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        sex: dto.sex,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        departmentId: dto.departmentId,
        jobTitle: dto.jobTitle,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        employmentDate: dto.employmentDate ? new Date(dto.employmentDate) : undefined,
        status: dto.status,
        emergencyContactName: dto.emergencyContactName,
        emergencyContactPhone: dto.emergencyContactPhone,
      },
      include: STAFF_INCLUDE,
    });

    await this.audit.record({
      actor,
      organizationId: actor.organizationId,
      schoolId,
      action: AuditAction.STAFF_UPDATED,
      module: AuditModuleName.STAFF,
      resourceType: "Staff",
      resourceId: staffId,
      resourceName: `${updated.firstName} ${updated.lastName}`,
      after: { ...dto },
    });

    return updated;
  }

  // Genuine permanent deletion, mirroring TeachersService.remove exactly:
  // the linked login account (if any) and this staff member's media files
  // need explicit cleanup since neither is a real cascading FK from Staff.
  async remove(actor: AuthenticatedUser, schoolId: string, staffId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const staff = await this.prisma.staff.findFirst({ where: { id: staffId, schoolId } });
    if (!staff) throw new NotFoundException("Staff member not found in this school");

    await this.prisma.$transaction(async (tx) => {
      await tx.mediaFile.deleteMany({ where: { ownerType: "STAFF", ownerId: staffId } });
      await tx.staff.delete({ where: { id: staffId } });

      if (staff.userId) {
        await tx.user.delete({ where: { id: staff.userId } });
      }

      await this.audit.record(
        {
          actor,
          organizationId: actor.organizationId,
          schoolId,
          action: AuditAction.STAFF_DELETED,
          module: AuditModuleName.STAFF,
          resourceType: "Staff",
          resourceId: staffId,
          resourceName: `${staff.firstName} ${staff.lastName}`,
          severity: "WARNING",
          before: { firstName: staff.firstName, lastName: staff.lastName, staffNumber: staff.staffNumber },
        },
        tx,
      );
    }, { timeout: 30_000 });

    return { success: true };
  }

  // Format: STF-{sequence within this school}, e.g. "STF-00006" — a clean,
  // Staff-specific prefix from day one (unlike Teacher's historical "EMP-",
  // which predates this domain split and is left alone rather than renamed).
  private async generateStaffNumber(schoolId: string): Promise<string> {
    const count = await this.prisma.staff.count({ where: { schoolId } });
    const sequence = String(count + 1).padStart(5, "0");
    return `STF-${sequence}`;
  }

  private async assertDepartmentBelongsToSchool(schoolId: string, departmentId: string) {
    const department = await this.prisma.department.findFirst({ where: { id: departmentId, schoolId } });
    if (!department) throw new BadRequestException("That department does not belong to this school");
  }
}
