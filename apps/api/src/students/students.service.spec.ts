import { ConflictException, NotFoundException } from "@nestjs/common";
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
      section: { findFirst: jest.fn().mockResolvedValue({ id: "section-1", name: "A", capacity: null, class: { name: "Form 1", academicYearId: "year-1" } }) },
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

  it("an enrollment must point at the class of ITS OWN academic year: a class of another year is refused", async () => {
    prisma.section.findFirst.mockResolvedValue({ id: "section-1", name: "A", capacity: null, class: { name: "Form 1", academicYearId: "year-2" } });

    await expect(service.create(ACTOR, "school-1", { ...BASE_DTO })).rejects.toThrow(/Form 1 belongs to a different academic year/);
    expect(prisma.student.create).not.toHaveBeenCalled();
    expect(prisma.studentEnrollment.create).not.toHaveBeenCalled();
  });

  it("an unstamped legacy class (no academic year yet) is refused, nothing is created", async () => {
    prisma.section.findFirst.mockResolvedValue({ id: "section-1", name: "A", capacity: null, class: { name: "Form 1", academicYearId: null } });

    await expect(service.create(ACTOR, "school-1", { ...BASE_DTO })).rejects.toThrow(/has no academic year yet/);
    expect(prisma.student.create).not.toHaveBeenCalled();
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


describe("StudentsService.update — enrollment correction points at the class of the enrollment's year", () => {
  const tx = {
    student: { update: jest.fn().mockResolvedValue({}) },
    studentEnrollment: { findFirst: jest.fn(), count: jest.fn().mockResolvedValue(0), update: jest.fn() },
    section: { findFirst: jest.fn() },
    academicYear: { findFirst: jest.fn() },
  };
  let service: StudentsService;

  const ENROLLMENT = { academicYearId: "year-2", classId: "class-f3-26", sectionId: "sec-1" };

  beforeEach(() => {
    jest.clearAllMocks();
    tx.studentEnrollment.findFirst.mockResolvedValue({
      id: "enr-1", schoolId: "school-1", academicYearId: "year-1", classId: "class-f3-25", sectionId: "sec-0", rollNumber: 4,
    });
    tx.academicYear.findFirst.mockResolvedValue({ id: "year-2", name: "2026-2027" });
    const prisma = { $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)) };
    service = new StudentsService(
      prisma as unknown as PrismaService,
      {} as unknown as SchoolsService,
      {} as unknown as GuardiansService,
      {} as unknown as StorageService,
      { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService,
    );
    (jest.spyOn(service as unknown as { assertAccessibleStudent: () => Promise<unknown> }, "assertAccessibleStudent") as jest.SpyInstance).mockResolvedValue({});
    (jest.spyOn(service as unknown as { getFullDetail: () => Promise<unknown> }, "getFullDetail") as jest.SpyInstance).mockResolvedValue({});
  });

  it("moves an enrollment into a class of ITS OWN year", async () => {
    tx.section.findFirst.mockResolvedValue({ id: "sec-1", capacity: null, name: "A", class: { name: "Form 3", academicYearId: "year-2" } });

    await service.update(ACTOR, "student-1", { enrollment: ENROLLMENT } as never);

    expect(tx.studentEnrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ academicYearId: "year-2", classId: "class-f3-26", sectionId: "sec-1" }) }),
    );
  });

  it("refuses a class of another year", async () => {
    tx.section.findFirst.mockResolvedValue({ id: "sec-1", capacity: null, name: "A", class: { name: "Form 3", academicYearId: "year-1" } });

    await expect(service.update(ACTOR, "student-1", { enrollment: ENROLLMENT } as never)).rejects.toThrow(/Form 3 belongs to a different academic year/);
    expect(tx.studentEnrollment.update).not.toHaveBeenCalled();
  });

  it("refuses an unstamped legacy class", async () => {
    tx.section.findFirst.mockResolvedValue({ id: "sec-1", capacity: null, name: "A", class: { name: "Form 3", academicYearId: null } });

    await expect(service.update(ACTOR, "student-1", { enrollment: ENROLLMENT } as never)).rejects.toThrow(/has no academic year yet/);
    expect(tx.studentEnrollment.update).not.toHaveBeenCalled();
  });
});

// getResultsReport is a thin authorization wrapper around the shared,
// already-exhaustively-tested buildStudentResultsReport() (see
// exams/student-results-report.spec.ts for the per-year isolation,
// published-only, and term-grouping behavior). These tests cover only what
// this wrapper adds: student-level and (for a specific requested year)
// school-level access control.
describe("StudentsService.getResultsReport — access control", () => {
  const SCHOOL_SCOPED_ACTOR: AuthenticatedUser = {
    id: "admin-1",
    email: "admin@example.com",
    organizationId: "org-1",
    roles: ["SCHOOL_ADMIN"],
    permissions: ["students.view"],
    schoolIds: ["school-a"],
  };
  const ORG_WIDE_ACTOR: AuthenticatedUser = { ...SCHOOL_SCOPED_ACTOR, id: "super-1", schoolIds: [] };

  let prisma: {
    student: { findUnique: jest.Mock };
    studentEnrollment: { findFirst: jest.Mock; findMany: jest.Mock };
    term: { findMany: jest.Mock };
    result: { findMany: jest.Mock };
  };
  let service: StudentsService;

  beforeEach(() => {
    prisma = {
      student: { findUnique: jest.fn() },
      studentEnrollment: { findFirst: jest.fn(), findMany: jest.fn() },
      term: { findMany: jest.fn() },
      result: { findMany: jest.fn() },
    };
    prisma.term.findMany.mockResolvedValue([]);
    prisma.result.findMany.mockResolvedValue([]);
    service = new StudentsService(
      prisma as unknown as PrismaService,
      {} as unknown as SchoolsService,
      {} as unknown as GuardiansService,
      {} as unknown as StorageService,
      {} as unknown as AuditService,
    );
  });

  it("refuses a student from a different organization (results from another student/org never leak)", async () => {
    prisma.student.findUnique.mockResolvedValue({ id: "student-1", organizationId: "org-OTHER", enrollments: [] });

    await expect(service.getResultsReport(SCHOOL_SCOPED_ACTOR, "student-1")).rejects.toThrow(NotFoundException);
    expect(prisma.studentEnrollment.findMany).not.toHaveBeenCalled();
  });

  it("refuses when the actor has no accessible enrollment for this student at all", async () => {
    prisma.student.findUnique.mockResolvedValue({
      id: "student-1",
      organizationId: "org-1",
      enrollments: [{ schoolId: "school-UNRELATED" }],
    });

    await expect(service.getResultsReport(SCHOOL_SCOPED_ACTOR, "student-1")).rejects.toThrow(NotFoundException);
  });

  it("refuses a specific academicYearId whose enrollment belongs to a school the actor cannot access, even though the student has SOME accessible enrollment (e.g. after a transfer)", async () => {
    // The student is now at school-a (accessible) but this request asks for
    // their OLD year at school-OLD (not accessible) — must never expose it.
    prisma.student.findUnique.mockResolvedValue({
      id: "student-1",
      organizationId: "org-1",
      enrollments: [{ schoolId: "school-a" }, { schoolId: "school-OLD" }],
    });
    prisma.studentEnrollment.findFirst.mockResolvedValue({ schoolId: "school-OLD" });

    await expect(service.getResultsReport(SCHOOL_SCOPED_ACTOR, "student-1", "year-old")).rejects.toThrow(NotFoundException);
    expect(prisma.studentEnrollment.findMany).not.toHaveBeenCalled();
  });

  it("allows a specific academicYearId whose enrollment belongs to an accessible school", async () => {
    prisma.student.findUnique.mockResolvedValue({
      id: "student-1",
      organizationId: "org-1",
      enrollments: [{ schoolId: "school-a" }],
    });
    prisma.studentEnrollment.findFirst.mockResolvedValue({ schoolId: "school-a" });
    prisma.studentEnrollment.findMany.mockResolvedValue([
      {
        id: "enr-1",
        academicYearId: "year-a",
        academicYear: { id: "year-a", name: "2026", isCurrent: false },
        school: { name: "School A" },
        class: { name: "Form 2" },
        section: { name: "B" },
      },
    ]);

    const report = await service.getResultsReport(SCHOOL_SCOPED_ACTOR, "student-1", "year-a");

    expect(report.academicYear.id).toBe("year-a");
    expect(prisma.studentEnrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studentId: "student-1", academicYearId: "year-a" } }),
    );
  });

  it("skips the per-year school check for an org-wide actor (no schoolIds restriction)", async () => {
    prisma.student.findUnique.mockResolvedValue({ id: "student-1", organizationId: "org-1", enrollments: [] });
    prisma.studentEnrollment.findMany.mockResolvedValue([
      {
        id: "enr-1",
        academicYearId: "year-a",
        academicYear: { id: "year-a", name: "2026", isCurrent: false },
        school: { name: "School A" },
        class: { name: "Form 2" },
        section: { name: "B" },
      },
    ]);

    const report = await service.getResultsReport(ORG_WIDE_ACTOR, "student-1", "year-a");

    expect(report.academicYear.id).toBe("year-a");
    expect(prisma.studentEnrollment.findFirst).not.toHaveBeenCalled();
  });

  it("skips the per-year school check when no academicYearId is given (defaults to the current enrollment's year)", async () => {
    prisma.student.findUnique.mockResolvedValue({
      id: "student-1",
      organizationId: "org-1",
      enrollments: [{ schoolId: "school-a" }],
    });
    prisma.studentEnrollment.findMany.mockResolvedValue([
      {
        id: "enr-1",
        status: "ACTIVE",
        academicYearId: "year-current",
        academicYear: { id: "year-current", name: "2027", isCurrent: true },
        school: { name: "School A" },
        class: { name: "Form 3" },
        section: { name: "A" },
      },
    ]);

    const report = await service.getResultsReport(SCHOOL_SCOPED_ACTOR, "student-1");

    expect(report.academicYear.id).toBe("year-current");
    expect(prisma.studentEnrollment.findFirst).not.toHaveBeenCalled();
  });
});
