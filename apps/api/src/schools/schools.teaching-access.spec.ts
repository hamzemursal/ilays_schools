import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { SchoolsService } from "./schools.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

// Phase 3 — a teacher's UserSchool membership covers only their home school,
// but a TeacherAssignment can put them in a section at another school of the
// same organization. findOneAccessibleOrTeachingAtOrThrow is the school gate
// for the teacher-scoped actions (marks, results, attendance): membership OR
// an assignment there. It must never widen access for anyone else.

const HOME = { id: "school-home", organizationId: "org-1", name: "Sayidka" };
const SECOND = { id: "school-second", organizationId: "org-1", name: "Saacid" };

const teacher: AuthenticatedUser = {
  id: "teacher-user-1",
  email: "teacher@example.com",
  organizationId: "org-1",
  roles: ["TEACHER"],
  permissions: ["results.enter", "attendance.mark"],
  schoolIds: ["school-home"], // UserSchool: home school only — exactly like production
};
const schoolAdmin: AuthenticatedUser = { ...teacher, id: "admin-1", roles: ["SCHOOL_ADMIN"], schoolIds: ["school-home"] };

function setup() {
  const prisma = {
    school: { findFirst: jest.fn(), findFirstOrThrow: jest.fn() },
    teacherAssignment: { findFirst: jest.fn() },
  };
  // findOneAccessibleOrThrow (the strict check) = school.findFirst scoped by accessibleWhere.
  prisma.school.findFirst.mockImplementation(({ where }: { where: { AND: Array<{ id?: string | { in: string[] }; organizationId?: string }> } }) => {
    const [scope, byId] = where.AND;
    const allowed = (scope.id as { in: string[] } | undefined)?.in;
    const wanted = (byId as { id: string }).id;
    const school = [HOME, SECOND].find((s) => s.id === wanted);
    return Promise.resolve(school && (!allowed || allowed.includes(school.id)) ? school : null);
  });
  prisma.school.findFirstOrThrow.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve([HOME, SECOND].find((s) => s.id === where.id)),
  );
  const service = new SchoolsService(prisma as unknown as PrismaService, {} as unknown as AuditService);
  return { prisma, service };
}

describe("SchoolsService.findOneAccessibleOrTeachingAtOrThrow", () => {
  it("admits the teacher's home school by membership, without any assignment lookup", async () => {
    const { service, prisma } = setup();

    await expect(service.findOneAccessibleOrTeachingAtOrThrow(teacher, "school-home")).resolves.toEqual(HOME);
    expect(prisma.teacherAssignment.findFirst).not.toHaveBeenCalled();
  });

  it("admits a SECOND school the teacher is assigned at, though they are not a member of it — the reported 'School not found' bug", async () => {
    const { service, prisma } = setup();
    prisma.teacherAssignment.findFirst.mockResolvedValue({ id: "assignment-1" });

    await expect(service.findOneAccessibleOrTeachingAtOrThrow(teacher, "school-second")).resolves.toEqual(SECOND);
  });

  it("the assignment lookup is pinned to this school, this user's own Teacher profile, and this organization", async () => {
    const { service, prisma } = setup();
    prisma.teacherAssignment.findFirst.mockResolvedValue({ id: "assignment-1" });

    await service.findOneAccessibleOrTeachingAtOrThrow(teacher, "school-second");

    expect(prisma.teacherAssignment.findFirst).toHaveBeenCalledWith({
      where: { schoolId: "school-second", teacher: { userId: "teacher-user-1" }, school: { organizationId: "org-1" } },
      select: { id: true },
    });
  });

  it("refuses a school where the teacher holds no assignment (and isn't a member) — still 'School not found'", async () => {
    const { service, prisma } = setup();
    prisma.teacherAssignment.findFirst.mockResolvedValue(null);

    await expect(service.findOneAccessibleOrTeachingAtOrThrow(teacher, "school-second")).rejects.toThrow(
      new NotFoundException("School not found"),
    );
  });

  it("a School Admin has no assignments, so this is identical to the strict check — other schools stay hidden from them", async () => {
    const { service, prisma } = setup();
    prisma.teacherAssignment.findFirst.mockResolvedValue(null);

    await expect(service.findOneAccessibleOrTeachingAtOrThrow(schoolAdmin, "school-second")).rejects.toThrow(NotFoundException);
    await expect(service.findOneAccessibleOrTeachingAtOrThrow(schoolAdmin, "school-home")).resolves.toEqual(HOME);
  });

  it("only 'not found' falls through to the assignment check — an account with no organization still fails outright", async () => {
    const { service, prisma } = setup();
    const noOrg: AuthenticatedUser = { ...teacher, organizationId: null };

    await expect(service.findOneAccessibleOrTeachingAtOrThrow(noOrg, "school-second")).rejects.toThrow(ForbiddenException);
    expect(prisma.teacherAssignment.findFirst).not.toHaveBeenCalled();
  });

  it("the strict findOneAccessibleOrThrow is unchanged: even with an assignment, it still refuses a non-member school", async () => {
    const { service, prisma } = setup();
    prisma.teacherAssignment.findFirst.mockResolvedValue({ id: "assignment-1" });

    await expect(service.findOneAccessibleOrThrow(teacher, "school-second")).rejects.toThrow("School not found");
    expect(prisma.teacherAssignment.findFirst).not.toHaveBeenCalled();
  });
});
