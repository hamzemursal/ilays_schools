import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@/components/ui/Toast";
import type { Expense, ExpenseCategory } from "@/lib/api";
import { ExpensesTab } from "./ExpensesTab";

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
  listExpenses: vi.fn(),
  listExpenseCategories: vi.fn(),
  createExpenseCategory: vi.fn(),
  createExpense: vi.fn(),
  approveExpense: vi.fn(),
  rejectExpense: vi.fn(),
  markExpensePaid: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "exp-1",
    schoolId: "school-1",
    expenseCategoryId: "cat-1",
    expenseCategory: { id: "cat-1", name: "Maintenance" },
    description: "Plumbing repair",
    amount: "80.00",
    expenseDate: "2028-01-05",
    status: "PENDING",
    recordedByUserId: "user-1",
    approvedByUserId: null,
    approvedAt: null,
    createdAt: "2028-01-05T00:00:00Z",
    ...overrides,
  };
}

function category(overrides: Partial<ExpenseCategory> = {}): ExpenseCategory {
  return { id: "cat-1", schoolId: "school-1", name: "Maintenance", ...overrides };
}

function renderTab(overrides: Partial<React.ComponentProps<typeof ExpensesTab>> = {}) {
  return render(
    <ToastProvider>
      <ExpensesTab accessToken="token-1" schoolId="school-1" canCreate={true} canApprove={true} {...overrides} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.listExpenseCategories.mockResolvedValue([category()]);
});

describe("ExpensesTab — loading/error/empty states", () => {
  it("shows a loading indicator before expenses resolve", async () => {
    let resolve!: (v: Expense[]) => void;
    apiMock.listExpenses.mockReturnValue(new Promise((r) => (resolve = r)));
    renderTab();

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    resolve([]);
    await waitFor(() => expect(screen.getByText("No expenses recorded yet")).toBeInTheDocument());
  });

  it("shows the ApiError's own message when loading fails", async () => {
    apiMock.listExpenses.mockRejectedValue(new ApiError("School not found"));
    renderTab();
    expect(await screen.findByText("School not found")).toBeInTheDocument();
  });

  it("shows a generic fallback message for a non-ApiError load failure", async () => {
    apiMock.listExpenses.mockRejectedValue(new Error("network down"));
    renderTab();
    expect(await screen.findByText("Failed to load expenses")).toBeInTheDocument();
  });

  it("shows an EmptyState when there are no expenses yet", async () => {
    apiMock.listExpenses.mockResolvedValue([]);
    renderTab();
    expect(await screen.findByText("No expenses recorded yet")).toBeInTheDocument();
  });

  it("never crashes the page when the categories fetch itself fails — just falls back to an empty category list", async () => {
    apiMock.listExpenses.mockResolvedValue([]);
    apiMock.listExpenseCategories.mockRejectedValue(new Error("boom"));
    renderTab();
    expect(await screen.findByText("No expenses recorded yet")).toBeInTheDocument();
  });
});

describe("ExpensesTab — school isolation", () => {
  it("loads expenses and categories scoped to exactly the given schoolId", async () => {
    apiMock.listExpenses.mockResolvedValue([]);
    renderTab({ schoolId: "school-42" });
    await waitFor(() => expect(apiMock.listExpenses).toHaveBeenCalledWith("token-1", "school-42"));
    expect(apiMock.listExpenseCategories).toHaveBeenCalledWith("token-1", "school-42");
  });

  it("approves/rejects/marks-paid scoped to the same schoolId", async () => {
    const user = userEvent.setup();
    apiMock.listExpenses.mockResolvedValue([expense({ status: "APPROVED" })]);
    apiMock.markExpensePaid.mockResolvedValue(expense({ status: "PAID" }));
    renderTab({ schoolId: "school-42" });
    await user.click(await screen.findByRole("button", { name: "Mark paid" }));
    await waitFor(() => expect(apiMock.markExpensePaid).toHaveBeenCalledWith("token-1", "school-42", "exp-1"));
  });
});

describe("ExpensesTab — RBAC", () => {
  it("hides the 'Record expense' form entirely when canCreate is false", async () => {
    apiMock.listExpenses.mockResolvedValue([]);
    renderTab({ canCreate: false });
    await screen.findByText("No expenses recorded yet");
    expect(screen.queryByText("Record expense")).not.toBeInTheDocument();
  });

  it("shows Approve/Reject on a PENDING expense only when canApprove is true", async () => {
    apiMock.listExpenses.mockResolvedValue([expense({ status: "PENDING" })]);
    renderTab({ canApprove: true });
    expect(await screen.findByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
  });

  it("never renders Approve/Reject/Mark paid when canApprove is false", async () => {
    apiMock.listExpenses.mockResolvedValue([expense({ status: "PENDING" }), expense({ id: "exp-2", status: "APPROVED" })]);
    renderTab({ canApprove: false });
    await screen.findAllByText("Plumbing repair");
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark paid" })).not.toBeInTheDocument();
  });

  it("shows 'Mark paid' on an APPROVED expense, never Approve/Reject", async () => {
    apiMock.listExpenses.mockResolvedValue([expense({ status: "APPROVED" })]);
    renderTab({ canApprove: true });
    expect(await screen.findByRole("button", { name: "Mark paid" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });

  it("shows no action buttons at all for a REJECTED or PAID expense, even when canApprove is true", async () => {
    apiMock.listExpenses.mockResolvedValue([expense({ id: "e1", status: "REJECTED" }), expense({ id: "e2", status: "PAID" })]);
    renderTab({ canApprove: true });
    await screen.findAllByText("Plumbing repair");
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark paid" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
  });
});

describe("ExpensesTab — real data rendering", () => {
  it("renders description, category, amount, and formatted date", async () => {
    apiMock.listExpenses.mockResolvedValue([expense({ description: "Plumbing repair", amount: "80.00", expenseDate: "2028-01-05" })]);
    renderTab();
    expect(await screen.findByText("Plumbing repair")).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Maintenance · \\$80\\.00 · ${new Date("2028-01-05").toLocaleDateString()}`))).toBeInTheDocument();
  });

  it("falls back to 'Uncategorized' when the expense has no category", async () => {
    apiMock.listExpenses.mockResolvedValue([expense({ expenseCategory: null })]);
    renderTab();
    expect(await screen.findByText(/Uncategorized/)).toBeInTheDocument();
  });

  it("shows the status badge text", async () => {
    apiMock.listExpenses.mockResolvedValue([expense({ status: "PAID" })]);
    renderTab();
    expect(await screen.findByText("PAID")).toBeInTheDocument();
  });
});

describe("ExpensesTab — approve/reject/mark-paid (mutations)", () => {
  it("approves and shows a success toast, then reloads the list", async () => {
    const user = userEvent.setup();
    apiMock.listExpenses.mockResolvedValueOnce([expense({ status: "PENDING" })]).mockResolvedValueOnce([expense({ status: "APPROVED" })]);
    apiMock.approveExpense.mockResolvedValue(expense({ status: "APPROVED" }));
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Approve" }));

    expect(await screen.findByText("Expense approved.")).toBeInTheDocument();
    await waitFor(() => expect(apiMock.listExpenses).toHaveBeenCalledTimes(2));
  });

  it("shows a danger toast with the ApiError message when approve fails", async () => {
    const user = userEvent.setup();
    apiMock.listExpenses.mockResolvedValue([expense({ status: "PENDING" })]);
    apiMock.approveExpense.mockRejectedValue(new ApiError("Expense already decided"));
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Approve" }));
    expect(await screen.findByText("Expense already decided")).toBeInTheDocument();
  });

  it("opens the reject dialog with the expense's own description in the title", async () => {
    const user = userEvent.setup();
    apiMock.listExpenses.mockResolvedValue([expense({ description: "Plumbing repair", status: "PENDING" })]);
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Reject" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent('Reject "Plumbing repair"?');
  });

  it("confirming reject with a reason shows a success toast, reloads, and closes the dialog", async () => {
    const user = userEvent.setup();
    apiMock.listExpenses.mockResolvedValueOnce([expense({ status: "PENDING" })]).mockResolvedValueOnce([expense({ status: "REJECTED" })]);
    apiMock.rejectExpense.mockResolvedValue(expense({ status: "REJECTED" }));
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Reject" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.type(within(dialog).getByRole("textbox"), "Not a school expense");
    await user.click(within(dialog).getByRole("button", { name: "Reject" }));

    await waitFor(() => expect(apiMock.rejectExpense).toHaveBeenCalledWith("token-1", "school-1", "exp-1", "Not a school expense"));
    expect(await screen.findByText("Expense rejected.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("keeps the reject dialog open and shows a danger toast when rejection fails", async () => {
    const user = userEvent.setup();
    apiMock.listExpenses.mockResolvedValue([expense({ status: "PENDING" })]);
    apiMock.rejectExpense.mockRejectedValue(new ApiError("Expense already decided"));
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Reject" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.type(within(dialog).getByRole("textbox"), "Reason");
    await user.click(within(dialog).getByRole("button", { name: "Reject" }));

    expect(await screen.findByText("Expense already decided")).toBeInTheDocument();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("marks paid and shows a success toast, then reloads the list", async () => {
    const user = userEvent.setup();
    apiMock.listExpenses.mockResolvedValueOnce([expense({ status: "APPROVED" })]).mockResolvedValueOnce([expense({ status: "PAID" })]);
    apiMock.markExpensePaid.mockResolvedValue(expense({ status: "PAID" }));
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Mark paid" }));

    expect(await screen.findByText("Expense marked as paid.")).toBeInTheDocument();
    await waitFor(() => expect(apiMock.listExpenses).toHaveBeenCalledTimes(2));
  });

  it("shows a danger toast when marking paid fails", async () => {
    const user = userEvent.setup();
    apiMock.listExpenses.mockResolvedValue([expense({ status: "APPROVED" })]);
    apiMock.markExpensePaid.mockRejectedValue(new Error("network down"));
    renderTab();
    await user.click(await screen.findByRole("button", { name: "Mark paid" }));
    expect(await screen.findByText("Failed to mark expense paid")).toBeInTheDocument();
  });
});

describe("ExpensesTab — record expense (mutation)", () => {
  it("submits description, amount (as a number), expenseDate, and the selected category", async () => {
    const user = userEvent.setup();
    apiMock.listExpenses.mockResolvedValue([]);
    apiMock.createExpense.mockResolvedValue(expense());
    const { container } = renderTab();
    await screen.findByRole("heading", { name: "Record expense" });
    await user.selectOptions(screen.getAllByRole("combobox")[0], "cat-1");
    // Description is the required text input, distinct from the "New category" one.
    const inputs = container.querySelectorAll("input[type='text'], input:not([type])");
    const descriptionInput = Array.from(inputs).find((el) => (el as HTMLInputElement).required) as HTMLInputElement;
    await user.type(descriptionInput, "Plumbing repair");
    await user.type(screen.getByRole("spinbutton"), "80");

    await user.click(screen.getByRole("button", { name: "Record expense" }));

    await waitFor(() =>
      expect(apiMock.createExpense).toHaveBeenCalledWith(
        "token-1",
        "school-1",
        expect.objectContaining({ expenseCategoryId: "cat-1", description: "Plumbing repair", amount: 80 }),
      ),
    );
  });

  it("submits expenseCategoryId as undefined (never an empty string) when left Uncategorized", async () => {
    const user = userEvent.setup();
    apiMock.listExpenses.mockResolvedValue([]);
    apiMock.createExpense.mockResolvedValue(expense());
    const { container } = renderTab();
    await screen.findByRole("heading", { name: "Record expense" });
    const inputs = container.querySelectorAll("input[type='text'], input:not([type])");
    const descriptionInput = Array.from(inputs).find((el) => (el as HTMLInputElement).required) as HTMLInputElement;
    await user.type(descriptionInput, "Misc");
    await user.type(screen.getByRole("spinbutton"), "10");

    await user.click(screen.getByRole("button", { name: "Record expense" }));

    await waitFor(() =>
      expect(apiMock.createExpense).toHaveBeenCalledWith(
        "token-1",
        "school-1",
        expect.objectContaining({ expenseCategoryId: undefined }),
      ),
    );
  });

  it("clears description/amount and shows a success toast after recording", async () => {
    const user = userEvent.setup();
    apiMock.listExpenses.mockResolvedValue([]);
    apiMock.createExpense.mockResolvedValue(expense());
    const { container } = renderTab();
    await screen.findByRole("heading", { name: "Record expense" });
    const inputs = container.querySelectorAll("input[type='text'], input:not([type])");
    const descriptionInput = Array.from(inputs).find((el) => (el as HTMLInputElement).required) as HTMLInputElement;
    const amountInput = screen.getByRole("spinbutton") as HTMLInputElement;
    await user.type(descriptionInput, "Plumbing repair");
    await user.type(amountInput, "80");

    await user.click(screen.getByRole("button", { name: "Record expense" }));

    expect(await screen.findByText("Expense recorded — pending approval.")).toBeInTheDocument();
    await waitFor(() => expect(descriptionInput.value).toBe(""));
    expect(amountInput.value).toBe("");
  });

  it("shows the ApiError's message inline when recording fails", async () => {
    const user = userEvent.setup();
    apiMock.listExpenses.mockResolvedValue([]);
    apiMock.createExpense.mockRejectedValue(new ApiError("Amount must be positive"));
    const { container } = renderTab();
    await screen.findByRole("heading", { name: "Record expense" });
    const inputs = container.querySelectorAll("input[type='text'], input:not([type])");
    const descriptionInput = Array.from(inputs).find((el) => (el as HTMLInputElement).required) as HTMLInputElement;
    await user.type(descriptionInput, "Plumbing repair");
    await user.type(screen.getByRole("spinbutton"), "80");

    await user.click(screen.getByRole("button", { name: "Record expense" }));

    expect(await screen.findByText("Amount must be positive")).toBeInTheDocument();
  });
});

describe("ExpensesTab — inline category creation", () => {
  it("creates the category, adds it to the dropdown, and auto-selects it", async () => {
    const user = userEvent.setup();
    apiMock.listExpenses.mockResolvedValue([]);
    apiMock.createExpenseCategory.mockResolvedValue(category({ id: "cat-9", name: "Transport" }));
    renderTab();
    await screen.findByRole("heading", { name: "Record expense" });
    await user.type(screen.getByPlaceholderText("e.g. Maintenance"), "Transport");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(apiMock.createExpenseCategory).toHaveBeenCalledWith("token-1", "school-1", "Transport"));
    const categorySelect = screen.getAllByRole("combobox")[0] as HTMLSelectElement;
    await waitFor(() => expect(categorySelect.value).toBe("cat-9"));
    expect(within(categorySelect).getByRole("option", { name: "Transport" })).toBeInTheDocument();
  });

  it("clears the new-category input after adding", async () => {
    const user = userEvent.setup();
    apiMock.listExpenses.mockResolvedValue([]);
    apiMock.createExpenseCategory.mockResolvedValue(category({ id: "cat-9", name: "Transport" }));
    renderTab();
    await screen.findByRole("heading", { name: "Record expense" });
    const newCategoryInput = screen.getByPlaceholderText("e.g. Maintenance") as HTMLInputElement;
    await user.type(newCategoryInput, "Transport");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(newCategoryInput.value).toBe(""));
  });

  it("does nothing when clicking Add with a blank/whitespace-only name", async () => {
    const user = userEvent.setup();
    apiMock.listExpenses.mockResolvedValue([]);
    renderTab();
    await screen.findByRole("heading", { name: "Record expense" });
    await user.type(screen.getByPlaceholderText("e.g. Maintenance"), "   ");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(apiMock.createExpenseCategory).not.toHaveBeenCalled();
  });

  it("shows a danger toast when adding a category fails", async () => {
    const user = userEvent.setup();
    apiMock.listExpenses.mockResolvedValue([]);
    apiMock.createExpenseCategory.mockRejectedValue(new ApiError("A category with this name already exists"));
    renderTab();
    await screen.findByRole("heading", { name: "Record expense" });
    await user.type(screen.getByPlaceholderText("e.g. Maintenance"), "Maintenance");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("A category with this name already exists")).toBeInTheDocument();
  });
});
