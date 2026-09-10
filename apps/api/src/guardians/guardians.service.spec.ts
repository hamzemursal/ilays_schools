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
