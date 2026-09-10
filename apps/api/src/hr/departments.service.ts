import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction, AuditModuleName } from "../audit/audit-actions";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { CreateDepartmentDto } from "./dto/create-department.dto";
import { UpdateDepartmentDto } from "./dto/update-department.dto";

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly audit: AuditService,
  ) {}

  // Includes ARCHIVED departments — the UI is expected to show/filter them
  // itself (e.g. so an archived department a staff member still references
  // isn't just invisible), same idiom as GuardianStatus/StudentGuardianStatus
  // elsewhere in this schema.
  async listForSchool(actor: AuthenticatedUser, schoolId: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    return this.prisma.department.findMany({ where: { schoolId }, orderBy: { name: "asc" } });
  }

  async create(actor: AuthenticatedUser, schoolId: string, dto: CreateDepartmentDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);

    try {
      const department = await this.prisma.department.create({
        data: { schoolId, name: dto.name },
      });

      await this.audit.record({
        actor,
        organizationId: actor.organizationId,
        schoolId,
        action: AuditAction.DEPARTMENT_CREATED,
        module: AuditModuleName.STAFF,
        resourceType: "Department",
        resourceId: department.id,
        resourceName: department.name,
        after: { name: department.name },
      });

      return department;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A department with this name already exists in this school");
      }
      throw error;
    }
  }

  // Departments are never hard-deleted — a Staff row may still reference one
  // historically (departmentId is onDelete: SetNull only if the row itself
  // were removed, which this never does). Renaming/archiving is the only
  // supported change.
  async update(actor: AuthenticatedUser, schoolId: string, departmentId: string, dto: UpdateDepartmentDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const department = await this.prisma.department.findFirst({ where: { id: departmentId, schoolId } });
    if (!department) throw new NotFoundException("Department not found in this school");

    try {
      const updated = await this.prisma.department.update({
        where: { id: departmentId },
        data: { name: dto.name, status: dto.status },
      });

      await this.audit.record({
        actor,
        organizationId: actor.organizationId,
        schoolId,
        action: AuditAction.DEPARTMENT_UPDATED,
        module: AuditModuleName.STAFF,
        resourceType: "Department",
        resourceId: department.id,
        resourceName: updated.name,
        before: { name: department.name, status: department.status },
        after: { name: updated.name, status: updated.status },
      });

      return updated;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A department with this name already exists in this school");
      }
      throw error;
    }
  }
}
