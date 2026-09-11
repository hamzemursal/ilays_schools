import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@/components/ui/Toast";
import type { AcademicYear, BillingPeriod } from "@/lib/api";
import { BillingPeriodsTab } from "./BillingPeriodsTab";

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

const apiMock = vi.hoisted(() => ({
  listBillingPeriods: vi.fn(),
  createBillingPeriod: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

const YEARS: AcademicYear[] = [
  { id: "year-1", name: "2028", startDate: "2028-01-01", endDate: "2028-12-31", isCurrent: true },
];

function period(overrides: Partial<BillingPeriod> = {}): BillingPeriod {
  return {
    id: "bp-1",
    schoolId: "school-1",
    academicYearId: "year-1",
    name: "January",
    startDate: "2028-01-01",
    endDate: "2028-01-31",
    ...overrides,
  };
}

function renderTab(overrides: Partial<React.ComponentProps<typeof BillingPeriodsTab>> = {}) {
  return render(
    <ToastProvider>
      <BillingPeriodsTab accessToken="token-1" schoolId="school-1" years={YEARS} canManage={true} {...overrides} />
    </ToastProvider>,
  );
}

function dateInputs(container: HTMLElement): HTMLInputElement[] {
  return Array.from(container.querySelectorAll('input[type="date"]'));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BillingPeriodsTab — loading/error/empty states", () => {
  it("shows a loading indicator before periods resolve", async () => {
    let resolve!: (v: BillingPeriod[]) => void;
    apiMock.listBillingPeriods.mockReturnValue(new Promise((r) => (resolve = r)));
    renderTab();

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    resolve([]);
    await waitFor(() => expect(screen.getByText("No billing periods yet")).toBeInTheDocument());
  });

  it("shows the ApiError's own message when loading fails", async () => {
    apiMock.listBillingPeriods.mockRejectedValue(new ApiError("School not found"));
    renderTab();
    expect(await screen.findByText("School not found")).toBeInTheDocument();
  });

  it("shows a generic fallback message for a non-ApiError load failure", async () => {
    apiMock.listBillingPeriods.mockRejectedValue(new Error("network down"));
    renderTab();
    expect(await screen.findByText("Failed to load billing periods")).toBeInTheDocument();
  });

  it("shows an EmptyState when there are no billing periods yet", async () => {
    apiMock.listBillingPeriods.mockResolvedValue([]);
    renderTab();
    expect(await screen.findByText("No billing periods yet")).toBeInTheDocument();
  });
});

describe("BillingPeriodsTab — school isolation", () => {
  it("loads billing periods scoped to exactly the given schoolId", async () => {
    apiMock.listBillingPeriods.mockResolvedValue([]);
    renderTab({ schoolId: "school-42" });
    await waitFor(() => expect(apiMock.listBillingPeriods).toHaveBeenCalledWith("token-1", "school-42"));
  });

  it("creates the billing period scoped to the same schoolId, never a different or hardcoded one", async () => {
    const user = userEvent.setup();
    apiMock.listBillingPeriods.mockResolvedValue([]);
    apiMock.createBillingPeriod.mockResolvedValue(period());
    const { container } = renderTab({ schoolId: "school-42" });
    await screen.findByRole("heading", { name: "Add billing period" });
    await user.type(screen.getByPlaceholderText("January 2027"), "January");
    const [start, end] = dateInputs(container);
    await user.type(start, "2028-01-01");
    await user.type(end, "2028-01-31");

    await user.click(screen.getByRole("button", { name: "Add period" }));

    await waitFor(() =>
      expect(apiMock.createBillingPeriod).toHaveBeenCalledWith(
        "token-1",
        "school-42",
        expect.objectContaining({ name: "January" }),
      ),
    );
  });
});

describe("BillingPeriodsTab — RBAC", () => {
  it("hides the 'Add billing period' panel entirely when canManage is false", async () => {
    apiMock.listBillingPeriods.mockResolvedValue([]);
    renderTab({ canManage: false });
    await screen.findByText("No billing periods yet");
    expect(screen.queryByRole("heading", { name: "Add billing period" })).not.toBeInTheDocument();
  });

  it("hides the 'Add billing period' panel when canManage is true but there are no academic years yet", async () => {
    apiMock.listBillingPeriods.mockResolvedValue([]);
    renderTab({ canManage: true, years: [] });
    await screen.findByText("No billing periods yet");
    expect(screen.queryByRole("heading", { name: "Add billing period" })).not.toBeInTheDocument();
  });
});

describe("BillingPeriodsTab — real data rendering", () => {
  it("renders each period's name and formatted start–end date range", async () => {
    apiMock.listBillingPeriods.mockResolvedValue([period({ name: "January", startDate: "2028-01-01", endDate: "2028-01-31" })]);
    renderTab();

    expect(await screen.findByText("January")).toBeInTheDocument();
    expect(
      screen.getByText(`${new Date("2028-01-01").toLocaleDateString()} – ${new Date("2028-01-31").toLocaleDateString()}`),
    ).toBeInTheDocument();
  });

  it("renders every period in the list", async () => {
    apiMock.listBillingPeriods.mockResolvedValue([period({ id: "bp-1", name: "January" }), period({ id: "bp-2", name: "February" })]);
    renderTab();
    expect(await screen.findByText("January")).toBeInTheDocument();
    expect(screen.getByText("February")).toBeInTheDocument();
  });
});

describe("BillingPeriodsTab — create billing period (mutation)", () => {
  it("submits the selected academic year, name, start date, and end date", async () => {
    const user = userEvent.setup();
    apiMock.listBillingPeriods.mockResolvedValue([]);
    apiMock.createBillingPeriod.mockResolvedValue(period());
    const { container } = renderTab({
      years: [
        { id: "year-1", name: "2027", startDate: "2027-01-01", endDate: "2027-12-31", isCurrent: false },
        { id: "year-2", name: "2028", startDate: "2028-01-01", endDate: "2028-12-31", isCurrent: true },
      ],
    });
    await screen.findByRole("heading", { name: "Add billing period" });
    await user.selectOptions(screen.getByRole("combobox"), "year-2");
    await user.type(screen.getByPlaceholderText("January 2027"), "January");
    const [start, end] = dateInputs(container);
    await user.type(start, "2028-01-01");
    await user.type(end, "2028-01-31");

    await user.click(screen.getByRole("button", { name: "Add period" }));

    await waitFor(() =>
      expect(apiMock.createBillingPeriod).toHaveBeenCalledWith("token-1", "school-1", {
        academicYearId: "year-2",
        name: "January",
        startDate: "2028-01-01",
        endDate: "2028-01-31",
      }),
    );
  });

  it("clears the name/date fields, reloads the list, and shows a success toast after a successful save", async () => {
    const user = userEvent.setup();
    apiMock.listBillingPeriods.mockResolvedValueOnce([]).mockResolvedValueOnce([period()]);
    apiMock.createBillingPeriod.mockResolvedValue(period());
    const { container } = renderTab();
    await screen.findByText("No billing periods yet");
    const nameInput = screen.getByPlaceholderText("January 2027") as HTMLInputElement;
    await user.type(nameInput, "January");
    const [start, end] = dateInputs(container);
    await user.type(start, "2028-01-01");
    await user.type(end, "2028-01-31");

    await user.click(screen.getByRole("button", { name: "Add period" }));

    expect(await screen.findByText("Billing period added.")).toBeInTheDocument();
    await waitFor(() => expect(nameInput.value).toBe(""));
    expect(start.value).toBe("");
    expect(end.value).toBe("");
    await waitFor(() => expect(apiMock.listBillingPeriods).toHaveBeenCalledTimes(2));
  });

  it("shows the ApiError's message inline (not a toast) when creating fails", async () => {
    const user = userEvent.setup();
    apiMock.listBillingPeriods.mockResolvedValue([]);
    apiMock.createBillingPeriod.mockRejectedValue(new ApiError("endDate cannot be before startDate"));
    const { container } = renderTab();
    await screen.findByRole("heading", { name: "Add billing period" });
    await user.type(screen.getByPlaceholderText("January 2027"), "January");
    const [start, end] = dateInputs(container);
    await user.type(start, "2028-01-31");
    await user.type(end, "2028-01-01");

    await user.click(screen.getByRole("button", { name: "Add period" }));

    expect(await screen.findByText("endDate cannot be before startDate")).toBeInTheDocument();
  });

  it("shows a generic fallback message for a non-ApiError creation failure", async () => {
    const user = userEvent.setup();
    apiMock.listBillingPeriods.mockResolvedValue([]);
    apiMock.createBillingPeriod.mockRejectedValue(new Error("network down"));
    const { container } = renderTab();
    await screen.findByRole("heading", { name: "Add billing period" });
    await user.type(screen.getByPlaceholderText("January 2027"), "January");
    const [start, end] = dateInputs(container);
    await user.type(start, "2028-01-01");
    await user.type(end, "2028-01-31");

    await user.click(screen.getByRole("button", { name: "Add period" }));

    expect(await screen.findByText("Failed to create billing period")).toBeInTheDocument();
  });

  it("requires the name, start date, and end date fields via native validation attributes", async () => {
    apiMock.listBillingPeriods.mockResolvedValue([]);
    const { container } = renderTab();
    await screen.findByRole("heading", { name: "Add billing period" });

    expect((screen.getByPlaceholderText("January 2027") as HTMLInputElement).required).toBe(true);
    const [start, end] = dateInputs(container);
    expect(start.required).toBe(true);
    expect(end.required).toBe(true);
  });
});
