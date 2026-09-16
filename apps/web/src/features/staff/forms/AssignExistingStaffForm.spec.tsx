import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Department, StaffSearchResult } from "@/lib/api";
import { AssignExistingStaffForm } from "./AssignExistingStaffForm";

const apiMock = vi.hoisted(() => ({ listDepartments: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock }));

const staffApiMock = vi.hoisted(() => ({ search: vi.fn(), assignToSchool: vi.fn() }));
vi.mock("../api", () => ({ staffApi: staffApiMock }));

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

function searchResult(overrides: Partial<StaffSearchResult> = {}): StaffSearchResult {
  return {
    id: "staff-1",
    firstName: "Amal",
    lastName: "Nur",
    staffNumber: "STF-0042",
    staffCode: "STF-00042",
    email: "amal@example.com",
    phone: null,
    school: { id: "school-a", name: "Ilays Primary School", type: "PRIMARY" },
    ...overrides,
  };
}

const DEPARTMENT: Department = { id: "dept-1", schoolId: "school-b", name: "Library", status: "ACTIVE", createdAt: "2027-01-01", updatedAt: "2027-01-01" };

function renderForm(overrides: Partial<React.ComponentProps<typeof AssignExistingStaffForm>> = {}) {
  const onAssigned = vi.fn();
  const onCancel = vi.fn();
  const utils = render(
    <AssignExistingStaffForm accessToken="token-1" schoolId="school-b" onAssigned={onAssigned} onCancel={onCancel} {...overrides} />,
  );
  return { onAssigned, onCancel, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.listDepartments.mockResolvedValue([DEPARTMENT]);
});

describe("AssignExistingStaffForm — search across the org", () => {
  it("shows the search box, not the assignment picker, by default", () => {
    renderForm();
    expect(screen.getByPlaceholderText("Search by name, staff number, or email…")).toBeInTheDocument();
  });

  it("does not search until at least 2 characters are typed (debounced)", async () => {
    vi.useFakeTimers();
    renderForm();
    fireEvent.change(screen.getByPlaceholderText("Search by name, staff number, or email…"), { target: { value: "A" } });
    await vi.advanceTimersByTimeAsync(500);
    expect(staffApiMock.search).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("searches org-wide and shows a result with their home school and permanent Staff ID", async () => {
    vi.useFakeTimers();
    staffApiMock.search.mockResolvedValue([searchResult()]);
    renderForm();
    fireEvent.change(screen.getByPlaceholderText("Search by name, staff number, or email…"), { target: { value: "Amal" } });
    await vi.advanceTimersByTimeAsync(500);
    vi.useRealTimers();

    expect(staffApiMock.search).toHaveBeenCalledWith("token-1", "school-b", "Amal");
    expect(await screen.findByText("Amal Nur")).toBeInTheDocument();
    expect(screen.getByText("STF-00042")).toBeInTheDocument();
    expect(screen.getByText(/Ilays Primary School/)).toBeInTheDocument();
  });

  it("shows a 'no match' message pointing at Add staff member when nothing is found", async () => {
    vi.useFakeTimers();
    staffApiMock.search.mockResolvedValue([]);
    renderForm();
    fireEvent.change(screen.getByPlaceholderText("Search by name, staff number, or email…"), { target: { value: "Nobody" } });
    await vi.advanceTimersByTimeAsync(500);
    vi.useRealTimers();

    expect(await screen.findByText("No matching staff member found in this organization.")).toBeInTheDocument();
  });

  it("calls onCancel from the search step", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderForm();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe("AssignExistingStaffForm — assigning a selected staff member", () => {
  async function selectStaff() {
    vi.useFakeTimers();
    staffApiMock.search.mockResolvedValue([searchResult()]);
    const utils = renderForm();
    fireEvent.change(screen.getByPlaceholderText("Search by name, staff number, or email…"), { target: { value: "Amal" } });
    await vi.advanceTimersByTimeAsync(500);
    vi.useRealTimers();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Select" }));
    return { user, ...utils };
  }

  it("shows the picked staff member and their home school before assigning", async () => {
    await selectStaff();
    expect(screen.getByText("Assign Amal Nur to this school")).toBeInTheDocument();
    expect(screen.getByText(/home school: Ilays Primary School/)).toBeInTheDocument();
  });

  it("assigns with the chosen department/role, scoped to the target school, and reports the new staff member", async () => {
    const { user, onAssigned } = await selectStaff();
    staffApiMock.assignToSchool.mockResolvedValue({});

    await user.selectOptions(screen.getByRole("combobox"), "dept-1");
    await user.type(screen.getByPlaceholderText("e.g. Librarian"), "Head Librarian");
    await user.click(screen.getByRole("button", { name: "Assign to this school" }));

    expect(staffApiMock.assignToSchool).toHaveBeenCalledWith("token-1", "school-b", "staff-1", {
      departmentId: "dept-1",
      role: "Head Librarian",
    });
    expect(onAssigned).toHaveBeenCalledWith("staff-1");
  });

  it("fetches this school's own departments, not the candidate's home school's", async () => {
    await selectStaff();
    expect(apiMock.listDepartments).toHaveBeenCalledWith("token-1", "school-b");
  });

  it("returns to search without assigning when 'Back to search' is clicked", async () => {
    const { user } = await selectStaff();
    await user.click(screen.getByRole("button", { name: "Back to search" }));
    expect(screen.getByPlaceholderText("Search by name, staff number, or email…")).toBeInTheDocument();
    expect(staffApiMock.assignToSchool).not.toHaveBeenCalled();
  });

  it("shows an error and does not call onAssigned when the assignment call fails", async () => {
    const { user, onAssigned } = await selectStaff();
    staffApiMock.assignToSchool.mockRejectedValue(new ApiError("Something went wrong"));

    await user.click(screen.getByRole("button", { name: "Assign to this school" }));

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(onAssigned).not.toHaveBeenCalled();
  });
});
