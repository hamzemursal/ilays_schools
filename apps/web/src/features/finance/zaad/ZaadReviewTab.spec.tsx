import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@/components/ui/Toast";
import type { PaymentSubmission, SchoolCharge, SchoolInvoice } from "@/lib/api";
import { ZaadReviewTab } from "./ZaadReviewTab";

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
  listPaymentSubmissions: vi.fn(),
  verifyPaymentSubmission: vi.fn(),
  rejectPaymentSubmission: vi.fn(),
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
    studentId: "student-1",
    firstName: "Amina",
    lastName: "Yusuf",
    ...overrides,
  } as SchoolCharge;
}

function submission(overrides: Partial<PaymentSubmission> = {}): PaymentSubmission {
  return {
    id: "sub-1",
    schoolId: "school-1",
    studentId: "student-1",
    student: { id: "student-1", firstName: "Amina", lastName: "Yusuf" },
    invoiceId: null,
    chargeId: null,
    amount: "50.00",
    provider: "ZAAD",
    providerTransactionReference: null,
    payerPhone: null,
    payerName: null,
    submittedByUserId: "user-1",
    note: null,
    status: "PENDING",
    verifiedByUserId: null,
    verifiedAt: null,
    rejectionReason: null,
    createdAt: "2028-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderTab(overrides: Partial<React.ComponentProps<typeof ZaadReviewTab>> = {}) {
  return render(
    <ToastProvider>
      <ZaadReviewTab
        accessToken="token-1"
        schoolId="school-1"
        invoices={[invoice()]}
        charges={[charge()]}
        canVerify={true}
        {...overrides}
      />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ZaadReviewTab — loading/error/empty states", () => {
  it("shows a loading indicator before submissions resolve", async () => {
    let resolve!: (v: PaymentSubmission[]) => void;
    apiMock.listPaymentSubmissions.mockReturnValue(new Promise((r) => (resolve = r)));
    renderTab();

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    resolve([]);
    await waitFor(() => expect(screen.getByText("No ZAAD submissions")).toBeInTheDocument());
  });

  it("shows the ApiError's own message when loading fails", async () => {
    apiMock.listPaymentSubmissions.mockRejectedValue(new ApiError("School not found"));
    renderTab();
    expect(await screen.findByText("School not found")).toBeInTheDocument();
  });

  it("shows a generic fallback message for a non-ApiError load failure", async () => {
    apiMock.listPaymentSubmissions.mockRejectedValue(new Error("network down"));
    renderTab();
    expect(await screen.findByText("Failed to load ZAAD submissions")).toBeInTheDocument();
  });

  it("shows an EmptyState when there are no submissions", async () => {
    apiMock.listPaymentSubmissions.mockResolvedValue([]);
    renderTab();
    expect(await screen.findByText("No ZAAD submissions")).toBeInTheDocument();
  });
});

describe("ZaadReviewTab — school isolation", () => {
  it("loads submissions scoped to exactly the given schoolId", async () => {
    apiMock.listPaymentSubmissions.mockResolvedValue([]);
    renderTab({ schoolId: "school-42" });
    await waitFor(() => expect(apiMock.listPaymentSubmissions).toHaveBeenCalledWith("token-1", "school-42"));
  });

  it("verifies scoped to the same schoolId", async () => {
    const user = userEvent.setup();
    apiMock.listPaymentSubmissions.mockResolvedValue([submission()]);
    apiMock.verifyPaymentSubmission.mockResolvedValue(submission({ status: "VERIFIED" }));
    renderTab({ schoolId: "school-42" });
    await user.selectOptions(await screen.findByRole("combobox"), "invoice:inv-1");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() =>
      expect(apiMock.verifyPaymentSubmission).toHaveBeenCalledWith("token-1", "school-42", "sub-1", { invoiceId: "inv-1", chargeId: undefined }),
    );
  });

  it("rejects scoped to the same schoolId", async () => {
    const user = userEvent.setup();
    apiMock.listPaymentSubmissions.mockResolvedValue([submission()]);
    apiMock.rejectPaymentSubmission.mockResolvedValue(submission({ status: "REJECTED" }));
    renderTab({ schoolId: "school-42" });
    await user.click(await screen.findByRole("button", { name: "Reject" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.type(within(dialog).getByRole("textbox"), "Not found");
    await user.click(within(dialog).getByRole("button", { name: "Reject" }));
    await waitFor(() =>
      expect(apiMock.rejectPaymentSubmission).toHaveBeenCalledWith("token-1", "school-42", "sub-1", "Not found"),
    );
  });
});

describe("ZaadReviewTab — RBAC", () => {
  it("shows match/verify/reject controls on a PENDING submission only when canVerify is true", async () => {
    apiMock.listPaymentSubmissions.mockResolvedValue([submission({ status: "PENDING" })]);
    renderTab({ canVerify: true });
    expect(await screen.findByRole("button", { name: "Verify" })).toBeInTheDocument();
  });

  it("never renders match/verify/reject controls when canVerify is false", async () => {
    apiMock.listPaymentSubmissions.mockResolvedValue([submission({ status: "PENDING" })]);
    renderTab({ canVerify: false });
    await screen.findByText(/\$50\.00/);
    expect(screen.queryByRole("button", { name: "Verify" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
  });

  it("never renders controls for an already-VERIFIED or REJECTED submission, even when canVerify is true", async () => {
    apiMock.listPaymentSubmissions.mockResolvedValue([
      submission({ id: "s1", status: "VERIFIED" }),
      submission({ id: "s2", status: "REJECTED" }),
    ]);
    renderTab({ canVerify: true });
    await screen.findAllByText(/\$50\.00/);
    expect(screen.queryByRole("button", { name: "Verify" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
  });
});

describe("ZaadReviewTab — real data rendering", () => {
  it("shows the student's name, amount, provider, reference, and phone when present", async () => {
    apiMock.listPaymentSubmissions.mockResolvedValue([
      submission({ provider: "ZAAD", providerTransactionReference: "TX-123", payerPhone: "+252611111111" }),
    ]);
    renderTab();
    expect(await screen.findByText(/Amina Yusuf · \$50\.00/)).toBeInTheDocument();
    expect(screen.getByText(/ZAAD · Ref: TX-123/)).toBeInTheDocument();
    expect(screen.getByText(/\+252611111111/)).toBeInTheDocument();
  });

  it("falls back to 'Student' when the submission has no linked student record", async () => {
    apiMock.listPaymentSubmissions.mockResolvedValue([submission({ student: undefined })]);
    renderTab();
    expect(await screen.findByText(/Student · \$50\.00/)).toBeInTheDocument();
  });

  it("omits the reference and phone segments when they are null", async () => {
    apiMock.listPaymentSubmissions.mockResolvedValue([submission({ providerTransactionReference: null, payerPhone: null })]);
    renderTab();
    await screen.findByText(/Amina Yusuf/);
    expect(screen.queryByText(/Ref:/)).not.toBeInTheDocument();
  });

  it("shows the rejection reason only on a rejected submission that has one", async () => {
    apiMock.listPaymentSubmissions.mockResolvedValue([
      submission({ status: "REJECTED", rejectionReason: "Transaction not found" }),
    ]);
    renderTab();
    expect(await screen.findByText("Rejected: Transaction not found")).toBeInTheDocument();
  });

  it("shows the status badge text for each state", async () => {
    apiMock.listPaymentSubmissions.mockResolvedValue([submission({ status: "VERIFIED" })]);
    renderTab();
    expect(await screen.findByText("VERIFIED")).toBeInTheDocument();
  });
});

describe("ZaadReviewTab — match dropdown is scoped to the submission's own student", () => {
  it("only offers invoice/charge targets belonging to the same studentId as the submission", async () => {
    apiMock.listPaymentSubmissions.mockResolvedValue([submission({ studentId: "student-1" })]);
    renderTab({
      invoices: [invoice({ id: "inv-1", studentId: "student-1", feeStructure: { id: "f1", name: "Tuition" } })],
      charges: [charge({ id: "chg-1", studentId: "student-2", feeStructure: { id: "f2", name: "Bus Fee" } })],
    });

    const select = await screen.findByRole("combobox");
    const options = within(select).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Match to invoice/charge…", "Tuition — Invoice, $100"]);
  });

  it("offers nothing but the placeholder when the student has no invoices or charges at all", async () => {
    apiMock.listPaymentSubmissions.mockResolvedValue([submission({ studentId: "student-9" })]);
    renderTab({ invoices: [invoice({ studentId: "student-1" })], charges: [] });

    const select = await screen.findByRole("combobox");
    expect(within(select).getAllByRole("option")).toHaveLength(1);
  });
});

describe("ZaadReviewTab — verify (mutation)", () => {
  it("shows a danger toast and never calls the API when no target is selected", async () => {
    const user = userEvent.setup();
    apiMock.listPaymentSubmissions.mockResolvedValue([submission()]);
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Verify" }));

    expect(await screen.findByText("Select which invoice or charge this ZAAD payment is for")).toBeInTheDocument();
    expect(apiMock.verifyPaymentSubmission).not.toHaveBeenCalled();
  });

  it("sends invoiceId (not chargeId) when the selected target is an invoice", async () => {
    const user = userEvent.setup();
    apiMock.listPaymentSubmissions.mockResolvedValue([submission()]);
    apiMock.verifyPaymentSubmission.mockResolvedValue(submission({ status: "VERIFIED" }));
    renderTab();
    await user.selectOptions(await screen.findByRole("combobox"), "invoice:inv-1");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() =>
      expect(apiMock.verifyPaymentSubmission).toHaveBeenCalledWith("token-1", "school-1", "sub-1", {
        invoiceId: "inv-1",
        chargeId: undefined,
      }),
    );
  });

  it("sends chargeId (not invoiceId) when the selected target is a charge", async () => {
    const user = userEvent.setup();
    apiMock.listPaymentSubmissions.mockResolvedValue([submission()]);
    apiMock.verifyPaymentSubmission.mockResolvedValue(submission({ status: "VERIFIED" }));
    renderTab();
    await user.selectOptions(await screen.findByRole("combobox"), "charge:chg-1");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() =>
      expect(apiMock.verifyPaymentSubmission).toHaveBeenCalledWith("token-1", "school-1", "sub-1", {
        invoiceId: undefined,
        chargeId: "chg-1",
      }),
    );
  });

  it("shows a success toast and reloads the list after a successful verify", async () => {
    const user = userEvent.setup();
    apiMock.listPaymentSubmissions.mockResolvedValueOnce([submission()]).mockResolvedValueOnce([submission({ status: "VERIFIED" })]);
    apiMock.verifyPaymentSubmission.mockResolvedValue(submission({ status: "VERIFIED" }));
    renderTab();
    await user.selectOptions(await screen.findByRole("combobox"), "invoice:inv-1");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByText("Payment verified and posted to the ledger.")).toBeInTheDocument();
    await waitFor(() => expect(apiMock.listPaymentSubmissions).toHaveBeenCalledTimes(2));
  });

  it("shows the ApiError's message in a danger toast when verify fails", async () => {
    const user = userEvent.setup();
    apiMock.listPaymentSubmissions.mockResolvedValue([submission()]);
    apiMock.verifyPaymentSubmission.mockRejectedValue(new ApiError("Submission amount exceeds the remaining balance"));
    renderTab();
    await user.selectOptions(await screen.findByRole("combobox"), "invoice:inv-1");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByText("Submission amount exceeds the remaining balance")).toBeInTheDocument();
  });

  it("shows a generic fallback message for a non-ApiError verify failure", async () => {
    const user = userEvent.setup();
    apiMock.listPaymentSubmissions.mockResolvedValue([submission()]);
    apiMock.verifyPaymentSubmission.mockRejectedValue(new Error("network down"));
    renderTab();
    await user.selectOptions(await screen.findByRole("combobox"), "invoice:inv-1");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByText("Failed to verify payment")).toBeInTheDocument();
  });
});

describe("ZaadReviewTab — reject flow", () => {
  it("opens the reason dialog with the submission's own amount in the title", async () => {
    const user = userEvent.setup();
    apiMock.listPaymentSubmissions.mockResolvedValue([submission({ amount: "75.00" })]);
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Reject" }));

    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Reject this $75.00 ZAAD payment?");
  });

  it("disables the confirm button until a reason is typed", async () => {
    const user = userEvent.setup();
    apiMock.listPaymentSubmissions.mockResolvedValue([submission()]);
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Reject" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByRole("button", { name: "Reject" })).toBeDisabled();
  });

  it("cancel closes the dialog without calling the API", async () => {
    const user = userEvent.setup();
    apiMock.listPaymentSubmissions.mockResolvedValue([submission()]);
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Reject" }));
    const dialog = await screen.findByRole("alertdialog");

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(apiMock.rejectPaymentSubmission).not.toHaveBeenCalled();
  });

  it("confirms with the trimmed reason, shows a success toast, reloads, and closes the dialog", async () => {
    const user = userEvent.setup();
    apiMock.listPaymentSubmissions.mockResolvedValueOnce([submission()]).mockResolvedValueOnce([submission({ status: "REJECTED" })]);
    apiMock.rejectPaymentSubmission.mockResolvedValue(submission({ status: "REJECTED" }));
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Reject" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.type(within(dialog).getByRole("textbox"), "  Not found  ");

    await user.click(within(dialog).getByRole("button", { name: "Reject" }));

    await waitFor(() => expect(apiMock.rejectPaymentSubmission).toHaveBeenCalledWith("token-1", "school-1", "sub-1", "Not found"));
    expect(await screen.findByText("Payment submission rejected.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("keeps the dialog open and shows a danger toast when rejection fails", async () => {
    const user = userEvent.setup();
    apiMock.listPaymentSubmissions.mockResolvedValue([submission()]);
    apiMock.rejectPaymentSubmission.mockRejectedValue(new ApiError("This submission has already been decided"));
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Reject" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.type(within(dialog).getByRole("textbox"), "Not found");

    await user.click(within(dialog).getByRole("button", { name: "Reject" }));

    expect(await screen.findByText("This submission has already been decided")).toBeInTheDocument();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});
