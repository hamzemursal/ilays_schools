import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";
import { AuditAction, AuditModuleName } from "../audit/audit-actions";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { MarkStaffAttendanceDto } from "./dto/mark-staff-attendance.dto";

const STAFF_ATTENDANCE_INCLUDE = {
  teacher: { select: { id: true, firstName: true, lastName: true } },
  staff: { select: { id: true, firstName: true, lastName: true } },
} as const;

@Injectable()
export class StaffAttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolsService,
    private readonly audit: AuditService,
  ) {}

  async listForSchool(actor: AuthenticatedUser, schoolId: string, date?: string) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    return this.prisma.staffAttendance.findMany({
      where: { schoolId, ...(date ? { date: new Date(date) } : {}) },
      include: STAFF_ATTENDANCE_INCLUDE,
      orderBy: { date: "desc" },
    });
  }

  // Keyed by (teacherId, staffId, date) — re-marking the same person on the
  // same day corrects that day's record rather than creating a duplicate,
  // same idiom as the student Attendance model's own
  // @@unique([enrollmentId, date]). A plain findFirst-then-create/update
  // (rather than Prisma's upsert) sidesteps having to construct the
  // generated compound-unique-key input by hand for a key with two nullable
  // columns.
  async mark(actor: AuthenticatedUser, schoolId: string, dto: MarkStaffAttendanceDto) {
    await this.schools.findOneAccessibleOrThrow(actor, schoolId);
    const { teacherId, staffId } = await this.resolveExactlyOneEmployee(schoolId, dto.teacherId, dto.staffId);
    const date = new Date(dto.date);

    const existing = await this.prisma.staffAttendance.findFirst({
      where: { teacherId: teacherId ?? null, staffId: staffId ?? null, date },
    });

    const record = existing
      ? await this.prisma.staffAttendance.update({
          where: { id: existing.id },
          data: { status: dto.status, note: dto.note, markedByUserId: actor.id },
          include: STAFF_ATTENDANCE_INCLUDE,
        })
      : await this.prisma.staffAttendance.create({
          data: {
            schoolId,
            teacherId,
            staffId,
            date,
            status: dto.status,
            note: dto.note,
            markedByUserId: actor.id,
          },
          include: STAFF_ATTENDANCE_INCLUDE,
        });

    await this.audit.record({
      actor,
      organizationId: actor.organizationId,
      schoolId,
      action: AuditAction.STAFF_ATTENDANCE_MARKED,
      module: AuditModuleName.STAFF,
      resourceType: "StaffAttendance",
      resourceId: record.id,
      resourceName: this.employeeName(record),
      after: { date: dto.date, status: dto.status },
    });

    return record;
  }

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
