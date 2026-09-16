import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Staff, StaffAssignmentRecord } from "@/lib/api";
import { StaffTable } from "./StaffTable";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

function assignment(overrides: Partial<StaffAssignmentRecord> & { id: string; schoolId: string }): StaffAssignmentRecord {
  return {
    staffId: "staff-1",
    school: { id: overrides.schoolId, name: "School", type: "PRIMARY" },
    departmentId: null,
    department: null,
    role: null,
    status: "ACTIVE",
    ...overrides,
  } as StaffAssignmentRecord;
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
    jobTitle: "Accountant",
    employmentDate: null,
    status: "ACTIVE",
    emergencyContactName: null,
    emergencyContactPhone: null,
    assignments: [],
    ...overrides,
  };
}

describe("StaffTable — Department/Role/Status columns are scoped to this school", () => {
  it("shows the home-school role/department for a staff member with no explicit assignment row yet", () => {
    render(
      <StaffTable
        schoolId="school-a"
        staff={[staff({ jobTitle: "Accountant", department: { id: "dept-1", name: "Finance", status: "ACTIVE" } })]}
      />,
    );

    expect(screen.getByText("Accountant")).toBeInTheDocument();
    expect(screen.getByText("Finance")).toBeInTheDocument();
  });

  it("shows THIS school's assignment role/department, not the home school's, for a cross-school-assigned staff member", () => {
    const crossSchoolStaff = staff({
      schoolId: "school-a",
      jobTitle: "Accountant",
      department: { id: "dept-1", name: "Finance", status: "ACTIVE" },
      assignments: [
        assignment({ id: "a1", schoolId: "school-b", role: "Librarian", department: { id: "dept-2", name: "Library", status: "ACTIVE" } }),
      ],
    });

    render(<StaffTable schoolId="school-b" staff={[crossSchoolStaff]} />);

    expect(screen.getByText("Librarian")).toBeInTheDocument();
    expect(screen.getByText("Library")).toBeInTheDocument();
    expect(screen.queryByText("Accountant")).not.toBeInTheDocument();
    expect(screen.queryByText("Finance")).not.toBeInTheDocument();
  });

  it("shows this school's own assignment status, not the person's home-school HR status", () => {
    const deactivatedHere = staff({
      schoolId: "school-a",
      status: "ACTIVE",
      assignments: [assignment({ id: "a1", schoolId: "school-b", status: "INACTIVE" })],
    });

    render(<StaffTable schoolId="school-b" staff={[deactivatedHere]} />);

    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("shows Active at the other school even when the person's home-school status is INACTIVE", () => {
    const activeElsewhere = staff({
      schoolId: "school-a",
      status: "INACTIVE",
      assignments: [assignment({ id: "a1", schoolId: "school-b", status: "ACTIVE" })],
    });

    render(<StaffTable schoolId="school-b" staff={[activeElsewhere]} />);

    expect(screen.getByText("Active")).toBeInTheDocument();
  });
});
