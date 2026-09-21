import { ConflictException } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { highestSequenceOf } from "../common/sequential-code.util";
import { TeachersService } from "./teachers.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";
import type { StorageService } from "../storage/storage.service";
import type { DocumentsService } from "../documents/documents.service";
import type { GuardiansService } from "../guardians/guardians.service";

// Phase 3 — Teacher ID (teacherCode, unique across the organization) and
// Employee Number (employeeNumber, unique per school) are independent. Both
// used to be "row count + 1", so deleting a teacher made the NEXT number
// collide with one still in use, permanently: every later creation in that
// school failed with "A teacher with this employee number already exists".

const ACTOR: AuthenticatedUser = {
  id: "admin-1",
  email: "admin@example.com",
  organizationId: "org-1",
  roles: ["SCHOOL_ADMIN"],
  permissions: ["teachers.manage"],
  schoolIds: ["school-b"],
};

describe("highestSequenceOf", () => {
  it("returns the highest number in use for the prefix, whatever the zero-padding", () => {
    expect(highestSequenceOf(["EMP-00002", "EMP-0007", "EMP-00003"], "EMP")).toBe(7);
  });

  it("is 0 when nothing is in use yet, and ignores nulls, other prefixes and malformed values", () => {
    expect(highestSequenceOf([], "EMP")).toBe(0);
    expect(highestSequenceOf([null, undefined, "TCH-00009", "EMP-abc", "XEMP-00004", "EMP-00004-x"], "EMP")).toBe(0);
  });

  it("a gap left by a deletion never lowers the next number", () => {
    // EMP-00001 was deleted; 2 and 3 remain. count() would say 2 -> next 3 (a clash).
    expect(highestSequenceOf(["EMP-00002", "EMP-00003"], "EMP") + 1).toBe(4);
  });
});

function setup(existing: { employeeNumbers: string[]; teacherCodes: string[] }) {
  const created: Array<{ employeeNumber: string; teacherCode: string }> = [];
  const tx = {
    teacher: {
      create: jest.fn(({ data }: { data: { employeeNumber: string; teacherCode: string } }) => {
        created.push({ employeeNumber: data.employeeNumber, teacherCode: data.teacherCode });
        return Promise.resolve({ id: "t-new", firstName: "New", lastName: "Teacher", ...data });
      }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "t-new" }),
    },
    teacherAssignment: { create: jest.fn() },
  };
  const prisma = {
    teacher: {
      // Either query: per-school EMP numbers, or every TCH code in the organization.
      findMany: jest.fn(({ where }: { where: { employeeNumber?: unknown; teacherCode?: unknown } }) =>
        Promise.resolve(
          where.teacherCode
            ? existing.teacherCodes.map((teacherCode) => ({ teacherCode }))
            : existing.employeeNumbers.map((employeeNumber) => ({ employeeNumber })),
        ),
      ),
      count: jest.fn().mockResolvedValue(existing.employeeNumbers.length), // the OLD basis — must no longer matter
    },
    $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
  };
  const schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new TeachersService(
    prisma as unknown as PrismaService,
    schools as unknown as SchoolsService,
    {} as unknown as GuardiansService,
    {} as unknown as DocumentsService,
    {} as unknown as StorageService,
    audit as unknown as AuditService,
  );
  return { service, prisma, created, tx };
}

describe("TeachersService.create — Teacher ID and Employee Number numbering", () => {
  it("after a deletion leaves a gap, the next numbers continue past the highest in use — no collision", async () => {
    // School B once had EMP-00001/00002 (Teacher IDs 2 and 3); #1 was deleted.
    const { service, created, prisma } = setup({ employeeNumbers: ["EMP-00002"], teacherCodes: ["TCH-00001", "TCH-00003"] });

    await service.create(ACTOR, "school-b", { firstName: "New", lastName: "Teacher" });

    expect(created[0]).toEqual({ employeeNumber: "EMP-00003", teacherCode: "TCH-00004" });
    // count() (1 teacher left in the school) would have produced EMP-00002 — the clash.
    expect(prisma.teacher.count).not.toHaveBeenCalled();
  });

  it("Employee Number is per school, Teacher ID is organization-wide: independent sequences", async () => {
    // A brand-new school (no teachers of its own) inside an org that already has Teacher IDs up to 6.
    const { service, created } = setup({ employeeNumbers: [], teacherCodes: ["TCH-00001", "TCH-00006"] });

    await service.create(ACTOR, "school-b", { firstName: "First", lastName: "AtNewSchool" });

    expect(created[0]).toEqual({ employeeNumber: "EMP-00001", teacherCode: "TCH-00007" });
  });

  it("the per-school query is scoped to this school, and the Teacher ID query looks at every school", async () => {
    const { service, prisma } = setup({ employeeNumbers: [], teacherCodes: [] });

    await service.create(ACTOR, "school-b", { firstName: "A", lastName: "B" });

    const calls = prisma.teacher.findMany.mock.calls.map((c) => c[0].where);
    expect(calls).toContainEqual({ schoolId: "school-b", employeeNumber: { startsWith: "EMP-" } });
    expect(calls).toContainEqual({ teacherCode: { startsWith: "TCH-" } });
  });

  it("seeded 4-digit numbers (EMP-0001) are understood too", async () => {
    const { service, created } = setup({ employeeNumbers: ["EMP-0001"], teacherCodes: ["TCH-00001"] });

    await service.create(ACTOR, "school-b", { firstName: "A", lastName: "B" });

    expect(created[0]).toEqual({ employeeNumber: "EMP-00002", teacherCode: "TCH-00002" });
  });

  it("an explicitly supplied employee number is still used as given", async () => {
    const { service, created } = setup({ employeeNumbers: ["EMP-00002"], teacherCodes: [] });

    await service.create(ACTOR, "school-b", { firstName: "A", lastName: "B", employeeNumber: "HR-77" });

    expect(created[0].employeeNumber).toBe("HR-77");
  });
});

describe("TeachersService.create — accurate conflict messages", () => {
  function p2002(target: string[]) {
    return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "5", meta: { target } });
  }

  it("a genuine duplicate employee number says so", async () => {
    const { service, prisma } = setup({ employeeNumbers: [], teacherCodes: [] });
    (prisma.$transaction as jest.Mock).mockRejectedValue(p2002(["schoolId", "employeeNumber"]));

    await expect(service.create(ACTOR, "school-b", { firstName: "A", lastName: "B", employeeNumber: "HR-1" })).rejects.toThrow(
      new ConflictException("A teacher with this employee number already exists in this school"),
    );
  });

  it("a Teacher ID clash is NOT reported as an employee-number problem — the admin can't fix that", async () => {
    const { service, prisma } = setup({ employeeNumbers: [], teacherCodes: [] });
    (prisma.$transaction as jest.Mock).mockRejectedValue(p2002(["teacherCode"]));

    await expect(service.create(ACTOR, "school-b", { firstName: "A", lastName: "B" })).rejects.toThrow(
      "Couldn't allocate a unique Teacher ID — please try again",
    );
  });
});
