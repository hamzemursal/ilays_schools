import { NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { AcademicYearsService } from "./academic-years.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";
import { AuditService } from "../audit/audit.service";

const ACTOR: AuthenticatedUser = {
  id: "user-1",
  email: "admin@example.com",
  organizationId: "org-1",
  roles: ["SCHOOL_ADMIN"],
  permissions: ["academic.view"],
  schoolIds: ["school-1"],
};

const YEAR_2027 = { id: "year-real-id", name: "2027", schoolId: "school-1" };

describe("AcademicYearsService.resolveIdentifierOrThrow", () => {
  let prisma: { academicYear: { findFirst: jest.Mock } };
  let schools: { findOneAccessibleOrThrow: jest.Mock };
  let service: AcademicYearsService;

  beforeEach(() => {
    prisma = { academicYear: { findFirst: jest.fn() } };
    schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    service = new AcademicYearsService(
      prisma as unknown as PrismaService,
      schools as unknown as SchoolsService,
      {} as unknown as AuditService,
    );
  });

  it("resolves a real id directly", async () => {
    prisma.academicYear.findFirst.mockResolvedValue(YEAR_2027);

    const result = await service.resolveIdentifierOrThrow(ACTOR, "school-1", "year-real-id");

    expect(schools.findOneAccessibleOrThrow).toHaveBeenCalledWith(ACTOR, "school-1");
    expect(result).toBe(YEAR_2027);
  });

  it("falls back to a name match (e.g. \"2027\") scoped to the given school", async () => {
    prisma.academicYear.findFirst.mockImplementation((args) =>
      Promise.resolve(args.where.id ? null : YEAR_2027),
    );

    const result = await service.resolveIdentifierOrThrow(ACTOR, "school-1", "2027");

    expect(result).toBe(YEAR_2027);
    expect(prisma.academicYear.findFirst).toHaveBeenLastCalledWith({
      where: { name: "2027", schoolId: "school-1" },
    });
  });

  it("throws NotFoundException when neither id nor name matches within this school", async () => {
    prisma.academicYear.findFirst.mockResolvedValue(null);

    await expect(service.resolveIdentifierOrThrow(ACTOR, "school-1", "1999")).rejects.toThrow(NotFoundException);
  });
});
