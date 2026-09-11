import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StudentListItem } from "@/lib/api";
import { ToastProvider } from "@/components/ui/Toast";
import { StudentsTable } from "./StudentsTable";

const pushMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

const apiMock = vi.hoisted(() => ({ getStudentPhotoUrl: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock }));

function student(overrides: Partial<StudentListItem> = {}): StudentListItem {
  return {
    enrollmentId: "enr-1",
    studentId: "stu-1",
    firstName: "Hodan",
    lastName: "Ali",
    studentNumber: "STU-2027-00001",
    rollNumber: 3,
    className: "Class 1",
    sectionName: "A",
    classId: "class-1",
    sectionId: "section-1",
    academicYearId: "year-1",
    sex: "FEMALE",
    status: "ACTIVE",
    guardianName: "Amina Ali",
    guardianPhone: "0611111111",
    ...overrides,
  };
}

function renderTable(overrides: Partial<React.ComponentProps<typeof StudentsTable>> = {}) {
  return render(
    <ToastProvider>
      <StudentsTable
        schoolId="school-1"
        accessToken="token-1"
        students={[student()]}
        attendanceRates={null}
        canTransfer={true}
        {...overrides}
      />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.getStudentPhotoUrl.mockResolvedValue({ url: null });
});

describe("StudentsTable — loading/empty states", () => {
  it("shows a skeleton while loading", () => {
    const { container } = renderTable({ students: null, loading: true });
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("shows an empty state when there are no students", () => {
    renderTable({ students: [] });
    expect(screen.getByText("No students enrolled yet")).toBeInTheDocument();
    expect(screen.getByText("Add your first student to get started.")).toBeInTheDocument();
  });
});

describe("StudentsTable — real data rendering", () => {
  it("renders a student's core fields", () => {
    renderTable();
    expect(screen.getByText("STU-2027-00001")).toBeInTheDocument();
    expect(screen.getByText("Hodan Ali")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Class 1")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it.each([
    ["ACTIVE", "Active"],
    ["COMPLETED", "Completed"],
    ["GRADUATED", "Graduated"],
    ["TRANSFERRED", "Transferred"],
    ["WITHDRAWN", "Withdrawn"],
    ["ARCHIVED", "Archived"],
  ] as const)("shows the %s status as %s", (status, label) => {
    renderTable({ students: [student({ status })] });
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("shows the student count in the toolbar", () => {
    renderTable({ students: [student(), student({ studentId: "stu-2", enrollmentId: "enr-2" })] });
    expect(screen.getByText("2 students")).toBeInTheDocument();
  });

  it("shows a singular count for exactly one student", () => {
    renderTable();
    expect(screen.getByText("1 student")).toBeInTheDocument();
  });
});

describe("StudentsTable — attendance column", () => {
  it("omits the attendance column entirely when attendanceRates is null", () => {
    renderTable({ attendanceRates: null });
    expect(screen.queryByText("Attendance")).not.toBeInTheDocument();
  });

  it("shows a dash when a student's rate is missing from the map", () => {
    renderTable({ attendanceRates: new Map() });
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it.each([
    [95, "success", "Excellent"],
    [80, "warning", "Good"],
    [50, "danger", "Needs Attention"],
  ] as const)("gives a %i%% rate the %s tone and %s label", (rate, tone, label) => {
    renderTable({ attendanceRates: new Map([["enr-1", rate]]) });
    expect(screen.getByText(`${rate}%`)).toBeInTheDocument();
    const badge = screen.getByText(label);
    expect(badge.className).toContain(tone);
  });
});

describe("StudentsTable — optional columns", () => {
  it("hides the Parent/Contact columns by default", () => {
    renderTable();
    expect(screen.queryByText("Amina Ali")).not.toBeInTheDocument();
    expect(screen.queryByText("0611111111")).not.toBeInTheDocument();
  });

  it("reveals the Parent and Contact columns once toggled from Manage Columns", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole("button", { name: "Manage Columns" }));
    await user.click(screen.getByRole("checkbox", { name: "Parent" }));
    await user.click(screen.getByRole("checkbox", { name: "Contact" }));
    expect(screen.getByText("Amina Ali")).toBeInTheDocument();
    expect(screen.getByText("0611111111")).toBeInTheDocument();
  });

  it("shows a dash for a student with no guardian on file once the column is shown", async () => {
    const user = userEvent.setup();
    renderTable({ students: [student({ guardianName: null, guardianPhone: null })] });
    await user.click(screen.getByRole("button", { name: "Manage Columns" }));
    await user.click(screen.getByRole("checkbox", { name: "Parent" }));
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});

describe("StudentsTable — navigation", () => {
  it("navigates to the student's profile when the row is clicked", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByText("Hodan Ali"));
    expect(pushMock).toHaveBeenCalledWith("/schools/school-1/students/stu-1");
  });

  it("navigates to the profile when View is clicked, without also triggering the row click", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole("button", { name: "View" }));
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/schools/school-1/students/stu-1");
  });

  it("navigates to the edit view when Edit is clicked", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/schools/school-1/students/stu-1?edit=1");
  });
});

describe("StudentsTable — row actions menu", () => {
  it("navigates to Attendance from the actions menu", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Attendance" }));
    expect(pushMock).toHaveBeenCalledWith("/schools/school-1/students/stu-1/attendance");
  });

  it("navigates to the printable profile from the actions menu", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Print Profile" }));
    expect(pushMock).toHaveBeenCalledWith("/schools/school-1/students/stu-1?print=1");
  });

  it("includes Transfer only when canTransfer is true", async () => {
    const user = userEvent.setup();
    renderTable({ canTransfer: true });
    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("menuitem", { name: "Transfer" })).toBeInTheDocument();
  });

  it("omits Transfer when canTransfer is false", async () => {
    const user = userEvent.setup();
    renderTable({ canTransfer: false });
    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.queryByRole("menuitem", { name: "Transfer" })).not.toBeInTheDocument();
  });

  it("navigates to the bulk-transfer flow scoped to this student when Transfer is clicked", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Transfer" }));
    expect(pushMock).toHaveBeenCalledWith("/schools/school-1/students/bulk-transfer?studentIds=stu-1");
  });
});

describe("StudentsTable — search", () => {
  it("filters rows by guardian name, which isn't a visible column by default", async () => {
    const user = userEvent.setup();
    renderTable({
      students: [student(), student({ studentId: "stu-2", enrollmentId: "enr-2", firstName: "Yusuf", lastName: "Warsame", guardianName: "Ifrah Warsame" })],
    });
    await user.type(screen.getByPlaceholderText(/Search by name/), "ifrah");
    expect(screen.getByText("Yusuf Warsame")).toBeInTheDocument();
    expect(screen.queryByText("Hodan Ali")).not.toBeInTheDocument();
  });
});

describe("StudentsTable — selection", () => {
  it("renders a select-all checkbox when a selection prop is given", () => {
    renderTable({
      selection: { selectedKeys: new Set(), onToggle: vi.fn(), onToggleAll: vi.fn() },
    });
    expect(screen.getByRole("checkbox", { name: "Select all rows" })).toBeInTheDocument();
  });
});
