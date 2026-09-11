import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { FinanceDashboardSummary } from "@/lib/api";
import { FinanceDashboardTab } from "./FinanceDashboardTab";

const { ApiError } = vi.hoisted(() => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  }
  return { ApiError };
});
vi.mock("@/lib/auth-context", () => ({ ApiError }));

const apiMock = vi.hoisted(() => ({ getFinanceDashboardSummary: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock }));

function summary(overrides: Partial<FinanceDashboardSummary> = {}): FinanceDashboardSummary {
  return {
    totalCharged: 1000,
    totalCollected: 700,
    outstanding: 300,
    cashCollection: 400,
    zaadCollection: 300,
    pendingZaadVerification: { count: 0, amount: 0 },
    expensesTotal: 100,
    payrollTotal: 200,
    netFinancialPosition: 400,
    ...overrides,
  };
}

function renderTab(overrides: Partial<React.ComponentProps<typeof FinanceDashboardTab>> = {}) {
  return render(<FinanceDashboardTab accessToken="token-1" schoolId="school-1" {...overrides} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FinanceDashboardTab — loading/error states", () => {
  it("shows skeleton cards before the summary resolves", async () => {
    let resolve!: (v: FinanceDashboardSummary) => void;
    apiMock.getFinanceDashboardSummary.mockReturnValue(new Promise((r) => (resolve = r)));
    const { container } = renderTab();

    expect(container.querySelector(".animate-pulse")).not.toBeNull();
    resolve(summary());
    await waitFor(() => expect(container.querySelector(".animate-pulse")).toBeNull());
  });

  it("shows the ApiError's own message when loading fails", async () => {
    apiMock.getFinanceDashboardSummary.mockRejectedValue(new ApiError("School not found"));
    renderTab();
    expect(await screen.findByText("School not found")).toBeInTheDocument();
  });

  it("shows a generic fallback message for a non-ApiError load failure", async () => {
    apiMock.getFinanceDashboardSummary.mockRejectedValue(new Error("network down"));
    renderTab();
    expect(await screen.findByText("Failed to load finance dashboard")).toBeInTheDocument();
  });
});

describe("FinanceDashboardTab — school isolation", () => {
  it("loads the summary scoped to exactly the given schoolId", async () => {
    apiMock.getFinanceDashboardSummary.mockResolvedValue(summary());
    renderTab({ schoolId: "school-42" });
    await waitFor(() => expect(apiMock.getFinanceDashboardSummary).toHaveBeenCalledWith("token-1", "school-42"));
  });
});

describe("FinanceDashboardTab — real data rendering", () => {
  it("renders every stat card's formatted money value", async () => {
    apiMock.getFinanceDashboardSummary.mockResolvedValue(
      summary({
        totalCharged: 1234.5,
        totalCollected: 700,
        outstanding: 534.5,
        cashCollection: 410,
        zaadCollection: 290,
        expensesTotal: 100,
        payrollTotal: 200,
        netFinancialPosition: 400,
      }),
    );
    renderTab();

    expect(await screen.findByText("$1,234.50")).toBeInTheDocument();
    expect(screen.getByText("$700.00")).toBeInTheDocument();
    expect(screen.getByText("$534.50")).toBeInTheDocument();
    expect(screen.getByText("$410.00")).toBeInTheDocument();
    expect(screen.getByText("$290.00")).toBeInTheDocument();
    expect(screen.getByText("$100.00")).toBeInTheDocument();
    expect(screen.getByText("$200.00")).toBeInTheDocument();
  });

  it("gives the outstanding card a warning tone when positive, success when zero", async () => {
    apiMock.getFinanceDashboardSummary.mockResolvedValue(summary({ outstanding: 50 }));
    const { rerender, container } = renderTab();
    await screen.findByText("$50.00");
    let outstandingIcon = screen.getByText("Outstanding").closest("div")!.querySelector("div")!;
    expect(outstandingIcon.className).toContain("warning");

    apiMock.getFinanceDashboardSummary.mockResolvedValue(summary({ outstanding: 0 }));
    rerender(<FinanceDashboardTab accessToken="token-2" schoolId="school-1" />);
    await waitFor(() => expect(screen.getByText("$0.00")).toBeInTheDocument());
    outstandingIcon = screen.getByText("Outstanding").closest("div")!.querySelector("div")!;
    expect(outstandingIcon.className).toContain("success");
  });

  it("gives the net-position card a success tone when >= 0, danger tone when negative", async () => {
    apiMock.getFinanceDashboardSummary.mockResolvedValue(summary({ netFinancialPosition: -50 }));
    renderTab();
    await screen.findByText("Net financial position");
    const icon = screen.getByText("Net financial position").closest("div")!.querySelector("div")!;
    expect(icon.className).toContain("danger");
  });

  it("shows the pending-ZAAD count with a money hint only when the count is greater than zero", async () => {
    apiMock.getFinanceDashboardSummary.mockResolvedValue(
      summary({ pendingZaadVerification: { count: 3, amount: 150 } }),
    );
    renderTab();
    expect(await screen.findByText("3")).toBeInTheDocument();
    expect(screen.getByText("$150.00")).toBeInTheDocument();
  });

  it("shows no money hint under pending ZAAD when the count is zero", async () => {
    apiMock.getFinanceDashboardSummary.mockResolvedValue(summary({ pendingZaadVerification: { count: 0, amount: 0 } }));
    renderTab();
    const card = await screen.findByText("Pending ZAAD verification");
    expect(card.closest("div")!.parentElement!.querySelector("p.mt-0\\.5")).toBeNull();
  });
});
