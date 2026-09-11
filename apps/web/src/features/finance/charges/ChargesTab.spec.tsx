import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@/components/ui/Toast";
import type { BillingPeriod, FeeStructure, SchoolCharge } from "@/lib/api";
import { ChargesTab } from "./ChargesTab";

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
  listCharges: vi.fn(),
  generateCharges: vi.fn(),
  recordChargePayment: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

const FEE_STRUCTURES: FeeStructure[] = [
  { id: "fee-1", name: "Tuition", amount: "100.00", classId: null, class: null, academicYear: { id: "year-1", name: "2028" } },
];
const BILLING_PERIODS: BillingPeriod[] = [
  { id: "bp-1", schoolId: "school-1", academicYearId: "year-1", name: "January", startDate: "2028-01-01", endDate: "2028-01-31" },
];

function charge(overrides: Partial<SchoolCharge> = {}): SchoolCharge {
  return {
    id: "charge-1",
    amount: 100,
    status: "OUTSTANDING",
    dueDate: null,
    paid: 0,
    feeStructure: { id: "fee-1", name: "Tuition" },
    billingPeriod: { id: "bp-1", name: "January" },
    enrollmentId: "enr-1",
    studentId: "student-1",
    firstName: "Amina",
    lastName: "Yusuf",
    ...overrides,
  };
}

function renderTab(overrides: Partial<React.ComponentProps<typeof ChargesTab>> = {}) {
  return render(
    <ToastProvider>
      <ChargesTab
        accessToken="token-1"
        schoolId="school-1"
        feeStructures={FEE_STRUCTURES}
        billingPeriods={BILLING_PERIODS}
        canManage={true}
        canRecordPayments={true}
        {...overrides}
      />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.listCharges.mockResolvedValue([]);
});

describe("ChargesTab — loading/error/empty states", () => {
  it("shows a loading indicator before the charges list resolves", async () => {
    let resolve!: (v: SchoolCharge[]) => void;
    apiMock.listCharges.mockReturnValue(new Promise((r) => (resolve = r)));

    renderTab();

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    resolve([]);
    await waitFor(() => expect(screen.getByText("No charges yet")).toBeInTheDocument());
  });

  it("shows the ApiError's own message when loading fails", async () => {
    apiMock.listCharges.mockRejectedValue(new ApiError("School not found"));
    renderTab();
    expect(await screen.findByText("School not found")).toBeInTheDocument();
  });

  it("shows a generic fallback message for a non-ApiError load failure", async () => {
    apiMock.listCharges.mockRejectedValue(new Error("network down"));
    renderTab();
    expect(await screen.findByText("Failed to load charges")).toBeInTheDocument();
  });

  it("shows an EmptyState when the school has no charges yet", async () => {
    apiMock.listCharges.mockResolvedValue([]);
    renderTab();
    expect(await screen.findByText("No charges yet")).toBeInTheDocument();
  });
});

describe("ChargesTab — school isolation", () => {
  it("loads charges scoped to exactly the given schoolId", async () => {
    apiMock.listCharges.mockResolvedValue([]);
    renderTab({ schoolId: "school-42" });
    await waitFor(() => expect(apiMock.listCharges).toHaveBeenCalledWith("token-1", "school-42"));
  });

  it("generates charges scoped to the same schoolId, never a different or hardcoded one", async () => {
    const user = userEvent.setup();
    apiMock.listCharges.mockResolvedValue([]);
    apiMock.generateCharges.mockResolvedValue({ createdCount: 3, eligibleEnrollments: 3 });
    renderTab({ schoolId: "school-42" });
    await screen.findByRole("heading", { name: "Generate charges" });

    await user.click(screen.getByRole("button", { name: "Generate charges" }));

    await waitFor(() =>
      expect(apiMock.generateCharges).toHaveBeenCalledWith("token-1", "school-42", "fee-1", "bp-1"),
    );
  });
});

describe("ChargesTab — RBAC", () => {
  it("hides the 'Generate charges' panel entirely when canManage is false", async () => {
    apiMock.listCharges.mockResolvedValue([]);
    renderTab({ canManage: false });
    await screen.findByText("No charges yet");
    expect(screen.queryByText("Generate charges")).not.toBeInTheDocument();
  });

  it("hides the 'Generate charges' panel when canManage is true but there are no fee structures or billing periods yet", async () => {
    apiMock.listCharges.mockResolvedValue([]);
    renderTab({ canManage: true, feeStructures: [], billingPeriods: [] });
    await screen.findByText("No charges yet");
    expect(screen.queryByText("Generate charges")).not.toBeInTheDocument();
  });

  it("shows 'Record payment' on an outstanding charge only when canRecordPayments is true", async () => {
    apiMock.listCharges.mockResolvedValue([charge({ status: "OUTSTANDING" })]);
    renderTab({ canRecordPayments: true });
    expect(await screen.findByRole("button", { name: "Record payment" })).toBeInTheDocument();
  });

  it("never renders 'Record payment' when canRecordPayments is false", async () => {
    apiMock.listCharges.mockResolvedValue([charge({ status: "OUTSTANDING" })]);
    renderTab({ canRecordPayments: false });
    await screen.findByText("Amina", { exact: false });
    expect(screen.queryByRole("button", { name: "Record payment" })).not.toBeInTheDocument();
  });

  it("never renders 'Record payment' for an already-PAID or CANCELLED charge, even when canRecordPayments is true", async () => {
    apiMock.listCharges.mockResolvedValue([
      charge({ id: "c1", status: "PAID", paid: 100 }),
      charge({ id: "c2", status: "CANCELLED" }),
    ]);
    renderTab({ canRecordPayments: true });
    await screen.findAllByText("Amina Yusuf");
    expect(screen.queryByRole("button", { name: "Record payment" })).not.toBeInTheDocument();
  });
});

describe("ChargesTab — real data rendering", () => {
  // canManage: false throughout this block — the generate-charges panel's
  // own <select> options ("Tuition"/"January") would otherwise collide with
  // identical text in the charge row itself.
  it("renders the student name, fee structure, billing period, amount, and computed balance", async () => {
    apiMock.listCharges.mockResolvedValue([charge({ amount: 100, paid: 40 })]);
    renderTab({ canManage: false });

    expect(await screen.findByText("Amina Yusuf")).toBeInTheDocument();
    expect(screen.getByText(/Tuition/)).toBeInTheDocument();
    expect(screen.getByText(/January/)).toBeInTheDocument();
    expect(screen.getByText(/balance \$60\.00/)).toBeInTheDocument();
  });

  it("shows the status badge with underscores replaced by spaces", async () => {
    apiMock.listCharges.mockResolvedValue([charge({ status: "PARTIALLY_PAID" })]);
    renderTab({ canManage: false });
    expect(await screen.findByText("PARTIALLY PAID")).toBeInTheDocument();
  });

  it("omits the billing period segment for a charge with none", async () => {
    apiMock.listCharges.mockResolvedValue([charge({ billingPeriod: null })]);
    renderTab({ canManage: false });
    await screen.findByText("Amina Yusuf");
    expect(screen.queryByText("January")).not.toBeInTheDocument();
  });
});

describe("ChargesTab — generate charges (mutation)", () => {
  it("shows the created/eligible counts and reloads the charges list on success", async () => {
    const user = userEvent.setup();
    apiMock.listCharges.mockResolvedValueOnce([]).mockResolvedValueOnce([charge()]);
    apiMock.generateCharges.mockResolvedValue({ createdCount: 5, eligibleEnrollments: 8 });
    renderTab();
    await screen.findByText("No charges yet");

    await user.click(screen.getByRole("button", { name: "Generate charges" }));

    expect(await screen.findByText("5 charge(s) created (8 eligible)")).toBeInTheDocument();
    await waitFor(() => expect(apiMock.listCharges).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Amina Yusuf")).toBeInTheDocument();
  });

  it("shows the ApiError's message inline when generating fails, without crashing the page", async () => {
    const user = userEvent.setup();
    apiMock.listCharges.mockResolvedValue([]);
    apiMock.generateCharges.mockRejectedValue(new ApiError("This billing period is not in this school"));
    renderTab();
    await screen.findByRole("heading", { name: "Generate charges" });

    await user.click(screen.getByRole("button", { name: "Generate charges" }));

    expect(await screen.findByText("This billing period is not in this school")).toBeInTheDocument();
  });
});

describe("ChargesTab — record a charge payment (mutation)", () => {
  it("prefills the amount with the remaining balance, with min 0.01 and max the remaining balance", async () => {
    const user = userEvent.setup();
    apiMock.listCharges.mockResolvedValue([charge({ amount: 100, paid: 40 })]);
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Record payment" }));

    const amountInput = screen.getByRole("spinbutton") as HTMLInputElement;
    expect(amountInput.value).toBe("60");
    expect(amountInput.min).toBe("0.01");
    expect(amountInput.max).toBe("60");
  });

  it("toggling 'Record payment' to 'Cancel' closes the form without submitting anything", async () => {
    const user = userEvent.setup();
    apiMock.listCharges.mockResolvedValue([charge()]);
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Record payment" }));
    expect(screen.getByRole("button", { name: "Save payment" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("button", { name: "Save payment" })).not.toBeInTheDocument();
    expect(apiMock.recordChargePayment).not.toHaveBeenCalled();
  });

  it("submits the entered amount/method/reference to recordChargePayment for the correct charge id", async () => {
    const user = userEvent.setup();
    apiMock.listCharges.mockResolvedValue([charge({ id: "charge-9", amount: 100, paid: 0 })]);
    apiMock.recordChargePayment.mockResolvedValue({ id: "pay-1" });
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Record payment" }));

    const amountInput = screen.getByRole("spinbutton");
    await user.clear(amountInput);
    await user.type(amountInput, "25");
    // The generate-charges panel (rendered above) contributes two comboboxes
    // of its own (fee structure, billing period); the payment form's method
    // select is always the last one in DOM order.
    await user.selectOptions(screen.getAllByRole("combobox").at(-1)!, "MOBILE_MONEY");
    const referenceInput = screen.getByRole("textbox");
    await user.type(referenceInput, "RCPT-1");

    await user.click(screen.getByRole("button", { name: "Save payment" }));

    await waitFor(() =>
      expect(apiMock.recordChargePayment).toHaveBeenCalledWith("token-1", "charge-9", {
        amount: 25,
        method: "MOBILE_MONEY",
        reference: "RCPT-1",
      }),
    );
  });

  it("updates the charge's paid amount and status in the list, and closes the form, after a successful save", async () => {
    const user = userEvent.setup();
    apiMock.listCharges.mockResolvedValue([charge({ id: "charge-1", amount: 100, paid: 0, status: "OUTSTANDING" })]);
    apiMock.recordChargePayment.mockResolvedValue({ id: "pay-1" });
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Record payment" }));
    const amountInput = screen.getByRole("spinbutton");
    await user.clear(amountInput);
    await user.type(amountInput, "100");

    await user.click(screen.getByRole("button", { name: "Save payment" }));

    await waitFor(() => expect(screen.getByText("PAID")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Save payment" })).not.toBeInTheDocument();
  });

  it("marks the charge PARTIALLY_PAID (not PAID) when the payment doesn't cover the full remaining balance", async () => {
    const user = userEvent.setup();
    apiMock.listCharges.mockResolvedValue([charge({ id: "charge-1", amount: 100, paid: 0, status: "OUTSTANDING" })]);
    apiMock.recordChargePayment.mockResolvedValue({ id: "pay-1" });
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Record payment" }));
    const amountInput = screen.getByRole("spinbutton");
    await user.clear(amountInput);
    await user.type(amountInput, "30");

    await user.click(screen.getByRole("button", { name: "Save payment" }));

    await waitFor(() => expect(screen.getByText("PARTIALLY PAID")).toBeInTheDocument());
  });

  it("shows a success toast reading 'Payment recorded.' after a successful save", async () => {
    const user = userEvent.setup();
    apiMock.listCharges.mockResolvedValue([charge()]);
    apiMock.recordChargePayment.mockResolvedValue({ id: "pay-1" });
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Record payment" }));
    await user.click(screen.getByRole("button", { name: "Save payment" }));

    expect(await screen.findByText("Payment recorded.")).toBeInTheDocument();
  });

  it("shows an inline error alert and keeps the form open when the payment fails", async () => {
    const user = userEvent.setup();
    apiMock.listCharges.mockResolvedValue([charge()]);
    apiMock.recordChargePayment.mockRejectedValue(new ApiError("Payment exceeds the remaining balance"));
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Record payment" }));

    await user.click(screen.getByRole("button", { name: "Save payment" }));

    expect(await screen.findByText("Payment exceeds the remaining balance")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save payment" })).toBeInTheDocument();
  });
});
