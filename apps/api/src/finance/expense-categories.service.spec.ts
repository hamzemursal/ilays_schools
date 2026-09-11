import { ConflictException } from "@nestjs/common";
import { Prisma } from "@school-erp/database";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { ExpenseCategoriesService } from "./expense-categories.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";

const ACTOR: AuthenticatedUser = {
  id: "admin-1",
  email: "admin@example.com",
  organizationId: "org-1",
  roles: ["SCHOOL_ADMIN"],
  permissions: ["finance.expenses.manage"],
  schoolIds: ["school-1"],
};

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
}

describe("ExpenseCategoriesService", () => {
  let prisma: { expenseCategory: { findMany: jest.Mock; create: jest.Mock } };
  let schools: { findOneAccessibleOrThrow: jest.Mock };
  let service: ExpenseCategoriesService;

  beforeEach(() => {
    prisma = { expenseCategory: { findMany: jest.fn(), create: jest.fn() } };
    schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    service = new ExpenseCategoriesService(prisma as unknown as PrismaService, schools as unknown as SchoolsService);
  });

  describe("listForSchool", () => {
    it("checks school access before listing", async () => {
      prisma.expenseCategory.findMany.mockResolvedValue([]);
      await service.listForSchool(ACTOR, "school-1");
      expect(schools.findOneAccessibleOrThrow).toHaveBeenCalledWith(ACTOR, "school-1");
    });

    it("scopes to the given school and orders alphabetically by name", async () => {
      prisma.expenseCategory.findMany.mockResolvedValue([]);
      await service.listForSchool(ACTOR, "school-1");
      expect(prisma.expenseCategory.findMany).toHaveBeenCalledWith({
        where: { schoolId: "school-1" },
        orderBy: { name: "asc" },
      });
    });
  });

  describe("create", () => {
    it("checks school access before creating", async () => {
      prisma.expenseCategory.create.mockResolvedValue({ id: "cat-1", name: "Utilities" });
      await service.create(ACTOR, "school-1", { name: "Utilities" });
      expect(schools.findOneAccessibleOrThrow).toHaveBeenCalledWith(ACTOR, "school-1");
    });

    it("creates the category scoped to the given school", async () => {
      prisma.expenseCategory.create.mockResolvedValue({ id: "cat-1", schoolId: "school-1", name: "Utilities" });
      const result = await service.create(ACTOR, "school-1", { name: "Utilities" });
      expect(prisma.expenseCategory.create).toHaveBeenCalledWith({ data: { schoolId: "school-1", name: "Utilities" } });
      expect(result).toEqual({ id: "cat-1", schoolId: "school-1", name: "Utilities" });
    });

    it("translates a P2002 violation (duplicate name within the school) into a ConflictException", async () => {
      prisma.expenseCategory.create.mockRejectedValue(uniqueViolation());
      await expect(service.create(ACTOR, "school-1", { name: "Utilities" })).rejects.toThrow(ConflictException);
      await expect(service.create(ACTOR, "school-1", { name: "Utilities" })).rejects.toThrow(
        "An expense category with this name already exists in this school",
      );
    });

    it("re-throws non-P2002 errors unchanged", async () => {
      prisma.expenseCategory.create.mockRejectedValue(new Error("connection reset"));
      await expect(service.create(ACTOR, "school-1", { name: "Utilities" })).rejects.toThrow("connection reset");
    });
  });
});
