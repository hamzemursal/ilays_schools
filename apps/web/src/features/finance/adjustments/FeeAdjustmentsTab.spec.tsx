import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@/components/ui/Toast";
import type { FeeAdjustment, SchoolCharge, SchoolInvoice } from "@/lib/api";
import { FeeAdjustmentsTab } from "./FeeAdjustmentsTab";

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
  listFeeAdjustments: vi.fn(),
  createFeeAdjustment: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

function invoice(overrides: Partial<SchoolInvoice> = {}): SchoolInvoice {
  return {
    id: "inv-1",
    amount: 100,
    status: "UNPAID",
    dueDate: null,
    paid: 0,
    balance: 100,
    feeStructure: { id: "fee-1", name: "Tuition" },
    enrollmentId: "enr-1",
    studentId: "student-1",
    firstName: "Amina",
    lastName: "Yusuf",
    ...overrides,
  } as SchoolInvoice;
}

function charge(overrides: Partial<SchoolCharge> = {}): SchoolCharge {
  return {
    id: "chg-1",
    amount: 50,
    status: "OUTSTANDING",
    dueDate: null,
    paid: 0,
    feeStructure: { id: "fee-2", name: "Bus Fee" },
    billingPeriod: null,
    enrollmentId: "enr-2",
    studentId: "student-2",
    firstName: "Bashir",
    lastName: "Ali",
    ...overrides,
  } as SchoolCharge;
}

function adjustment(overrides: Partial<FeeAdjustment> = {}): FeeAdjustment {
  return {
    id: "adj-1",
    schoolId: "school-1",
    enrollmentId: "enr-1",
    invoiceId: "inv-1",
    chargeId: null,
    type: "SCHOLARSHIP",
    amount: "20.00",
    reason: "Merit award",
    status: "PENDING",
    requestedByUserId: "user-1",
    approvedByUserId: null,
    createdAt: "2028-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderTab(overrides: Partial<React.ComponentProps<typeof FeeAdjustmentsTab>> = {}) {
  return render(
    <ToastProvider>
      <FeeAdjustmentsTab
        accessToken="token-1"
        schoolId="school-1"
        invoices={[invoice()]}
        charges={[charge()]}
        canManage={true}
        {...overrides}
      />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FeeAdjustmentsTab — loading/error/empty states", () => {
  it("shows a loading indicator before adjustments resolve", async () => {
    let resolve!: (v: FeeAdjustment[]) => void;
    apiMock.listFeeAdjustments.mockReturnValue(new Promise((r) => (resolve = r)));
    renderTab();

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    resolve([]);
    await waitFor(() => expect(screen.getByText("No adjustments yet")).toBeInTheDocument());
  });

  it("shows the ApiError's own message when loading fails", async () => {
    apiMock.listFeeAdjustments.mockRejectedValue(new ApiError("School not found"));
    renderTab();
    expect(await screen.findByText("School not found")).toBeInTheDocument();
  });

  it("shows a generic fallback message for a non-ApiError load failure", async () => {
    apiMock.listFeeAdjustments.mockRejectedValue(new Error("network down"));
    renderTab();
    expect(await screen.findByText("Failed to load fee adjustments")).toBeInTheDocument();
  });

  it("shows an EmptyState when the school has no adjustments yet", async () => {
    apiMock.listFeeAdjustments.mockResolvedValue([]);
    renderTab();
    expect(await screen.findByText("No adjustments yet")).toBeInTheDocument();
  });
});

describe("FeeAdjustmentsTab — school isolation", () => {
  it("loads adjustments scoped to exactly the given schoolId", async () => {
    apiMock.listFeeAdjustments.mockResolvedValue([]);
    renderTab({ schoolId: "school-42" });
    await waitFor(() => expect(apiMock.listFeeAdjustments).toHaveBeenCalledWith("token-1", "school-42"));
  });

  it("creates the adjustment scoped to the same schoolId, never a different or hardcoded one", async () => {
    const user = userEvent.setup();
    apiMock.listFeeAdjustments.mockResolvedValue([]);
    apiMock.createFeeAdjustment.mockResolvedValue(adjustment());
    renderTab({ schoolId: "school-42" });
    await screen.findByRole("heading", { name: "Add adjustment" });
    await user.type(screen.getByPlaceholderText("Sibling discount"), "Reason");
    await user.type(screen.getByRole("spinbutton"), "10");

    await user.click(screen.getByRole("button", { name: "Apply adjustment" }));

    await waitFor(() =>
      expect(apiMock.createFeeAdjustment).toHaveBeenCalledWith(
        "token-1",
        "school-42",
        expect.objectContaining({ amount: 10, reason: "Reason" }),
      ),
    );
  });
});

describe("FeeAdjustmentsTab — RBAC", () => {
  it("hides the 'Add adjustment' panel entirely when canManage is false", async () => {
    apiMock.listFeeAdjustments.mockResolvedValue([]);
    renderTab({ canManage: false });
    await screen.findByText("No adjustments yet");
    expect(screen.queryByRole("heading", { name: "Add adjustment" })).not.toBeInTheDocument();
  });

  it("hides the 'Add adjustment' panel when canManage is true but there are no invoices or charges to target", async () => {
    apiMock.listFeeAdjustments.mockResolvedValue([]);
    renderTab({ canManage: true, invoices: [], charges: [] });
    await screen.findByText("No adjustments yet");
    expect(screen.queryByRole("heading", { name: "Add adjustment" })).not.toBeInTheDocument();
  });
});

describe("FeeAdjustmentsTab — real data rendering", () => {
  it("renders the human-readable type label, amount, reason, and status badge", async () => {
    apiMock.listFeeAdjustments.mockResolvedValue([adjustment({ type: "SCHOLARSHIP", amount: "20.00", reason: "Merit award", status: "PENDING" })]);
    renderTab();

    expect(await screen.findByText("Scholarship · $20.00")).toBeInTheDocument();
    expect(screen.getByText("Merit award")).toBeInTheDocument();
    expect(screen.getByText("PENDING")).toBeInTheDocument();
  });

  it.each([
    ["DISCOUNT", "Discount"],
    ["SCHOLARSHIP", "Scholarship"],
    ["CORRECTION", "Correction"],
    ["WAIVER", "Waiver"],
  ] as const)("maps type %s to the label %s", async (type, label) => {
    apiMock.listFeeAdjustments.mockResolvedValue([adjustment({ type, amount: "5.00" })]);
    renderTab();
    expect(await screen.findByText(`${label} · $5.00`)).toBeInTheDocument();
  });

  it.each([
    ["APPROVED", "success"],
    ["PENDING", "warning"],
    ["REJECTED", "danger"],
  ] as const)("gives status %s the %s tone", async (status, tone) => {
    apiMock.listFeeAdjustments.mockResolvedValue([adjustment({ status })]);
    renderTab();
    const badge = await screen.findByText(status);
    expect(badge.className).toContain(tone);
  });

  it("builds the target dropdown with invoice targets first, then charge targets, each labeled with name/fee/kind/amount", async () => {
    apiMock.listFeeAdjustments.mockResolvedValue([]);
    renderTab({
      invoices: [invoice({ id: "inv-1", firstName: "Amina", lastName: "Yusuf", amount: 100, feeStructure: { id: "f1", name: "Tuition" } })],
      charges: [charge({ id: "chg-1", firstName: "Bashir", lastName: "Ali", amount: 50, feeStructure: { id: "f2", name: "Bus Fee" } })],
    });
    await screen.findByRole("heading", { name: "Add adjustment" });

    const options = screen.getAllByRole("option").filter((o) => o.closest("select") === screen.getAllByRole("combobox")[0]);
    expect(options[0]).toHaveTextContent("Amina Yusuf — Tuition (Invoice, $100)");
    expect(options[1]).toHaveTextContent("Bashir Ali — Bus Fee (Charge, $50)");
  });
});

describe("FeeAdjustmentsTab — create adjustment (mutation)", () => {
  it("submits invoiceId (not chargeId) when the target is an invoice", async () => {
    const user = userEvent.setup();
    apiMock.listFeeAdjustments.mockResolvedValue([]);
    apiMock.createFeeAdjustment.mockResolvedValue(adjustment());
    renderTab({
      invoices: [invoice({ id: "inv-9", enrollmentId: "enr-9" })],
      charges: [],
    });
    await screen.findByRole("heading", { name: "Add adjustment" });
    await user.type(screen.getByPlaceholderText("Sibling discount"), "Reason");
    await user.type(screen.getByRole("spinbutton"), "10");

    await user.click(screen.getByRole("button", { name: "Apply adjustment" }));

    await waitFor(() =>
      expect(apiMock.createFeeAdjustment).toHaveBeenCalledWith(
        "token-1",
        "school-1",
        expect.objectContaining({ enrollmentId: "enr-9", invoiceId: "inv-9", chargeId: undefined }),
      ),
    );
  });

  it("submits chargeId (not invoiceId) when the target is a charge", async () => {
    const user = userEvent.setup();
    apiMock.listFeeAdjustments.mockResolvedValue([]);
    apiMock.createFeeAdjustment.mockResolvedValue(adjustment());
    renderTab({
      invoices: [],
      charges: [charge({ id: "chg-9", enrollmentId: "enr-9" })],
    });
    await screen.findByRole("heading", { name: "Add adjustment" });
    await user.type(screen.getByPlaceholderText("Sibling discount"), "Reason");
    await user.type(screen.getByRole("spinbutton"), "10");

    await user.click(screen.getByRole("button", { name: "Apply adjustment" }));

    await waitFor(() =>
      expect(apiMock.createFeeAdjustment).toHaveBeenCalledWith(
        "token-1",
        "school-1",
        expect.objectContaining({ enrollmentId: "enr-9", chargeId: "chg-9", invoiceId: undefined }),
      ),
    );
  });

  it("submits the selected type, entered amount (as a number), and reason", async () => {
    const user = userEvent.setup();
    apiMock.listFeeAdjustments.mockResolvedValue([]);
    apiMock.createFeeAdjustment.mockResolvedValue(adjustment());
    renderTab();
    await screen.findByRole("heading", { name: "Add adjustment" });
    const [, typeSelect] = screen.getAllByRole("combobox");
    await user.selectOptions(typeSelect, "WAIVER");
    await user.type(screen.getByRole("spinbutton"), "15.50");
    await user.type(screen.getByPlaceholderText("Sibling discount"), "Financial hardship");

    await user.click(screen.getByRole("button", { name: "Apply adjustment" }));

    await waitFor(() =>
      expect(apiMock.createFeeAdjustment).toHaveBeenCalledWith(
        "token-1",
        "school-1",
        expect.objectContaining({ type: "WAIVER", amount: 15.5, reason: "Financial hardship" }),
      ),
    );
  });

  it("clears the amount/reason fields, reloads the list, and shows a success toast after a successful save", async () => {
    const user = userEvent.setup();
    apiMock.listFeeAdjustments.mockResolvedValueOnce([]).mockResolvedValueOnce([adjustment()]);
    apiMock.createFeeAdjustment.mockResolvedValue(adjustment());
    renderTab();
    await screen.findByText("No adjustments yet");
    const amountInput = screen.getByRole("spinbutton") as HTMLInputElement;
    const reasonInput = screen.getByPlaceholderText("Sibling discount") as HTMLInputElement;
    await user.type(reasonInput, "Reason");
    await user.type(amountInput, "10");

    await user.click(screen.getByRole("button", { name: "Apply adjustment" }));

    expect(await screen.findByText("Adjustment applied.")).toBeInTheDocument();
    await waitFor(() => expect(amountInput.value).toBe(""));
    expect(reasonInput.value).toBe("");
    await waitFor(() => expect(apiMock.listFeeAdjustments).toHaveBeenCalledTimes(2));
  });

  it("shows the ApiError's message inline (not a toast) when creating fails", async () => {
    const user = userEvent.setup();
    apiMock.listFeeAdjustments.mockResolvedValue([]);
    apiMock.createFeeAdjustment.mockRejectedValue(new ApiError("Adjustment exceeds the remaining balance"));
    renderTab();
    await screen.findByRole("heading", { name: "Add adjustment" });
    await user.type(screen.getByPlaceholderText("Sibling discount"), "Reason");
    await user.type(screen.getByRole("spinbutton"), "10");

    await user.click(screen.getByRole("button", { name: "Apply adjustment" }));

    expect(await screen.findByText("Adjustment exceeds the remaining balance")).toBeInTheDocument();
  });

  it("shows a generic fallback message for a non-ApiError creation failure", async () => {
    const user = userEvent.setup();
    apiMock.listFeeAdjustments.mockResolvedValue([]);
    apiMock.createFeeAdjustment.mockRejectedValue(new Error("network down"));
    renderTab();
    await screen.findByRole("heading", { name: "Add adjustment" });
    await user.type(screen.getByPlaceholderText("Sibling discount"), "Reason");
    await user.type(screen.getByRole("spinbutton"), "10");

    await user.click(screen.getByRole("button", { name: "Apply adjustment" }));

    expect(await screen.findByText("Failed to create adjustment")).toBeInTheDocument();
  });

  it("requires an amount > 0 and a reason via native validation attributes", async () => {
    apiMock.listFeeAdjustments.mockResolvedValue([]);
    renderTab();
    await screen.findByRole("heading", { name: "Add adjustment" });

    const amountInput = screen.getByRole("spinbutton") as HTMLInputElement;
    expect(amountInput.required).toBe(true);
    expect(amountInput.min).toBe("0.01");
    const reasonInput = screen.getByPlaceholderText("Sibling discount") as HTMLInputElement;
    expect(reasonInput.required).toBe(true);
  });
});
