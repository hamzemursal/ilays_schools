import { BadRequestException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { AttendanceService } from "./attendance.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { StudentsService } from "../students/students.service";
import { AuditService } from "../audit/audit.service";
import { DocumentsService } from "../documents/documents.service";
import type { MarkAttendanceDto } from "./dto/mark-attendance.dto";

const ADMIN_ACTOR: AuthenticatedUser = {
  id: "admin-1",
  email: "admin@example.com",
  organizationId: "org-1",
  roles: ["SCHOOL_ADMIN"],
  permissions: ["attendance.mark"],
  schoolIds: ["school-1"],
};

function tomorrow(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function dto(date: string): MarkAttendanceDto {
  return { date, entries: [{ enrollmentId: "enr-1", status: "PRESENT" }] };
}

describe("AttendanceService — future-date guard", () => {
  let prisma: {
    teacher: { findFirst: jest.Mock };
    section: { findFirst: jest.Mock };
    studentEnrollment: { findMany: jest.Mock };
    attendance: { upsert: jest.Mock };
    attendanceDraft: { upsert: jest.Mock; deleteMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let schools: { findOneAccessibleOrThrow: jest.Mock };
  let service: AttendanceService;

  beforeEach(() => {
    prisma = {
      teacher: { findFirst: jest.fn().mockResolvedValue(null) }, // actor is an Admin, not a Teacher
      section: { findFirst: jest.fn().mockResolvedValue({ id: "section-1" }) },
      studentEnrollment: { findMany: jest.fn().mockResolvedValue([{ id: "enr-1" }]) },
      attendance: { upsert: jest.fn() },
      attendanceDraft: { upsert: jest.fn(), deleteMany: jest.fn() },
      $transaction: jest.fn().mockResolvedValue(undefined),
    };
    schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    service = new AttendanceService(
      prisma as unknown as PrismaService,
      schools as unknown as SchoolsService,
      {} as unknown as StudentsService,
      { record: jest.fn() } as unknown as AuditService,
      {} as unknown as DocumentsService,
    );
    // getForSectionAndDate does its own separate round of queries (including
    // photo lookups) that this test isn't about — short-circuited here so
    // each test only exercises the guard being verified.
    jest.spyOn(service, "getForSectionAndDate").mockResolvedValue([]);
  });

  it("mark() rejects a future date before touching any enrollment or attendance data", async () => {
    await expect(service.mark(ADMIN_ACTOR, "school-1", "section-1", dto(tomorrow()))).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.mark(ADMIN_ACTOR, "school-1", "section-1", dto(tomorrow()))).rejects.toThrow(
      "Attendance cannot be marked for a future date",
    );
    expect(prisma.studentEnrollment.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("mark() accepts today's date", async () => {
    await expect(service.mark(ADMIN_ACTOR, "school-1", "section-1", dto(today()))).resolves.toEqual([]);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("saveDraft() rejects a future date before touching any enrollment or attendance data", async () => {
    await expect(service.saveDraft(ADMIN_ACTOR, "school-1", "section-1", dto(tomorrow()))).rejects.toThrow(
      "Attendance cannot be marked for a future date",
    );
    expect(prisma.studentEnrollment.findMany).not.toHaveBeenCalled();
  });

  it("saveDraft() accepts today's date", async () => {
    await expect(service.saveDraft(ADMIN_ACTOR, "school-1", "section-1", dto(today()))).resolves.toEqual([]);
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
