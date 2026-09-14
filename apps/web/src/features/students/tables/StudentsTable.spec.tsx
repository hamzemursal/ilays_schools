import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StudentDirectoryItem } from "@/lib/api";
import { ToastProvider } from "@/components/ui/Toast";
import { DEFAULT_VISIBLE_COLUMNS } from "../list/columns";
import { StudentsTable } from "./StudentsTable";

const pushMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

const apiMock = vi.hoisted(() => ({ getStudentPhotoUrl: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock }));

function student(overrides: Partial<StudentDirectoryItem> = {}): StudentDirectoryItem {
  return {
    enrollmentId: "enr-1",
    studentId: "stu-1",
    firstName: "Hodan",
    lastName: "Ali",
    studentNumber: "STU-2027-00001",
    rollNumber: 3,
    classId: "class-1",
    className: "Class 1",
    sectionId: "section-1",
    sectionName: "A",
    academicYearId: "year-1",
    sex: "FEMALE",
    status: "ACTIVE",
    dateOfBirth: "2015-04-12",
    admissionDate: "2023-09-01",
    hasPortalAccount: false,
    guardianCount: 1,
    guardian: { id: "grd-1", name: "Amina Ali", relationship: "MOTHER", isPrimaryContact: true, phone: "0611111111", email: null, address: null },
    attendanceToday: { MORNING: "PRESENT", AFTERNOON: null },
    finance: { totalCharged: 500, totalPaid: 300, balance: 200, feeStatus: "PARTIALLY_PAID", lastPaymentDate: "2026-09-01" },
    ...overrides,
  };
}

const ALL_COLUMN_IDS = new Set([
  "dateOfBirth",
  "admissionDate",
  "status",
  "parentName",
  "parentContact",
  "relationship",
  "parentProfile",
  "feeStatus",
  "totalFees",
  "amountPaid",
  "amountDue",
  "lastPayment",
  "attendanceMorning",
  "attendanceAfternoon",
  "academicYear",
]);

function renderTable(overrides: Partial<React.ComponentProps<typeof StudentsTable>> = {}) {
  return render(
    <ToastProvider>
      <StudentsTable
        schoolId="school-1"
        accessToken="token-1"
        students={[student()]}
        canTransfer={true}
        canViewGuardianProfile={true}
        visibleColumns={new Set(DEFAULT_VISIBLE_COLUMNS)}
        academicYearName="2026/2027"
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

  it("shows the filtered empty state when there are no students", () => {
    renderTable({ students: [] });
    expect(screen.getByText("No students match these filters")).toBeInTheDocument();
    expect(screen.getByText("Try adjusting or clearing some filters.")).toBeInTheDocument();
  });
});

describe("StudentsTable — core columns (always visible, cannot be hidden)", () => {
  it("renders every core column's fields with an empty visibleColumns set", () => {
    renderTable({ visibleColumns: new Set() });
    expect(screen.getByText("STU-2027-00001")).toBeInTheDocument();
    expect(screen.getByText("Hodan Ali")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Female")).toBeInTheDocument();
    expect(screen.getByText("Class 1 · A")).toBeInTheDocument();
    expect(screen.getByText(/AM.*Present/)).toBeInTheDocument();
  });

  it("never omits a core column, even when visibleColumns contains unrelated optional ids", () => {
    renderTable({ visibleColumns: new Set(["feeStatus"]) });
    expect(screen.getByText("Hodan Ali")).toBeInTheDocument();
    expect(screen.getByText("Class 1 · A")).toBeInTheDocument();
    expect(screen.getByText("Female")).toBeInTheDocument();
  });
});

describe("StudentsTable — optional columns", () => {
  it("omits every optional column by default (empty visibleColumns)", () => {
    renderTable({ visibleColumns: new Set() });
    expect(screen.queryByText("Amina Ali")).not.toBeInTheDocument();
    expect(screen.queryByText("0611111111")).not.toBeInTheDocument();
  });

  it("shows Parent Name and Parent Contact once toggled on", () => {
    renderTable({ visibleColumns: new Set(["parentName", "parentContact"]) });
    expect(screen.getByText("Amina Ali")).toBeInTheDocument();
    expect(screen.getByText("0611111111")).toBeInTheDocument();
  });

  it("shows every registered optional column when all are toggled on", () => {
    renderTable({ visibleColumns: ALL_COLUMN_IDS });
    expect(screen.getByText("2026/2027")).toBeInTheDocument();
    expect(screen.getByText("Mother")).toBeInTheDocument();
  });
});

describe("StudentsTable — status", () => {
  it.each([
    ["ACTIVE", "Active"],
    ["COMPLETED", "Completed"],
    ["GRADUATED", "Graduated"],
    ["TRANSFERRED", "Transferred"],
    ["WITHDRAWN", "Withdrawn"],
    ["ARCHIVED", "Archived"],
  ] as const)("shows the %s status as %s", (status, label) => {
    renderTable({ students: [student({ status })], visibleColumns: ALL_COLUMN_IDS });
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe("StudentsTable — attendance today", () => {
  it("renders Present/Not Recorded pills, never labeling a null session Absent", () => {
    renderTable();
    expect(screen.getByText(/AM.*Present/)).toBeInTheDocument();
    expect(screen.getByText(/PM.*Not Recorded/)).toBeInTheDocument();
    expect(screen.queryByText(/Absent/)).not.toBeInTheDocument();
  });

  it("shows a dash when attendanceToday is null (no attendance.view permission)", () => {
    renderTable({ students: [student({ attendanceToday: null })] });
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});

describe("StudentsTable — standalone Morning/Afternoon Session columns (optional)", () => {
  it("shows each session's status on its own when toggled on, never labeling Not Recorded as Absent", () => {
    renderTable({
      students: [student({ attendanceToday: { MORNING: "PRESENT", AFTERNOON: null } })],
      visibleColumns: new Set(["attendanceMorning", "attendanceAfternoon"]),
    });
    expect(screen.getByText("Present")).toBeInTheDocument();
    expect(screen.getByText("Not Recorded")).toBeInTheDocument();
    expect(screen.queryByText("Absent")).not.toBeInTheDocument();
  });

  it("shows a dash for each session column when attendanceToday is null", () => {
    renderTable({
      students: [student({ attendanceToday: null })],
      visibleColumns: new Set(["attendanceMorning", "attendanceAfternoon"]),
    });
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});

describe("StudentsTable — fee status", () => {
  it.each([
    ["PAID", "Paid"],
    ["PARTIALLY_PAID", "Partially Paid"],
    ["PENDING", "Pending"],
    ["OVERDUE", "Overdue"],
    ["NO_CHARGE", "No Charge"],
  ] as const)("shows the %s fee status as %s", (feeStatus, label) => {
    renderTable({
      students: [student({ finance: { totalCharged: 100, totalPaid: 0, balance: 100, feeStatus, lastPaymentDate: null } })],
      visibleColumns: new Set(["feeStatus"]),
    });
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("shows a dash when finance is null (no finance.ledger.view permission)", () => {
    renderTable({ students: [student({ finance: null })], visibleColumns: new Set(["feeStatus"]) });
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});

describe("StudentsTable — parent/guardian", () => {
  it("links the parent name to their profile when canViewGuardianProfile is true", () => {
    renderTable({ visibleColumns: new Set(["parentName"]) });
    const link = screen.getByRole("link", { name: "Amina Ali" });
    expect(link).toHaveAttribute("href", "/schools/school-1/parents/grd-1");
  });

  it("shows the parent name as plain text when canViewGuardianProfile is false", () => {
    renderTable({ canViewGuardianProfile: false, visibleColumns: new Set(["parentName"]) });
    expect(screen.queryByRole("link", { name: "Amina Ali" })).not.toBeInTheDocument();
    expect(screen.getByText("Amina Ali")).toBeInTheDocument();
  });

  it("shows a dash for a student with no guardian on file", () => {
    renderTable({ students: [student({ guardian: null })], visibleColumns: new Set(["parentName"]) });
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
});

describe("StudentsTable — row actions menu", () => {
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
});

describe("StudentsTable — selection", () => {
  it("renders a select-all checkbox when a selection prop is given", () => {
    renderTable({ selection: { selectedKeys: new Set(), onToggle: vi.fn(), onToggleAll: vi.fn() } });
    expect(screen.getByRole("checkbox", { name: "Select all rows" })).toBeInTheDocument();
  });
});
