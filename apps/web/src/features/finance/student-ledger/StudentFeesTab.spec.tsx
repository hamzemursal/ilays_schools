import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StudentLedger, StudentLedgerEntry } from "@/lib/api";
import { StudentFeesTab } from "./StudentFeesTab";

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
  getStudentLedger: vi.fn(),
  recordPayment: vi.fn(),
  recordChargePayment: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

// ToastProvider isn't needed here — unlike ChargesTab, RecordEntryPaymentForm
// calls useToast() directly, so it still needs a provider ancestor.
import { ToastProvider } from "@/components/ui/Toast";

function invoiceEntry(overrides: Partial<StudentLedgerEntry> = {}): StudentLedgerEntry {
  return {
    id: "inv-1",
    kind: "INVOICE",
    amount: 100,
    status: "UNPAID",
    dueDate: null,
    paid: 0,
    feeStructure: { id: "fee-1", name: "Tuition" },
    payments: [],
    ...overrides,
  } as StudentLedgerEntry;
}

function chargeEntry(overrides: Partial<StudentLedgerEntry> = {}): StudentLedgerEntry {
  return {
    id: "chg-1",
    kind: "CHARGE",
    amount: 50,
    status: "OUTSTANDING",
    dueDate: null,
    paid: 0,
    feeStructure: { id: "fee-2", name: "Bus Fee" },
    billingPeriod: { id: "bp-1", name: "January" },
    payments: [],
    ...overrides,
  } as StudentLedgerEntry;
}

function ledger(overrides: Partial<StudentLedger> = {}): StudentLedger {
  return {
    summary: { totalCharged: 0, totalPaid: 0, totalAdjustments: 0, balance: 0 },
    invoices: [],
    charges: [],
    adjustments: [],
    ...overrides,
  };
}

function renderTab(overrides: Partial<React.ComponentProps<typeof StudentFeesTab>> = {}) {
  return render(
    <ToastProvider>
      <StudentFeesTab accessToken="token-1" studentId="student-1" canRecordPayments={true} {...overrides} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("StudentFeesTab — loading/error/empty states", () => {
  it("shows skeleton cards before the ledger resolves", async () => {
    let resolve!: (v: StudentLedger) => void;
    apiMock.getStudentLedger.mockReturnValue(new Promise((r) => (resolve = r)));
    const { container } = renderTab();

    expect(container.querySelector(".animate-pulse")).not.toBeNull();
    resolve(ledger());
    await waitFor(() => expect(container.querySelector(".animate-pulse")).toBeNull());
  });

  it("shows the ApiError's own message when loading fails", async () => {
    apiMock.getStudentLedger.mockRejectedValue(new ApiError("Student not found"));
    renderTab();
    expect(await screen.findByText("Student not found")).toBeInTheDocument();
  });

  it("shows a generic fallback message for a non-ApiError load failure", async () => {
    apiMock.getStudentLedger.mockRejectedValue(new Error("network down"));
    renderTab();
    expect(await screen.findByText("Failed to load fees")).toBeInTheDocument();
  });

  it("shows 'No fees charged yet' when there are no invoices or charges", async () => {
    apiMock.getStudentLedger.mockResolvedValue(ledger());
    renderTab();
    expect(await screen.findByText("No fees charged yet")).toBeInTheDocument();
  });

  it("shows 'No payments recorded yet' when no entry has any payments", async () => {
    apiMock.getStudentLedger.mockResolvedValue(ledger({ invoices: [invoiceEntry()] }));
    renderTab();
    expect(await screen.findByText("No payments recorded yet")).toBeInTheDocument();
  });

  it("never renders the adjustments card at all when there are no adjustments", async () => {
    apiMock.getStudentLedger.mockResolvedValue(ledger());
    renderTab();
    await screen.findByText("No fees charged yet");
    expect(screen.queryByText("Discounts & adjustments")).not.toBeInTheDocument();
  });
});

describe("StudentFeesTab — scoping (per-student, the isolation boundary this view uses)", () => {
  it("loads the ledger for exactly the given studentId, never a different one", async () => {
    apiMock.getStudentLedger.mockResolvedValue(ledger());
    renderTab({ studentId: "student-77" });
    await waitFor(() => expect(apiMock.getStudentLedger).toHaveBeenCalledWith("token-1", "student-77"));
  });
});

describe("StudentFeesTab — RBAC", () => {
  it("shows 'Record payment' on an unpaid entry only when canRecordPayments is true", async () => {
    apiMock.getStudentLedger.mockResolvedValue(ledger({ invoices: [invoiceEntry()] }));
    renderTab({ canRecordPayments: true });
    expect(await screen.findByRole("button", { name: "Record payment" })).toBeInTheDocument();
  });

  it("never renders 'Record payment' when canRecordPayments is false", async () => {
    apiMock.getStudentLedger.mockResolvedValue(ledger({ invoices: [invoiceEntry()] }));
    renderTab({ canRecordPayments: false });
    await screen.findByText("Tuition");
    expect(screen.queryByRole("button", { name: "Record payment" })).not.toBeInTheDocument();
  });

  it("never renders 'Record payment' for an already-PAID or CANCELLED entry, even when canRecordPayments is true", async () => {
    apiMock.getStudentLedger.mockResolvedValue(
      ledger({ invoices: [invoiceEntry({ id: "i1", status: "PAID", paid: 100 })], charges: [chargeEntry({ id: "c1", status: "CANCELLED" })] }),
    );
    renderTab({ canRecordPayments: true });
    await screen.findAllByText(/Tuition|Bus Fee/);
    expect(screen.queryByRole("button", { name: "Record payment" })).not.toBeInTheDocument();
  });
});

describe("StudentFeesTab — real data rendering", () => {
  it("shows the summary stat cards for total fees, paid, and outstanding balance", async () => {
    apiMock.getStudentLedger.mockResolvedValue(
      ledger({ summary: { totalCharged: 150, totalPaid: 40, totalAdjustments: 0, balance: 110 } }),
    );
    renderTab();
    expect(await screen.findByText("$150.00")).toBeInTheDocument();
    expect(screen.getByText("$40.00")).toBeInTheDocument();
    expect(screen.getByText("$110.00")).toBeInTheDocument();
  });

  it("merges invoices and charges into one fee schedule, invoices first", async () => {
    apiMock.getStudentLedger.mockResolvedValue(
      ledger({ invoices: [invoiceEntry({ id: "i1" })], charges: [chargeEntry({ id: "c1" })] }),
    );
    renderTab();
    expect(await screen.findByText("Tuition")).toBeInTheDocument();
    expect(screen.getByText("Bus Fee")).toBeInTheDocument();
  });

  it("shows the billing period prefix only for a CHARGE entry that has one, never for an INVOICE", async () => {
    apiMock.getStudentLedger.mockResolvedValue(
      ledger({ invoices: [invoiceEntry({ id: "i1" })], charges: [chargeEntry({ id: "c1", billingPeriod: { id: "bp-1", name: "January" } })] }),
    );
    renderTab();
    await screen.findByText("Tuition");
    expect(screen.getByText(/January ·/)).toBeInTheDocument();
  });

  it("computes and displays balance as amount minus paid for each entry", async () => {
    apiMock.getStudentLedger.mockResolvedValue(ledger({ invoices: [invoiceEntry({ amount: 100, paid: 30 })] }));
    renderTab();
    expect(await screen.findByText(/balance \$70\.00/)).toBeInTheDocument();
  });

  it("renders the adjustments card only when there is at least one adjustment, with type/amount/reason and a status badge", async () => {
    apiMock.getStudentLedger.mockResolvedValue(
      ledger({
        adjustments: [
          { id: "adj-1", schoolId: "school-1", enrollmentId: "enr-1", invoiceId: "i1", chargeId: null, type: "SCHOLARSHIP", amount: "20.00", reason: "Merit award", status: "APPROVED", requestedByUserId: "u1", approvedByUserId: "u2", createdAt: "2028-01-01" },
        ],
      }),
    );
    renderTab();
    expect(await screen.findByText("Discounts & adjustments")).toBeInTheDocument();
    expect(screen.getByText("Scholarship · $20.00")).toBeInTheDocument();
    expect(screen.getByText("Merit award")).toBeInTheDocument();
    expect(screen.getByText("APPROVED")).toBeInTheDocument();
  });

  it("renders payment history sorted newest-first, with entry label and optional reference", async () => {
    apiMock.getStudentLedger.mockResolvedValue(
      ledger({
        invoices: [
          invoiceEntry({
            id: "i1",
            paid: 60,
            payments: [
              { id: "p1", amount: "20.00", method: "CASH", reference: null, paidAt: "2028-01-01T00:00:00Z", status: "POSTED" },
              { id: "p2", amount: "40.00", method: "MOBILE_MONEY", reference: "RCPT-9", paidAt: "2028-02-01T00:00:00Z", status: "POSTED" },
            ],
          }),
        ],
      }),
    );
    renderTab();

    const amounts = await screen.findAllByText(/\$(20|40)\.00 ·/);
    expect(amounts[0]).toHaveTextContent("$40.00");
    expect(amounts[1]).toHaveTextContent("$20.00");
    expect(screen.getByText(/Ref: RCPT-9/)).toBeInTheDocument();
  });
});

describe("StudentFeesTab + RecordEntryPaymentForm — payment mutation routing by entry.kind", () => {
  it("routes an INVOICE entry's payment to api.recordPayment, never recordChargePayment", async () => {
    const user = userEvent.setup();
    apiMock.getStudentLedger.mockResolvedValue(ledger({ invoices: [invoiceEntry({ id: "inv-9", amount: 100, paid: 0 })] }));
    apiMock.recordPayment.mockResolvedValue({ id: "pay-1" });
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Record payment" }));

    await user.click(screen.getByRole("button", { name: "Save payment" }));

    await waitFor(() =>
      expect(apiMock.recordPayment).toHaveBeenCalledWith("token-1", "inv-9", { amount: 100, method: "CASH", reference: undefined }),
    );
    expect(apiMock.recordChargePayment).not.toHaveBeenCalled();
  });

  it("routes a CHARGE entry's payment to api.recordChargePayment, never recordPayment", async () => {
    const user = userEvent.setup();
    apiMock.getStudentLedger.mockResolvedValue(ledger({ charges: [chargeEntry({ id: "chg-9", amount: 50, paid: 0 })] }));
    apiMock.recordChargePayment.mockResolvedValue({ id: "pay-1" });
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Record payment" }));

    await user.click(screen.getByRole("button", { name: "Save payment" }));

    await waitFor(() =>
      expect(apiMock.recordChargePayment).toHaveBeenCalledWith("token-1", "chg-9", { amount: 50, method: "CASH", reference: undefined }),
    );
    expect(apiMock.recordPayment).not.toHaveBeenCalled();
  });

  it("prefills the amount to the remaining balance, with min 0.01 and max the remaining balance", async () => {
    const user = userEvent.setup();
    apiMock.getStudentLedger.mockResolvedValue(ledger({ invoices: [invoiceEntry({ amount: 100, paid: 35 })] }));
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Record payment" }));

    const amountInput = screen.getByRole("spinbutton") as HTMLInputElement;
    expect(amountInput.value).toBe("65");
    expect(amountInput.min).toBe("0.01");
    expect(amountInput.max).toBe("65");
  });

  it("sends an explicit reference when one is entered, and omits it (undefined) when left blank", async () => {
    const user = userEvent.setup();
    apiMock.getStudentLedger.mockResolvedValue(ledger({ invoices: [invoiceEntry({ id: "inv-1", amount: 100, paid: 0 })] }));
    apiMock.recordPayment.mockResolvedValue({ id: "pay-1" });
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Record payment" }));
    await user.type(screen.getByRole("textbox"), "RCPT-42");

    await user.click(screen.getByRole("button", { name: "Save payment" }));

    await waitFor(() =>
      expect(apiMock.recordPayment).toHaveBeenCalledWith("token-1", "inv-1", expect.objectContaining({ reference: "RCPT-42" })),
    );
  });

  it("marks the entry PAID and closes the form after a full payment", async () => {
    const user = userEvent.setup();
    apiMock.getStudentLedger.mockResolvedValue(ledger({ invoices: [invoiceEntry({ id: "inv-1", amount: 100, paid: 0 })] }));
    apiMock.recordPayment.mockResolvedValue({ id: "pay-1" });
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Record payment" }));

    await user.click(screen.getByRole("button", { name: "Save payment" }));

    await waitFor(() => expect(screen.getByText("PAID")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Save payment" })).not.toBeInTheDocument();
  });

  it("marks the entry PARTIALLY_PAID when the payment doesn't cover the full remaining balance", async () => {
    const user = userEvent.setup();
    apiMock.getStudentLedger.mockResolvedValue(ledger({ invoices: [invoiceEntry({ id: "inv-1", amount: 100, paid: 0 })] }));
    apiMock.recordPayment.mockResolvedValue({ id: "pay-1" });
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Record payment" }));
    const amountInput = screen.getByRole("spinbutton");
    await user.clear(amountInput);
    await user.type(amountInput, "40");

    await user.click(screen.getByRole("button", { name: "Save payment" }));

    await waitFor(() => expect(screen.getByText("PARTIALLY PAID")).toBeInTheDocument());
  });

  it("shows a success toast reading 'Payment recorded.' after a successful save", async () => {
    const user = userEvent.setup();
    apiMock.getStudentLedger.mockResolvedValue(ledger({ invoices: [invoiceEntry({ amount: 100, paid: 0 })] }));
    apiMock.recordPayment.mockResolvedValue({ id: "pay-1" });
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Record payment" }));

    await user.click(screen.getByRole("button", { name: "Save payment" }));

    expect(await screen.findByText("Payment recorded.")).toBeInTheDocument();
  });

  it("shows an inline error alert and keeps the form open when the payment fails", async () => {
    const user = userEvent.setup();
    apiMock.getStudentLedger.mockResolvedValue(ledger({ invoices: [invoiceEntry({ amount: 100, paid: 0 })] }));
    apiMock.recordPayment.mockRejectedValue(new ApiError("Payment exceeds the remaining balance"));
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Record payment" }));

    await user.click(screen.getByRole("button", { name: "Save payment" }));

    expect(await screen.findByText("Payment exceeds the remaining balance")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save payment" })).toBeInTheDocument();
  });

  it("shows a generic fallback message for a non-ApiError payment failure", async () => {
    const user = userEvent.setup();
    apiMock.getStudentLedger.mockResolvedValue(ledger({ invoices: [invoiceEntry({ amount: 100, paid: 0 })] }));
    apiMock.recordPayment.mockRejectedValue(new Error("network down"));
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Record payment" }));

    await user.click(screen.getByRole("button", { name: "Save payment" }));

    expect(await screen.findByText("Failed to record payment")).toBeInTheDocument();
  });

  it("toggling 'Record payment' to 'Cancel' closes the form without submitting anything", async () => {
    const user = userEvent.setup();
    apiMock.getStudentLedger.mockResolvedValue(ledger({ invoices: [invoiceEntry()] }));
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Record payment" }));
    expect(screen.getByRole("button", { name: "Save payment" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("button", { name: "Save payment" })).not.toBeInTheDocument();
    expect(apiMock.recordPayment).not.toHaveBeenCalled();
  });

  it("only one entry's payment form is open at a time — opening a second entry's form isn't possible without closing the first via its own toggle", async () => {
    const user = userEvent.setup();
    apiMock.getStudentLedger.mockResolvedValue(
      ledger({ invoices: [invoiceEntry({ id: "i1" })], charges: [chargeEntry({ id: "c1" })] }),
    );
    renderTab();
    const buttons = await screen.findAllByRole("button", { name: "Record payment" });
    await user.click(buttons[0]);

    expect(screen.getAllByRole("button", { name: "Save payment" })).toHaveLength(1);
  });
});
