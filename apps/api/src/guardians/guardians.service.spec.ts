import { ConflictException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { GuardiansService } from "./guardians.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";

function actorFor(schoolIds: string[]): AuthenticatedUser {
  return {
    id: "user-1",
    email: "user@example.com",
    organizationId: "org-1",
    roles: ["SCHOOL_ADMIN"],
    permissions: ["guardians.view"],
    schoolIds,
  };
}

const GUARDIAN_LINK = {
  relationship: "MOTHER",
  isPrimaryContact: true,
  guardian: { id: "guardian-1", firstName: "Amina", lastName: "Warfa", phone: "555-0100", email: null },
};

describe("GuardiansService.listForStudent", () => {
  let prisma: {
    studentEnrollment: { findFirst: jest.Mock };
    studentGuardian: { findMany: jest.Mock };
  };
  let service: GuardiansService;

  beforeEach(() => {
    prisma = {
      studentEnrollment: { findFirst: jest.fn() },
      studentGuardian: { findMany: jest.fn().mockResolvedValue([GUARDIAN_LINK]) },
    };
    service = new GuardiansService(
      prisma as unknown as PrismaService,
      {} as unknown as SchoolsService,
      {} as unknown as AuditService,
    );
  });

  it("returns guardians for an org-wide actor (Super Admin) without checking for a current enrollment", async () => {
    const result = await service.listForStudent(actorFor([]), "student-1");

    expect(prisma.studentEnrollment.findFirst).not.toHaveBeenCalled();
    expect(result).toEqual([{ id: "guardian-1", firstName: "Amina", lastName: "Warfa", phone: "555-0100", email: null, relationship: "MOTHER", isPrimaryContact: true }]);
  });

  it("returns guardians for a school-scoped actor when the student has an active enrollment at that school", async () => {
    prisma.studentEnrollment.findFirst.mockResolvedValue({ id: "enrollment-1" });

    const result = await service.listForStudent(actorFor(["school-A"]), "student-1");

    expect(prisma.studentEnrollment.findFirst).toHaveBeenCalledWith({
      where: { studentId: "student-1", status: "ACTIVE", schoolId: { in: ["school-A"] } },
      select: { id: true },
    });
    expect(result).toHaveLength(1);
  });

  // This is the gap being closed: a school with no CURRENT enrollment for
  // this student (e.g. the student transferred away) must not see the
  // family's current contact details, even though it may still be allowed
  // to view the rest of the student's profile for historical reasons.
  it("returns no guardians for a school-scoped actor with no current enrollment at that school", async () => {
    prisma.studentEnrollment.findFirst.mockResolvedValue(null);

    const result = await service.listForStudent(actorFor(["school-B"]), "student-1");

    expect(prisma.studentGuardian.findMany).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});

describe("GuardiansService.searchForSchool", () => {
  function makeService() {
    const prisma = { guardian: { findMany: jest.fn() } };
    const service = new GuardiansService(
      prisma as unknown as PrismaService,
      {} as unknown as SchoolsService,
      {} as unknown as AuditService,
    );
    return { prisma, service };
  }

  function rawGuardian(overrides: Record<string, unknown> = {}) {
    return {
      id: "guardian-1",
      firstName: "Ahmed",
      lastName: "Hassan",
      phone: "0611111111",
      email: "ahmed@example.com",
      students: [{ studentId: "stu-a" }, { studentId: "stu-b" }],
      ...overrides,
    };
  }

  it("returns nothing for a query shorter than 2 characters, without querying the database", async () => {
    const { service, prisma } = makeService();
    const result = await service.searchForSchool("org-1", "school-1", "A");
    expect(result).toEqual([]);
    expect(prisma.guardian.findMany).not.toHaveBeenCalled();
  });

  it("searches by first/last name", async () => {
    const { service, prisma } = makeService();
    prisma.guardian.findMany.mockResolvedValue([rawGuardian()]);

    await service.searchForSchool("org-1", "school-1", "Ahmed");

    const where = prisma.guardian.findMany.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({ firstName: { contains: "Ahmed", mode: "insensitive" } });
    expect(where.OR).toContainEqual({ lastName: { contains: "Ahmed", mode: "insensitive" } });
  });

  it("searches by phone", async () => {
    const { service, prisma } = makeService();
    prisma.guardian.findMany.mockResolvedValue([rawGuardian()]);

    await service.searchForSchool("org-1", "school-1", "0611111111");

    const where = prisma.guardian.findMany.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({ phone: { contains: "0611111111" } });
  });

  it("searches by email", async () => {
    const { service, prisma } = makeService();
    prisma.guardian.findMany.mockResolvedValue([rawGuardian()]);

    await service.searchForSchool("org-1", "school-1", "ahmed@example.com");

    const where = prisma.guardian.findMany.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({ email: { contains: "ahmed@example.com", mode: "insensitive" } });
  });

  it("scopes results to guardians linked to a student enrolled at this school within this organization", async () => {
    const { service, prisma } = makeService();
    prisma.guardian.findMany.mockResolvedValue([]);

    await service.searchForSchool("org-1", "school-1", "Ahmed");

    const where = prisma.guardian.findMany.mock.calls[0][0].where;
    expect(where.students).toEqual({
      some: { student: { organizationId: "org-1", enrollments: { some: { schoolId: "school-1" } } } },
    });
  });

  it("includes how many students (in this school) each result is already linked to", async () => {
    const { service, prisma } = makeService();
    prisma.guardian.findMany.mockResolvedValue([rawGuardian({ students: [{ studentId: "stu-a" }, { studentId: "stu-b" }] })]);

    const result = await service.searchForSchool("org-1", "school-1", "Ahmed");

    expect(result).toEqual([
      { id: "guardian-1", firstName: "Ahmed", lastName: "Hassan", phone: "0611111111", email: "ahmed@example.com", linkedStudentCount: 2 },
    ]);
  });

  it("only counts ACTIVE links to students currently enrolled at this school", async () => {
    const { service, prisma } = makeService();
    prisma.guardian.findMany.mockResolvedValue([rawGuardian()]);

    await service.searchForSchool("org-1", "school-1", "Ahmed");

    const studentsInclude = prisma.guardian.findMany.mock.calls[0][0].include.students;
    expect(studentsInclude.where).toEqual({ status: "ACTIVE", student: { enrollments: { some: { schoolId: "school-1" } } } });
  });
});

describe("GuardiansService.findOrCreate — duplicate prevention", () => {
  function makeTx() {
    return {
      guardian: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    };
  }
  function makeService() {
    return new GuardiansService({} as unknown as PrismaService, {} as unknown as SchoolsService, {} as unknown as AuditService);
  }

  it("links directly to existingGuardianId without creating or searching for anything else", async () => {
    const service = makeService();
    const tx = makeTx();
    tx.guardian.findUnique.mockResolvedValue({
      id: "guardian-1",
      firstName: "Ahmed",
      lastName: "Hassan",
      students: [{ student: { organizationId: "org-1" } }],
    });

    const result = await service.findOrCreate(tx as unknown as Parameters<typeof service.findOrCreate>[0], "org-1", {
      existingGuardianId: "guardian-1",
      firstName: "Ignored",
      lastName: "Ignored",
      relationship: "FATHER",
    });

    expect(result).toEqual({ id: "guardian-1", firstName: "Ahmed", lastName: "Hassan" });
    expect(tx.guardian.findFirst).not.toHaveBeenCalled();
    expect(tx.guardian.create).not.toHaveBeenCalled();
  });

  it("allows linking a brand-new guardian with zero relationships yet, regardless of organization", async () => {
    const service = makeService();
    const tx = makeTx();
    tx.guardian.findUnique.mockResolvedValue({ id: "guardian-1", firstName: "Ahmed", lastName: "Hassan", students: [] });

    const result = await service.findOrCreate(tx as unknown as Parameters<typeof service.findOrCreate>[0], "org-1", {
      existingGuardianId: "guardian-1",
      firstName: "Ignored",
      lastName: "Ignored",
      relationship: "FATHER",
    });

    expect(result.id).toBe("guardian-1");
  });

  it("throws when existingGuardianId no longer exists", async () => {
    const service = makeService();
    const tx = makeTx();
    tx.guardian.findUnique.mockResolvedValue(null);

    await expect(
      service.findOrCreate(tx as unknown as Parameters<typeof service.findOrCreate>[0], "org-1", {
        existingGuardianId: "gone",
        firstName: "A",
        lastName: "B",
        relationship: "FATHER",
      }),
    ).rejects.toThrow("Selected guardian no longer exists");
  });

  // The security case: existingGuardianId is a raw client-supplied id, never
  // trusted just because the search UI that normally supplies it is
  // properly scoped — a guardian whose only relationships are in a
  // DIFFERENT organization must be refused here too, not just filtered out
  // of search results.
  it("refuses to link an existingGuardianId belonging to a different organization", async () => {
    const service = makeService();
    const tx = makeTx();
    tx.guardian.findUnique.mockResolvedValue({
      id: "guardian-1",
      firstName: "Ahmed",
      lastName: "Hassan",
      students: [{ student: { organizationId: "org-OTHER" } }],
    });

    await expect(
      service.findOrCreate(tx as unknown as Parameters<typeof service.findOrCreate>[0], "org-1", {
        existingGuardianId: "guardian-1",
        firstName: "Ignored",
        lastName: "Ignored",
        relationship: "FATHER",
      }),
    ).rejects.toThrow("Selected guardian no longer exists");
    expect(tx.guardian.create).not.toHaveBeenCalled();
  });

  it("reuses an existing guardian by exact phone match instead of creating a duplicate", async () => {
    const service = makeService();
    const tx = makeTx();
    tx.guardian.findFirst.mockResolvedValue({ id: "guardian-1", firstName: "Ahmed", lastName: "Hassan", phone: "0611111111" });

    const result = await service.findOrCreate(tx as unknown as Parameters<typeof service.findOrCreate>[0], "org-1", {
      firstName: "Ahmed",
      lastName: "Hassan",
      phone: "0611111111",
      relationship: "FATHER",
    });

    expect(result.id).toBe("guardian-1");
    expect(tx.guardian.create).not.toHaveBeenCalled();
  });

  it("reuses an existing guardian by exact email match when phone doesn't match", async () => {
    const service = makeService();
    const tx = makeTx();
    tx.guardian.findFirst.mockImplementation(({ where }: { where: { phone?: string; email?: string } }) =>
      where.email === "ahmed@example.com" ? { id: "guardian-1", firstName: "Ahmed", lastName: "Hassan" } : null,
    );

    const result = await service.findOrCreate(tx as unknown as Parameters<typeof service.findOrCreate>[0], "org-1", {
      firstName: "Ahmed",
      lastName: "Hassan",
      email: "ahmed@example.com",
      relationship: "FATHER",
    });

    expect(result.id).toBe("guardian-1");
    expect(tx.guardian.create).not.toHaveBeenCalled();
  });

  it("creates a new guardian only when neither existingGuardianId nor a phone/email match is found", async () => {
    const service = makeService();
    const tx = makeTx();
    tx.guardian.findFirst.mockResolvedValue(null);
    tx.guardian.create.mockResolvedValue({ id: "guardian-new", firstName: "Yusuf", lastName: "Warsame" });

    const result = await service.findOrCreate(tx as unknown as Parameters<typeof service.findOrCreate>[0], "org-1", {
      firstName: "Yusuf",
      lastName: "Warsame",
      phone: "0699999999",
      relationship: "FATHER",
    });

    expect(result.id).toBe("guardian-new");
    expect(tx.guardian.create).toHaveBeenCalledTimes(1);
  });

  it("name alone never triggers a match — no phone/email provided always creates a new record", async () => {
    const service = makeService();
    const tx = makeTx();
    tx.guardian.create.mockResolvedValue({ id: "guardian-new" });

    await service.findOrCreate(tx as unknown as Parameters<typeof service.findOrCreate>[0], "org-1", {
      firstName: "Ahmed",
      lastName: "Hassan",
      relationship: "FATHER",
    });

    expect(tx.guardian.findFirst).not.toHaveBeenCalled();
    expect(tx.guardian.create).toHaveBeenCalledTimes(1);
  });
});

describe("GuardiansService.linkToStudent — one parent, many children", () => {
  function makeService() {
    const tx = { studentGuardian: { upsert: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new GuardiansService({} as unknown as PrismaService, {} as unknown as SchoolsService, {} as unknown as AuditService);
    return { service, tx };
  }

  it("links the same guardian to two different students as two separate StudentGuardian rows", async () => {
    const { service, tx } = makeService();

    await service.linkToStudent(tx as unknown as Parameters<typeof service.linkToStudent>[0], "student-A", "guardian-1", "FATHER", false);
    await service.linkToStudent(tx as unknown as Parameters<typeof service.linkToStudent>[0], "student-B", "guardian-1", "FATHER", false);

    expect(tx.studentGuardian.upsert).toHaveBeenCalledTimes(2);
    expect(tx.studentGuardian.upsert).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { studentId_guardianId: { studentId: "student-A", guardianId: "guardian-1" } } }));
    expect(tx.studentGuardian.upsert).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: { studentId_guardianId: { studentId: "student-B", guardianId: "guardian-1" } } }));
  });

  it("relinking the same student/guardian pair upserts (reactivates) rather than duplicating", async () => {
    const { service, tx } = makeService();

    await service.linkToStudent(tx as unknown as Parameters<typeof service.linkToStudent>[0], "student-A", "guardian-1", "MOTHER", true);

    expect(tx.studentGuardian.upsert).toHaveBeenCalledWith({
      where: { studentId_guardianId: { studentId: "student-A", guardianId: "guardian-1" } },
      update: { relationship: "MOTHER", isPrimaryContact: true, status: "ACTIVE" },
      create: { studentId: "student-A", guardianId: "guardian-1", relationship: "MOTHER", isPrimaryContact: true },
    });
  });
});

describe("GuardiansService.linkToStudent — a student has at most one Mother and one Father", () => {
  type Tx = Parameters<GuardiansService["linkToStudent"]>[0];

  function makeService(existingHolder: { guardian: { firstName: string; lastName: string } } | null = null) {
    const tx = { studentGuardian: { upsert: jest.fn().mockResolvedValue({}), findFirst: jest.fn().mockResolvedValue(existingHolder) } };
    const service = new GuardiansService({} as unknown as PrismaService, {} as unknown as SchoolsService, {} as unknown as AuditService);
    return { service, tx };
  }

  it("rejects a second Mother, naming the existing one, and writes nothing", async () => {
    const { service, tx } = makeService({ guardian: { firstName: "Amina", lastName: "Ali" } });

    await expect(service.linkToStudent(tx as unknown as Tx, "student-A", "guardian-2", "MOTHER", false)).rejects.toThrow(ConflictException);
    await expect(service.linkToStudent(tx as unknown as Tx, "student-A", "guardian-2", "MOTHER", false)).rejects.toThrow(
      "This student already has a Mother (Amina Ali). A student can have only one Mother",
    );
    expect(tx.studentGuardian.upsert).not.toHaveBeenCalled();
  });

  it("rejects a second Father, naming the existing one", async () => {
    const { service, tx } = makeService({ guardian: { firstName: "Hassan", lastName: "Noor" } });

    await expect(service.linkToStudent(tx as unknown as Tx, "student-A", "guardian-2", "FATHER", false)).rejects.toThrow(
      "This student already has a Father (Hassan Noor). A student can have only one Father",
    );
    expect(tx.studentGuardian.upsert).not.toHaveBeenCalled();
  });

  it("looks only at OTHER guardians' ACTIVE links of exactly that relationship for exactly that student", async () => {
    const { service, tx } = makeService();

    await service.linkToStudent(tx as unknown as Tx, "student-A", "guardian-2", "MOTHER", false);

    expect(tx.studentGuardian.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studentId: "student-A", relationship: "MOTHER", status: "ACTIVE", guardianId: { not: "guardian-2" } } }),
    );
    expect(tx.studentGuardian.upsert).toHaveBeenCalledTimes(1);
  });

  it("allows the first Mother and the first Father", async () => {
    const { service, tx } = makeService(null);

    await service.linkToStudent(tx as unknown as Tx, "student-A", "guardian-1", "MOTHER", true);
    await service.linkToStudent(tx as unknown as Tx, "student-A", "guardian-2", "FATHER", false);

    expect(tx.studentGuardian.upsert).toHaveBeenCalledTimes(2);
  });

  it.each(["GUARDIAN", "OTHER"] as const)("%s has no limit — no lookup is even made, so any number can be added", async (relationship) => {
    const { service, tx } = makeService({ guardian: { firstName: "Someone", lastName: "Else" } });

    await service.linkToStudent(tx as unknown as Tx, "student-A", "guardian-3", relationship, false);
    await service.linkToStudent(tx as unknown as Tx, "student-A", "guardian-4", relationship, false);

    expect(tx.studentGuardian.findFirst).not.toHaveBeenCalled();
    expect(tx.studentGuardian.upsert).toHaveBeenCalledTimes(2);
  });

  it("the same parent can be the Mother of several children (the rule is per student, not per parent)", async () => {
    const { service, tx } = makeService(null);

    await service.linkToStudent(tx as unknown as Tx, "student-A", "guardian-1", "MOTHER", false);
    await service.linkToStudent(tx as unknown as Tx, "student-B", "guardian-1", "MOTHER", false);

    expect(tx.studentGuardian.upsert).toHaveBeenCalledTimes(2);
  });
});
