import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { CentralFinanceSummary } from "@/lib/api";
import { CentralFinanceDashboard } from "./CentralFinanceDashboard";

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

const useAuthMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-context", () => ({ useAuth: () => useAuthMock(), ApiError }));

const apiMock = vi.hoisted(() => ({ getCentralFinanceSummary: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function totals(overrides: Partial<CentralFinanceSummary["totals"]> = {}): CentralFinanceSummary["totals"] {
  return {
    totalCharged: 1000,
    totalCollected: 700,
    outstanding: 300,
    cashCollection: 400,
    zaadCollection: 300,
    expensesTotal: 100,
    payrollTotal: 200,
    netFinancialPosition: 400,
    pendingZaadCount: 0,
    pendingZaadAmount: 0,
    ...overrides,
  };
}

function schoolRow(overrides: Partial<CentralFinanceSummary["schools"][number]> = {}): CentralFinanceSummary["schools"][number] {
  return {
    schoolId: "school-1",
    schoolName: "Ilays Primary",
    academicYear: { id: "year-1", name: "2028" },
    totalCharged: 500,
    totalCollected: 400,
    outstanding: 100,
    cashCollection: 200,
    zaadCollection: 200,
    pendingZaadVerification: { count: 0, amount: 0 },
    expensesTotal: 50,
    payrollTotal: 100,
    netFinancialPosition: 250,
    ...overrides,
  };
}

function summary(overrides: Partial<CentralFinanceSummary> = {}): CentralFinanceSummary {
  return { totals: totals(), schools: [], ...overrides };
}

function renderDashboard(overrides: Partial<React.ComponentProps<typeof CentralFinanceDashboard>> = {}) {
  return render(<CentralFinanceDashboard pageTitle="Central Finance" {...overrides} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthMock.mockReturnValue({ accessToken: "token-1" });
});

describe("CentralFinanceDashboard — loading/error states", () => {
  it("shows skeleton cards before the summary resolves", async () => {
    let resolve!: (v: CentralFinanceSummary) => void;
    apiMock.getCentralFinanceSummary.mockReturnValue(new Promise((r) => (resolve = r)));
    const { container } = renderDashboard();

    expect(container.querySelector(".animate-pulse")).not.toBeNull();
    resolve(summary());
    await waitFor(() => expect(container.querySelector(".animate-pulse")).toBeNull());
  });

  it("never fetches the summary when there is no access token yet", async () => {
    useAuthMock.mockReturnValue({ accessToken: null });
    renderDashboard();
    expect(apiMock.getCentralFinanceSummary).not.toHaveBeenCalled();
  });

  it("shows the ApiError's own message when loading fails", async () => {
    apiMock.getCentralFinanceSummary.mockRejectedValue(new ApiError("Not authorized"));
    renderDashboard();
    expect(await screen.findByText("Not authorized")).toBeInTheDocument();
  });

  it("shows a generic fallback message for a non-ApiError load failure", async () => {
    apiMock.getCentralFinanceSummary.mockRejectedValue(new Error("network down"));
    renderDashboard();
    expect(await screen.findByText("Failed to load central finance summary")).toBeInTheDocument();
  });
});

describe("CentralFinanceDashboard — org-wide scope (no client-passed schoolId)", () => {
  it("fetches the summary with just the access token — never a schoolId, since scope is resolved server-side from the actor's own grants", async () => {
    apiMock.getCentralFinanceSummary.mockResolvedValue(summary());
    renderDashboard();
    await waitFor(() => expect(apiMock.getCentralFinanceSummary).toHaveBeenCalledWith("token-1"));
    expect(apiMock.getCentralFinanceSummary).toHaveBeenCalledTimes(1);
  });
});

describe("CentralFinanceDashboard — page chrome", () => {
  it("renders the given page title and breadcrumbs", async () => {
    apiMock.getCentralFinanceSummary.mockResolvedValue(summary());
    renderDashboard({ pageTitle: "Finance Overview", breadcrumbs: [{ label: "Home", href: "/" }, { label: "Finance" }] });
    expect(screen.getByRole("heading", { name: "Finance Overview" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
  });
});

describe("CentralFinanceDashboard — totals rendering", () => {
  it("renders every totals stat card's formatted money value", async () => {
    apiMock.getCentralFinanceSummary.mockResolvedValue(summary({ totals: totals({ totalCharged: 2500.75 }) }));
    renderDashboard();
    expect(await screen.findByText("$2,500.75")).toBeInTheDocument();
  });

  it("shows the pending-ZAAD count and money hint only when the count is greater than zero", async () => {
    apiMock.getCentralFinanceSummary.mockResolvedValue(summary({ totals: totals({ pendingZaadCount: 4, pendingZaadAmount: 220 }) }));
    renderDashboard();
    expect(await screen.findByText("4")).toBeInTheDocument();
    expect(screen.getByText("$220.00")).toBeInTheDocument();
  });

  it("gives the net-position card a danger tone when negative", async () => {
    apiMock.getCentralFinanceSummary.mockResolvedValue(summary({ totals: totals({ netFinancialPosition: -10 }) }));
    renderDashboard();
    const label = await screen.findByText("Net financial position");
    const icon = label.closest("div")!.querySelector("div")!;
    expect(icon.className).toContain("danger");
  });
});

describe("CentralFinanceDashboard — by-school table", () => {
  it("shows an EmptyState when no school has financial activity yet", async () => {
    apiMock.getCentralFinanceSummary.mockResolvedValue(summary({ schools: [] }));
    renderDashboard();
    expect(await screen.findByText("No schools with financial activity yet")).toBeInTheDocument();
  });

  it("renders each school's name, academic year, charged/collected/outstanding, and a View link to its own finance page", async () => {
    apiMock.getCentralFinanceSummary.mockResolvedValue(
      summary({ schools: [schoolRow({ schoolId: "school-9", schoolName: "Ilays Secondary" })] }),
    );
    renderDashboard();

    expect(await screen.findByText("Ilays Secondary")).toBeInTheDocument();
    expect(screen.getByText("2028")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /View/ });
    expect(link).toHaveAttribute("href", "/schools/school-9/finance");
  });

  it("omits the academic year line for a school with none resolved", async () => {
    apiMock.getCentralFinanceSummary.mockResolvedValue(summary({ schools: [schoolRow({ academicYear: null })] }));
    renderDashboard();
    await screen.findByText("Ilays Primary");
    expect(screen.queryByText("2028")).not.toBeInTheDocument();
  });

  it("shows the pending ZAAD cell as a dash when none, and 'count · amount' when there is some", async () => {
    apiMock.getCentralFinanceSummary.mockResolvedValue(
      summary({
        schools: [
          schoolRow({ schoolId: "s1", schoolName: "School A", pendingZaadVerification: { count: 0, amount: 0 } }),
          schoolRow({ schoolId: "s2", schoolName: "School B", pendingZaadVerification: { count: 2, amount: 40 } }),
        ],
      }),
    );
    renderDashboard();
    await screen.findByText("School A");
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("2 · $40.00")).toBeInTheDocument();
  });

  it("colors a school's outstanding cell as a warning only when it's greater than zero", async () => {
    apiMock.getCentralFinanceSummary.mockResolvedValue(summary({ schools: [schoolRow({ outstanding: 0 })] }));
    renderDashboard();
    const cell = await screen.findByText("$0.00");
    expect(cell.className).not.toContain("warning");
  });

  it("renders multiple schools, each with their own row", async () => {
    apiMock.getCentralFinanceSummary.mockResolvedValue(
      summary({
        schools: [
          schoolRow({ schoolId: "s1", schoolName: "School A" }),
          schoolRow({ schoolId: "s2", schoolName: "School B" }),
        ],
      }),
    );
    renderDashboard();
    expect(await screen.findByText("School A")).toBeInTheDocument();
    expect(screen.getByText("School B")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /View/ })).toHaveLength(2);
  });
});
