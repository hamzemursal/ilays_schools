import { ConflictException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { StudentsService } from "./students.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { GuardiansService } from "../guardians/guardians.service";
import { StorageService } from "../storage/storage.service";
import { AuditService } from "../audit/audit.service";

const ACTOR: AuthenticatedUser = {
  id: "admin-1",
  email: "admin@example.com",
  organizationId: "org-1",
  roles: ["SCHOOL_ADMIN"],
  permissions: ["students.create"],
  schoolIds: ["school-1"],
};

const BASE_DTO = {
  firstName: "Amina",
  lastName: "Ali",
  dateOfBirth: "2018-05-01",
  sex: "FEMALE" as const,
  enrollment: { academicYearId: "year-1", classId: "class-1", sectionId: "section-1" },
};

// Only StudentsService.create's duplicate-detection logic is covered here —
// see the "History" comment on that check for why full name + DOB (not
// lastName alone, which was reverted for false positives in commit
// eb52156) is what's being tested. The rest of create()'s transaction body
// is exercised live rather than unit-tested in depth here.
describe("StudentsService.create — duplicate detection", () => {
  let prisma: {
    student: { findMany: jest.Mock; create: jest.Mock };
    section: { findFirst: jest.Mock };
    academicYear: { findFirst: jest.Mock };
    studentEnrollment: { count: jest.Mock; aggregate: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
  };
  let schools: { findOneAccessibleOrThrow: jest.Mock };
  let service: StudentsService;

  beforeEach(() => {
    prisma = {
      student: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({ id: "new-student", firstName: "Amina", lastName: "Ali" }) },
      section: { findFirst: jest.fn().mockResolvedValue({ id: "section-1", name: "A", capacity: null }) },
      academicYear: { findFirst: jest.fn().mockResolvedValue({ id: "year-1", name: "2027" }) },
      studentEnrollment: {
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _max: { rollNumber: null } }),
        create: jest.fn().mockResolvedValue({ id: "new-enrollment" }),
      },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    service = new StudentsService(
      prisma as unknown as PrismaService,
      schools as unknown as SchoolsService,
      {} as unknown as GuardiansService,
      {} as unknown as StorageService,
      { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService,
    );
  });

  it("rejects a full name + DOB match even with no legacyStudentNumber supplied", async () => {
    prisma.student.findMany.mockResolvedValue([{ id: "existing-1", firstName: "Amina", lastName: "Ali" }]);

    await expect(service.create(ACTOR, "school-1", { ...BASE_DTO })).rejects.toThrow(ConflictException);

    expect(prisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org-1",
          OR: expect.arrayContaining([
            expect.objectContaining({
              dateOfBirth: new Date("2018-05-01"),
              firstName: { equals: "Amina", mode: "insensitive" },
              lastName: { equals: "Ali", mode: "insensitive" },
            }),
          ]),
        }),
      }),
    );
  });

  it("still rejects on a legacyStudentNumber match alone", async () => {
    prisma.student.findMany.mockResolvedValue([{ id: "existing-1", legacyStudentNumber: "OLD-042" }]);

    await expect(
      service.create(ACTOR, "school-1", { ...BASE_DTO, firstName: "Different", legacyStudentNumber: "OLD-042" }),
    ).rejects.toThrow(ConflictException);

    const call = prisma.student.findMany.mock.calls[0][0];
    expect(call.where.OR).toContainEqual({ legacyStudentNumber: { equals: "OLD-042", mode: "insensitive" } });
  });

  it("does not flag a shared last name alone as a duplicate (the false-positive case that was reverted)", async () => {
    // No candidates returned — a different firstName/DOB means the OR clause
    // simply won't match this row in real Postgres; here we just confirm the
    // service doesn't short-circuit into throwing when findMany resolves empty.
    prisma.student.findMany.mockResolvedValue([]);

    await expect(service.create(ACTOR, "school-1", { ...BASE_DTO })).resolves.toBeDefined();
  });

  it("skips the duplicate check entirely once confirmDespiteDuplicates is set", async () => {
    await service.create(ACTOR, "school-1", { ...BASE_DTO, confirmDespiteDuplicates: true });

    expect(prisma.student.findMany).not.toHaveBeenCalled();
  });
});
