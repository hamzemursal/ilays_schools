import { NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { SchoolsService } from "./schools.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

function actorFor(organizationId: string | null, schoolIds: string[]): AuthenticatedUser {
  return {
    id: "user-1",
    email: "admin@example.com",
    organizationId,
    roles: ["SCHOOL_ADMIN"],
    permissions: ["academic.view"],
    schoolIds,
  };
}

const SCHOOL_A = { id: "school-a-id", organizationId: "org-1", name: "Xaafuun" };
const SCHOOL_B = { id: "school-b-id", organizationId: "org-1", name: "Ilays Academy College" };

describe("SchoolsService.resolveIdentifierOrThrow", () => {
  let prisma: { school: { findFirst: jest.Mock; findMany: jest.Mock } };
  let service: SchoolsService;

  beforeEach(() => {
    prisma = { school: { findFirst: jest.fn(), findMany: jest.fn() } };
    service = new SchoolsService(prisma as unknown as PrismaService, {} as unknown as AuditService);
  });

  it("resolves a real id directly, without needing the slug fallback", async () => {
    prisma.school.findFirst.mockResolvedValue(SCHOOL_A);

    const result = await service.resolveIdentifierOrThrow(actorFor("org-1", ["school-a-id"]), "school-a-id");

    expect(result).toBe(SCHOOL_A);
    expect(prisma.school.findMany).not.toHaveBeenCalled();
  });

  it("falls back to a slug match derived from the school's name", async () => {
    prisma.school.findFirst.mockResolvedValue(null); // no id match
    prisma.school.findMany.mockResolvedValue([SCHOOL_A]); // this actor's accessible schools

    const result = await service.resolveIdentifierOrThrow(actorFor("org-1", ["school-a-id"]), "xaafuun");

    expect(result).toBe(SCHOOL_A);
  });

  // The core safety property: the slug fallback only ever searches within
  // whatever findMany already scoped to this actor — it cannot see a school
  // outside that set, no matter what slug is guessed.
  it("never resolves a slug belonging to a school outside the actor's accessible scope", async () => {
    prisma.school.findFirst.mockResolvedValue(null);
    // This actor only has school-a-id, so accessibleWhere's findMany would
    // never actually return SCHOOL_B — simulated here by returning only
    // what a correctly-scoped query would.
    prisma.school.findMany.mockResolvedValue([SCHOOL_A]);

    await expect(
      service.resolveIdentifierOrThrow(actorFor("org-1", ["school-a-id"]), "ilays-academy-college"),
    ).rejects.toThrow(NotFoundException);
  });

  it("throws NotFoundException for a slug that matches nothing at all", async () => {
    prisma.school.findFirst.mockResolvedValue(null);
    prisma.school.findMany.mockResolvedValue([SCHOOL_A]);

    await expect(
      service.resolveIdentifierOrThrow(actorFor("org-1", ["school-a-id"]), "does-not-exist"),
    ).rejects.toThrow(NotFoundException);
  });

  it("slug matching is case-insensitive", async () => {
    prisma.school.findFirst.mockResolvedValue(null);
    prisma.school.findMany.mockResolvedValue([SCHOOL_A]);

    const result = await service.resolveIdentifierOrThrow(actorFor("org-1", ["school-a-id"]), "XAAFUUN");

    expect(result).toBe(SCHOOL_A);
  });
});
