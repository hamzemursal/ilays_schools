import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { FinanceDashboardService } from "./finance-dashboard.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchoolsService } from "../schools/schools.service";

const SCHOOL_ACTOR: AuthenticatedUser = {
  id: "user-1",
  email: "finance@example.com",
  organizationId: "org-1",
  roles: ["FINANCE_STAFF"],
  permissions: ["finance.dashboard.view"],
  schoolIds: ["school-1"],
};

const CENTRAL_ACTOR: AuthenticatedUser = {
  id: "central-1",
  email: "central@example.com",
  organizationId: "org-1",
  roles: ["CENTRAL_FINANCE_VIEWER"],
  permissions: ["finance.central.view"],
  schoolIds: ["school-1", "school-2"],
};

describe("FinanceDashboardService", () => {
  let prisma: {
    academicYear: { findMany: jest.Mock };
    invoice: { findMany: jest.Mock };
    charge: { findMany: jest.Mock };
    feeAdjustment: { findMany: jest.Mock };
    paymentSubmission: { findMany: jest.Mock };
    expense: { findMany: jest.Mock };
    payslip: { findMany: jest.Mock };
    school: { findMany: jest.Mock };
  };
  let schools: { findOneAccessibleOrThrow: jest.Mock };
  let service: FinanceDashboardService;

  beforeEach(() => {
    prisma = {
      academicYear: { findMany: jest.fn().mockResolvedValue([{ id: "year-1", isCurrent: true }]) },
      invoice: { findMany: jest.fn().mockResolvedValue([]) },
      charge: { findMany: jest.fn().mockResolvedValue([]) },
      feeAdjustment: { findMany: jest.fn().mockResolvedValue([]) },
      paymentSubmission: { findMany: jest.fn().mockResolvedValue([]) },
      expense: { findMany: jest.fn().mockResolvedValue([]) },
      payslip: { findMany: jest.fn().mockResolvedValue([]) },
      school: { findMany: jest.fn().mockResolvedValue([]) },
    };
    schools = { findOneAccessibleOrThrow: jest.fn().mockResolvedValue(undefined) };
    service = new FinanceDashboardService(prisma as unknown as PrismaService, schools as unknown as SchoolsService);
  });

  describe("getSchoolSummary", () => {
    it("computes every metric from real rows, excluding REVERSED payments and non-APPROVED adjustments", async () => {
      prisma.invoice.findMany.mockResolvedValue([
        {
          amount: "300.00",
          payments: [
            { status: "POSTED", amount: "100.00", method: "CASH" },
            { status: "REVERSED", amount: "999.00", method: "CASH" }, // must never count
          ],
        },
      ]);
      prisma.charge.findMany.mockResolvedValue([
        { amount: "100.00", payments: [{ status: "POSTED", amount: "40.00", method: "MOBILE_MONEY" }] },
      ]);
      prisma.feeAdjustment.findMany.mockResolvedValue([{ amount: "10.00" }]); // service already filters status:APPROVED in the query
      prisma.paymentSubmission.findMany.mockResolvedValue([{ amount: "25.00" }, { amount: "15.00" }]);
      prisma.expense.findMany.mockResolvedValue([{ amount: "50.00" }]);
      prisma.payslip.findMany.mockResolvedValue([{ netSalary: "330.00" }]);

      const result = await service.getSchoolSummary(SCHOOL_ACTOR, "school-1");

      // totalCharged = 300 + 100 = 400
      // totalCollected = 100 (CASH, POSTED) + 40 (MOBILE_MONEY, POSTED) = 140
      // outstanding = 400 - 140 - 10(adjustment) = 250
      expect(result.totalCharged).toBe(400);
      expect(result.totalCollected).toBe(140);
      expect(result.outstanding).toBe(250);
      expect(result.cashCollection).toBe(100);
      expect(result.zaadCollection).toBe(40);
      expect(result.pendingZaadVerification).toEqual({ count: 2, amount: 40 });
      expect(result.expensesTotal).toBe(50);
      expect(result.payrollTotal).toBe(330);
      // net = totalCollected(140) - expenses(50) - payroll(330) = -240
      expect(result.netFinancialPosition).toBe(-240);
    });

    it("enforces school access before querying anything", async () => {
      await service.getSchoolSummary(SCHOOL_ACTOR, "school-1");

      expect(schools.findOneAccessibleOrThrow).toHaveBeenCalledWith(SCHOOL_ACTOR, "school-1");
    });

    it("returns an all-zero summary for a school with no financial activity", async () => {
      const result = await service.getSchoolSummary(SCHOOL_ACTOR, "school-1");

      expect(result.totalCharged).toBe(0);
      expect(result.outstanding).toBe(0);
      expect(result.netFinancialPosition).toBe(0);
    });
  });

  describe("getCentralSummary", () => {
    it("scopes to the actor's curated schoolIds, never all schools in the org", async () => {
      prisma.school.findMany.mockResolvedValue([{ id: "school-1", name: "A" }, { id: "school-2", name: "B" }]);

      await service.getCentralSummary(CENTRAL_ACTOR);

      expect(prisma.school.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: "org-1", id: { in: ["school-1", "school-2"] } } }),
      );
    });

    it("queries every school in the org when the actor's schoolIds is empty (org-wide role)", async () => {
      const orgWideActor = { ...CENTRAL_ACTOR, schoolIds: [] };
      prisma.school.findMany.mockResolvedValue([]);

      await service.getCentralSummary(orgWideActor);

      expect(prisma.school.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-1" } }));
    });

    it("sums per-school figures into an org-wide totals block", async () => {
      prisma.school.findMany.mockResolvedValue([{ id: "school-1", name: "A" }, { id: "school-2", name: "B" }]);
      prisma.invoice.findMany
        .mockResolvedValueOnce([{ amount: "100.00", payments: [] }])
        .mockResolvedValueOnce([{ amount: "200.00", payments: [] }]);

      const result = await service.getCentralSummary(CENTRAL_ACTOR);

      expect(result.schools).toHaveLength(2);
      expect(result.totals.totalCharged).toBe(300);
    });
  });
});
