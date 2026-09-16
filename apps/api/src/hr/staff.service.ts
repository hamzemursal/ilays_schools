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

const STAFF_INCLUDE = { department: true } as const;

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly audit: AuditService,
  ) {}

  async listForSchool(actor: AuthenticatedUser, schoolId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    return this.prisma.staff.findMany({
      where: { schoolId },
      include: STAFF_INCLUDE,
      orderBy: { lastName: "asc" },
    });
  }

  async getOne(actor: AuthenticatedUser, schoolId: string, staffId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, schoolId },
      include: STAFF_INCLUDE,
    });
    if (!staff) throw new NotFoundException("Staff member not found in this school");
    return staff;
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
