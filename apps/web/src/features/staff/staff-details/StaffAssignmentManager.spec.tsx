import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Department, Staff, StaffAssignmentRecord } from "@/lib/api";
import { StaffAssignmentManager } from "./StaffAssignmentManager";

const apiMock = vi.hoisted(() => ({ listDepartments: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock }));

const staffApiMock = vi.hoisted(() => ({ assignToSchool: vi.fn(), deactivateAssignment: vi.fn(), getOne: vi.fn() }));
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

const DEPARTMENT: Department = { id: "dept-1", schoolId: "school-a", name: "Library", status: "ACTIVE", createdAt: "2027-01-01", updatedAt: "2027-01-01" };

function assignment(overrides: Partial<StaffAssignmentRecord> = {}): StaffAssignmentRecord {
  return {
    id: "assign-1",
    staffId: "staff-1",
    schoolId: "school-a",
    school: { id: "school-a", name: "Ilays Primary School", type: "PRIMARY" },
    departmentId: "dept-1",
    department: { id: "dept-1", name: "Library", status: "ACTIVE" },
    role: "Librarian",
    status: "ACTIVE",
    ...overrides,
  };
}

function staff(overrides: Partial<Staff> = {}): Staff {
  return {
    id: "staff-1",
    userId: null,
    schoolId: "school-a",
    departmentId: null,
    department: null,
    staffCode: "STF-00001",
    staffNumber: "STF-0001",
    firstName: "Amal",
    lastName: "Nur",
    sex: null,
    dateOfBirth: null,
    phone: null,
    email: null,
    address: null,
    jobTitle: null,
    employmentDate: null,
    status: "ACTIVE",
    emergencyContactName: null,
    emergencyContactPhone: null,
    assignments: [],
    ...overrides,
  };
}

function renderManager(overrides: Partial<React.ComponentProps<typeof StaffAssignmentManager>> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <StaffAssignmentManager accessToken="token-1" schoolId="school-a" staff={staff()} canManage onChange={onChange} {...overrides} />,
  );
  return { onChange, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.listDepartments.mockResolvedValue([DEPARTMENT]);
});

describe("StaffAssignmentManager — display", () => {
  it("shows the explicit assignment's department, role, and status when one exists for this school", () => {
    renderManager({ staff: staff({ assignments: [assignment()] }) });
    expect(screen.getByText("Library")).toBeInTheDocument();
    expect(screen.getByText("Librarian")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("falls back to the home-school department/jobTitle when no explicit assignment row exists yet", () => {
    renderManager({
      staff: staff({ schoolId: "school-a", department: { id: "dept-2", name: "Finance", status: "ACTIVE" }, jobTitle: "Accountant", assignments: [] }),
    });
    expect(screen.getByText("Finance")).toBeInTheDocument();
    expect(screen.getByText("Accountant")).toBeInTheDocument();
  });

  it("shows a dash for department/role when neither an assignment nor home-school fallback applies", () => {
    renderManager({ staff: staff({ schoolId: "school-a", department: null, jobTitle: null, assignments: [] }) });
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it("does not show a Deactivate/Reactivate button until an explicit assignment row exists", () => {
    renderManager({ staff: staff({ schoolId: "school-a", assignments: [] }) });
    expect(screen.queryByRole("button", { name: /Deactivate here|Reactivate here/ })).not.toBeInTheDocument();
  });

  it("shows 'Deactivate here' for an active explicit assignment, and 'Reactivate here' for an inactive one", () => {
    const { rerender } = render(
      <StaffAssignmentManager accessToken="token-1" schoolId="school-a" staff={staff({ assignments: [assignment({ status: "ACTIVE" })] })} canManage onChange={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Deactivate here" })).toBeInTheDocument();

    rerender(
      <StaffAssignmentManager accessToken="token-1" schoolId="school-a" staff={staff({ assignments: [assignment({ status: "INACTIVE" })] })} canManage onChange={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Reactivate here" })).toBeInTheDocument();
  });
});

describe("StaffAssignmentManager — editing", () => {
  it("pre-fills the edit form with the explicit assignment's own department/role", async () => {
    const user = userEvent.setup();
    renderManager({ staff: staff({ assignments: [assignment()] }) });
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(apiMock.listDepartments).toHaveBeenCalledWith("token-1", "school-a");
    expect(screen.getByDisplayValue("Librarian")).toBeInTheDocument();
  });

  it("saves via assignToSchool, reloads the staff member, and reports the change", async () => {
    const user = userEvent.setup();
    const updatedStaff = staff({ assignments: [assignment({ role: "Head Librarian" })] });
    staffApiMock.assignToSchool.mockResolvedValue({});
    staffApiMock.getOne.mockResolvedValue(updatedStaff);
    const { onChange } = renderManager({ staff: staff({ assignments: [assignment()] }) });

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const roleInput = screen.getByDisplayValue("Librarian");
    await user.clear(roleInput);
    await user.type(roleInput, "Head Librarian");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(staffApiMock.assignToSchool).toHaveBeenCalledWith("token-1", "school-a", "staff-1", {
      departmentId: "dept-1",
      role: "Head Librarian",
    });
    expect(staffApiMock.getOne).toHaveBeenCalledWith("token-1", "school-a", "staff-1");
    expect(onChange).toHaveBeenCalledWith(updatedStaff);
  });

  it("shows an error and does not call onChange when saving fails", async () => {
    const user = userEvent.setup();
    staffApiMock.assignToSchool.mockRejectedValue(new ApiError("Something went wrong"));
    const { onChange } = renderManager({ staff: staff({ assignments: [assignment()] }) });

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("cancels back to the read-only view without saving", async () => {
    const user = userEvent.setup();
    renderManager({ staff: staff({ assignments: [assignment()] }) });
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByDisplayValue("Librarian")).not.toBeInTheDocument();
    expect(staffApiMock.assignToSchool).not.toHaveBeenCalled();
  });
});

describe("StaffAssignmentManager — deactivating/reactivating at this school", () => {
  it("deactivates via deactivateAssignment with this school's assignment id, and never affects other schools", async () => {
    const user = userEvent.setup();
    const updatedStaff = staff({ assignments: [assignment({ status: "INACTIVE" })] });
    staffApiMock.deactivateAssignment.mockResolvedValue({});
    staffApiMock.getOne.mockResolvedValue(updatedStaff);
    const { onChange } = renderManager({ staff: staff({ assignments: [assignment({ status: "ACTIVE" })] }) });

    await user.click(screen.getByRole("button", { name: "Deactivate here" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("only affects their assignment at this school");
    await user.click(within(dialog).getByRole("button", { name: "Deactivate here" }));

    expect(staffApiMock.deactivateAssignment).toHaveBeenCalledWith("token-1", "school-a", "staff-1", "assign-1");
    expect(onChange).toHaveBeenCalledWith(updatedStaff);
  });

  it("reactivates via assignToSchool (not deactivateAssignment), preserving the existing department/role", async () => {
    const user = userEvent.setup();
    staffApiMock.assignToSchool.mockResolvedValue({});
    staffApiMock.getOne.mockResolvedValue(staff({ assignments: [assignment({ status: "ACTIVE" })] }));
    renderManager({ staff: staff({ assignments: [assignment({ status: "INACTIVE", departmentId: "dept-1", role: "Librarian" })] }) });

    await user.click(screen.getByRole("button", { name: "Reactivate here" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Reactivate here" }));

    expect(staffApiMock.assignToSchool).toHaveBeenCalledWith("token-1", "school-a", "staff-1", {
      departmentId: "dept-1",
      role: "Librarian",
    });
    expect(staffApiMock.deactivateAssignment).not.toHaveBeenCalled();
  });

  it("can cancel out of the confirm dialog without changing anything", async () => {
    const user = userEvent.setup();
    renderManager({ staff: staff({ assignments: [assignment({ status: "ACTIVE" })] }) });
    await user.click(screen.getByRole("button", { name: "Deactivate here" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(staffApiMock.deactivateAssignment).not.toHaveBeenCalled();
  });
});
