import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GuardianRecord, StudentAttendanceHistoryRecord, StudentDetail, StudentEnrollmentRecord, StudentTransferRecord } from "@/lib/api";
import { ToastProvider } from "@/components/ui/Toast";
import { StudentProfile } from "./StudentProfile";

const pushMock = vi.hoisted(() => vi.fn());
const searchParamsMock = vi.hoisted(() => vi.fn((_key: string) => null as string | null));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => ({ get: searchParamsMock }),
}));

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
const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authMock(), ApiError }));

const apiMock = vi.hoisted(() => ({
  getStudent: vi.fn(),
  getStudentPhotoUrl: vi.fn(),
  deleteStudent: vi.fn(),
  createStudentPortalAccount: vi.fn(),
  resetStudentPortalPassword: vi.fn(),
  listClassSubjects: vi.fn(),
  listSectionTeacherAssignments: vi.fn(),
  listSchoolDirectory: vi.fn(),
  requestTransfer: vi.fn(),
  // Used by the real (unmocked) EditStudentForm rendered inside StudentProfile.
  listAcademicYears: vi.fn(),
  listClasses: vi.fn(),
  updateStudent: vi.fn(),
  getStudentAttendanceHistory: vi.fn(),
  getStudentResultsReport: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

// StudentFeesTab and GuardianForm are large, separately-tested features —
// stubbed here so these tests verify StudentProfile's own orchestration
// (props passed, callbacks wired) without re-testing their internals.
vi.mock("@/features/finance/student-ledger/StudentFeesTab", () => ({
  StudentFeesTab: (props: { studentId: string; canRecordPayments: boolean }) => (
    <div data-testid="student-fees-tab">Fees tab for {props.studentId} (canRecord: {String(props.canRecordPayments)})</div>
  ),
}));
vi.mock("@/features/guardians/forms/GuardianForm", () => ({
  GuardianForm: (props: { onAdded: (g: GuardianRecord) => void; onCancel: () => void }) => (
    <div data-testid="guardian-form">
      <button onClick={() => props.onAdded({ id: "guardian-new", firstName: "Ifrah", lastName: "Warsame", phone: null, email: null, relationship: "MOTHER", isPrimaryContact: false })}>
        Mock add
      </button>
      <button onClick={props.onCancel}>Mock cancel</button>
    </div>
  ),
}));

function enrollment(overrides: Partial<StudentEnrollmentRecord> = {}): StudentEnrollmentRecord {
  return {
    id: "enr-1",
    studentNumber: "STU-2027-00001",
    rollNumber: 3,
    status: "ACTIVE",
    startDate: "2027-01-01",
    endDate: null,
    school: { id: "school-1", name: "Saamalay Primary School" },
    academicYear: { id: "year-1", name: "2027", isCurrent: true },
    class: { id: "class-1", name: "Class 1" },
    section: { id: "section-a", name: "A" },
    ...overrides,
  };
}

function guardian(overrides: Partial<GuardianRecord> = {}): GuardianRecord {
  return {
    id: "guardian-1",
    firstName: "Amina",
    lastName: "Ali",
    phone: "0611111111",
    email: null,
    relationship: "MOTHER",
    isPrimaryContact: true,
    ...overrides,
  };
}

function student(overrides: Partial<StudentDetail> = {}): StudentDetail {
  return {
    id: "stu-1",
    organizationId: "org-1",
    userId: null,
    firstName: "Hodan",
    lastName: "Ali",
    dateOfBirth: "2015-05-01",
    sex: "FEMALE",
    legacyStudentNumber: null,
    currentStatus: "ACTIVE",
    enrollments: [enrollment()],
    guardians: [],
    transfers: [],
    ...overrides,
  };
}

function renderProfile(studentId = "stu-1") {
  return render(
    <ToastProvider>
      <StudentProfile studentId={studentId} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParamsMock.mockReturnValue(null);
  authMock.mockReturnValue({ accessToken: "token-1", user: { permissions: [] } });
  apiMock.getStudentPhotoUrl.mockResolvedValue({ url: null });
  apiMock.listClassSubjects.mockResolvedValue([]);
  apiMock.listSectionTeacherAssignments.mockResolvedValue([]);
  apiMock.listAcademicYears.mockResolvedValue([]);
  apiMock.listClasses.mockResolvedValue([]);
  apiMock.getStudentAttendanceHistory.mockResolvedValue([]);
  vi.spyOn(window, "print").mockImplementation(() => {});
});

describe("StudentProfile — loading/error", () => {
  it("shows a skeleton before the student loads", () => {
    apiMock.getStudent.mockReturnValue(new Promise(() => {}));
    const { container } = renderProfile();
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("shows the ApiError's own message when loading fails", async () => {
    apiMock.getStudent.mockRejectedValue(new ApiError("Student not found"));
    renderProfile();
    expect(await screen.findByText("Student not found")).toBeInTheDocument();
  });
});

describe("StudentProfile — header", () => {
  it("renders the student's name, status, DOB, sex, and student number", async () => {
    apiMock.getStudent.mockResolvedValue(student());
    renderProfile();
    expect(await screen.findByText("Hodan Ali")).toBeInTheDocument();
    // "ACTIVE" also appears on the enrollment-history row's status badge —
    // the header badge is just the first of the two.
    expect(screen.getAllByText("ACTIVE").length).toBeGreaterThan(0);
    expect(screen.getByText("Female")).toBeInTheDocument();
    expect(screen.getByText("#STU-2027-00001")).toBeInTheDocument();
  });

  it("shows Male for a male student", async () => {
    apiMock.getStudent.mockResolvedValue(student({ sex: "MALE" }));
    renderProfile();
    expect(await screen.findByText("Male")).toBeInTheDocument();
  });
});

describe("StudentProfile — RBAC on Edit/Delete", () => {
  it("shows neither Edit nor Delete without permission", async () => {
    apiMock.getStudent.mockResolvedValue(student());
    renderProfile();
    await screen.findByText("Hodan Ali");
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("shows Edit with students.update and Delete with students.archive", async () => {
    authMock.mockReturnValue({ accessToken: "token-1", user: { permissions: ["students.update", "students.archive"] } });
    apiMock.getStudent.mockResolvedValue(student());
    renderProfile();
    await screen.findByText("Hodan Ali");
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("opens the edit form when Edit is clicked", async () => {
    const user = userEvent.setup();
    authMock.mockReturnValue({ accessToken: "token-1", user: { permissions: ["students.update"] } });
    apiMock.getStudent.mockResolvedValue(student());
    renderProfile();
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    expect(screen.getByText("Edit student")).toBeInTheDocument();
  });

  it("preopens the edit form when the URL carries ?edit=1", async () => {
    searchParamsMock.mockImplementation((key: string) => (key === "edit" ? "1" : null));
    authMock.mockReturnValue({ accessToken: "token-1", user: { permissions: ["students.update"] } });
    apiMock.getStudent.mockResolvedValue(student());
    renderProfile();
    expect(await screen.findByText("Edit student")).toBeInTheDocument();
  });
});

describe("StudentProfile — print", () => {
  it("triggers window.print once the student has loaded, when ?print=1", async () => {
    searchParamsMock.mockImplementation((key: string) => (key === "print" ? "1" : null));
    apiMock.getStudent.mockResolvedValue(student());
    renderProfile();
    await screen.findByText("Hodan Ali");
    await waitFor(() => expect(window.print).toHaveBeenCalledTimes(1));
  });

  it("never calls window.print without ?print=1", async () => {
    apiMock.getStudent.mockResolvedValue(student());
    renderProfile();
    await screen.findByText("Hodan Ali");
    expect(window.print).not.toHaveBeenCalled();
  });
});

describe("StudentProfile — delete", () => {
  it("opens a confirmation dialog naming the student", async () => {
    const user = userEvent.setup();
    authMock.mockReturnValue({ accessToken: "token-1", user: { permissions: ["students.archive"] } });
    apiMock.getStudent.mockResolvedValue(student());
    renderProfile();
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Delete Hodan Ali permanently?");
  });

  it("closes the dialog on Cancel without deleting", async () => {
    const user = userEvent.setup();
    authMock.mockReturnValue({ accessToken: "token-1", user: { permissions: ["students.archive"] } });
    apiMock.getStudent.mockResolvedValue(student());
    renderProfile();
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(apiMock.deleteStudent).not.toHaveBeenCalled();
  });

  it("deletes and redirects to the active enrollment's school student list", async () => {
    const user = userEvent.setup();
    authMock.mockReturnValue({ accessToken: "token-1", user: { permissions: ["students.archive"] } });
    apiMock.getStudent.mockResolvedValue(student());
    apiMock.deleteStudent.mockResolvedValue(undefined);
    renderProfile();
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete permanently" }));

    expect(apiMock.deleteStudent).toHaveBeenCalledWith("token-1", "stu-1");
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/schools/school-1/students"));
    expect(await screen.findByText("Student deleted permanently.")).toBeInTheDocument();
  });

  it("falls back to the first enrollment's school when there is no active enrollment", async () => {
    const user = userEvent.setup();
    authMock.mockReturnValue({ accessToken: "token-1", user: { permissions: ["students.archive"] } });
    apiMock.getStudent.mockResolvedValue(
      student({ enrollments: [enrollment({ status: "COMPLETED", school: { id: "school-9", name: "Old School" } })] }),
    );
    apiMock.deleteStudent.mockResolvedValue(undefined);
    renderProfile();
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete permanently" }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/schools/school-9/students"));
  });

  it("shows a danger toast and keeps the dialog closed when deletion fails", async () => {
    const user = userEvent.setup();
    authMock.mockReturnValue({ accessToken: "token-1", user: { permissions: ["students.archive"] } });
    apiMock.getStudent.mockResolvedValue(student());
    apiMock.deleteStudent.mockRejectedValue(new ApiError("Cannot delete: has linked payment records"));
    renderProfile();
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete permanently" }));

    expect(await screen.findByText("Cannot delete: has linked payment records")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});

describe("StudentProfile — Fees & Payments tab", () => {
  it("shows no tab bar when the viewer can't see fees", async () => {
    apiMock.getStudent.mockResolvedValue(student());
    renderProfile();
    await screen.findByText("Hodan Ali");
    expect(screen.queryByText("Fees & Payments")).not.toBeInTheDocument();
  });

  it("shows the tab bar and switches to the (stubbed) fees tab with the right props", async () => {
    const user = userEvent.setup();
    authMock.mockReturnValue({ accessToken: "token-1", user: { permissions: ["finance.ledger.view", "payments.record"] } });
    apiMock.getStudent.mockResolvedValue(student());
    renderProfile();
    await screen.findByText("Hodan Ali");
    await user.click(screen.getByRole("button", { name: "Fees & Payments" }));
    expect(screen.getByTestId("student-fees-tab")).toHaveTextContent("Fees tab for stu-1 (canRecord: true)");
  });
});

describe("StudentProfile — current enrollment & subjects", () => {
  it("shows the current enrollment fields", async () => {
    apiMock.getStudent.mockResolvedValue(student());
    renderProfile();
    expect(await screen.findByText("Current enrollment")).toBeInTheDocument();
    // Also appears in the Enrollment history table's own School column.
    expect(screen.getAllByText("Saamalay Primary School").length).toBeGreaterThan(0);
    expect(screen.getByText("Class 1")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
    // Also appears in the Enrollment history table's own Roll # column.
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
  });

  it("omits the current-enrollment and subjects cards when there is no active enrollment", async () => {
    apiMock.getStudent.mockResolvedValue(student({ enrollments: [enrollment({ status: "WITHDRAWN" })] }));
    renderProfile();
    await screen.findByText("Hodan Ali");
    expect(screen.queryByText("Current enrollment")).not.toBeInTheDocument();
    expect(screen.queryByText("Subjects & Teachers")).not.toBeInTheDocument();
  });

  it("shows each subject with its assigned teacher, or 'No teacher assigned'", async () => {
    apiMock.getStudent.mockResolvedValue(student());
    apiMock.listClassSubjects.mockResolvedValue([
      { classId: "class-1", subjectId: "subj-1", subject: { id: "subj-1", name: "Mathematics", code: "MATH" } },
      { classId: "class-1", subjectId: "subj-2", subject: { id: "subj-2", name: "Science", code: null } },
    ]);
    apiMock.listSectionTeacherAssignments.mockResolvedValue([
      { id: "a1", subjectId: "subj-1", subject: { id: "subj-1", name: "Mathematics", code: "MATH" }, teacher: { id: "t1", firstName: "Amran", lastName: "Hassan" } },
    ]);
    renderProfile();
    expect(await screen.findByText("Amran Hassan")).toBeInTheDocument();
    expect(screen.getByText("No teacher assigned")).toBeInTheDocument();
  });

  it("shows an error alert if subjects fail to load", async () => {
    apiMock.getStudent.mockResolvedValue(student());
    apiMock.listClassSubjects.mockRejectedValue(new ApiError("Failed to load class subjects"));
    renderProfile();
    expect(await screen.findByText("Failed to load class subjects")).toBeInTheDocument();
  });
});

describe("StudentProfile — academic history", () => {
  it("renders every enrollment as its own historical record on the Academic History tab", async () => {
    const user = userEvent.setup();
    apiMock.getStudent.mockResolvedValue(
      student({
        enrollments: [
          enrollment(),
          enrollment({ id: "enr-2", status: "TRANSFERRED_OUT", school: { id: "school-2", name: "Old School" } }),
        ],
      }),
    );
    renderProfile();
    await user.click(await screen.findByRole("button", { name: "Academic History" }));

    // The Overview tab (and its Current Enrollment card) is unmounted once
    // another tab is active, so each school name is unambiguous here.
    expect(await screen.findByText("Old School")).toBeInTheDocument();
    expect(screen.getByText("Saamalay Primary School")).toBeInTheDocument();
    expect(screen.getByText("TRANSFERRED OUT")).toBeInTheDocument();
  });

  it("shows an empty state when the student has no enrollment at all", async () => {
    const user = userEvent.setup();
    apiMock.getStudent.mockResolvedValue(student({ enrollments: [] }));
    renderProfile();
    await user.click(await screen.findByRole("button", { name: "Academic History" }));

    expect(await screen.findByText("No enrollment history yet")).toBeInTheDocument();
  });
});

describe("StudentProfile — transfers", () => {
  function transfer(overrides: Partial<StudentTransferRecord> = {}): StudentTransferRecord {
    return {
      id: "transfer-1",
      status: "EXECUTED",
      reason: "Family relocation",
      transferDate: "2027-02-01",
      createdAt: "2027-01-20",
      fromEnrollment: { school: { id: "school-1", name: "Saamalay Primary School" }, class: { name: "Class 1" }, section: { name: "A" }, academicYear: { name: "2027" } },
      toEnrollment: { school: { id: "school-2", name: "New School" }, class: { name: "Class 2" }, section: { name: "B" }, academicYear: { name: "2027" } },
      ...overrides,
    };
  }

  it("shows an empty state on the Transfers tab when there are none", async () => {
    const user = userEvent.setup();
    apiMock.getStudent.mockResolvedValue(student());
    renderProfile();
    await user.click(await screen.findByRole("button", { name: "Transfers" }));
    expect(await screen.findByText("No transfers recorded")).toBeInTheDocument();
  });

  it("renders a completed transfer with its reason and destination", async () => {
    const user = userEvent.setup();
    apiMock.getStudent.mockResolvedValue(student({ transfers: [transfer()] }));
    renderProfile();
    await user.click(await screen.findByRole("button", { name: "Transfers" }));
    expect(await screen.findByText("Transfer history")).toBeInTheDocument();
    expect(screen.getByText("New School")).toBeInTheDocument();
    expect(screen.getByText("Family relocation")).toBeInTheDocument();
    expect(screen.getByText("EXECUTED")).toBeInTheDocument();
  });

  it("shows 'destination pending' when there's no toEnrollment yet", async () => {
    const user = userEvent.setup();
    apiMock.getStudent.mockResolvedValue(student({ transfers: [transfer({ toEnrollment: null, status: "REQUESTED" })] }));
    renderProfile();
    await user.click(await screen.findByRole("button", { name: "Transfers" }));
    expect(await screen.findByText("destination pending")).toBeInTheDocument();
  });
});

describe("StudentProfile — guardians", () => {
  it("shows an empty state when there are no guardians", async () => {
    apiMock.getStudent.mockResolvedValue(student());
    renderProfile();
    expect(await screen.findByText("No guardians on file")).toBeInTheDocument();
  });

  it("renders each guardian", async () => {
    apiMock.getStudent.mockResolvedValue(student({ guardians: [guardian()] }));
    renderProfile();
    expect(await screen.findByText("Amina Ali")).toBeInTheDocument();
  });

  it("hides 'Add guardian' without guardians.manage", async () => {
    apiMock.getStudent.mockResolvedValue(student());
    renderProfile();
    await screen.findByText("Hodan Ali");
    expect(screen.queryByRole("button", { name: "Add guardian" })).not.toBeInTheDocument();
  });

  it("adds a guardian via the (stubbed) form and shows a toast", async () => {
    const user = userEvent.setup();
    authMock.mockReturnValue({ accessToken: "token-1", user: { permissions: ["guardians.manage"] } });
    apiMock.getStudent.mockResolvedValue(student());
    renderProfile();
    await user.click(await screen.findByRole("button", { name: "Add guardian" }));
    await user.click(screen.getByRole("button", { name: "Mock add" }));

    expect(await screen.findByText("Ifrah Warsame")).toBeInTheDocument();
    expect(screen.getByText("Guardian added.")).toBeInTheDocument();
  });
});

describe("StudentProfile — Student Portal account", () => {
  it("shows the portal account card only with students.update and no existing account", async () => {
    authMock.mockReturnValue({ accessToken: "token-1", user: { permissions: ["students.update"] } });
    apiMock.getStudent.mockResolvedValue(student({ userId: null }));
    renderProfile();
    expect(await screen.findByText("Student Portal account")).toBeInTheDocument();
  });

  it("hides the portal account card once an account already exists", async () => {
    authMock.mockReturnValue({ accessToken: "token-1", user: { permissions: ["students.update"] } });
    apiMock.getStudent.mockResolvedValue(student({ userId: "user-1" }));
    renderProfile();
    await screen.findByText("Hodan Ali");
    expect(screen.queryByText("Student Portal account")).not.toBeInTheDocument();
  });

  it("creates a portal account and shows the one-time credentials", async () => {
    const user = userEvent.setup();
    authMock.mockReturnValue({ accessToken: "token-1", user: { permissions: ["students.update"] } });
    apiMock.getStudent.mockResolvedValue(student());
    apiMock.createStudentPortalAccount.mockResolvedValue({ loginId: "STU-2027-00001", temporaryPassword: "Temp123!" });
    renderProfile();
    await user.click(await screen.findByRole("button", { name: "Create Student Login" }));
    expect(await screen.findByText(/Temp123!/)).toBeInTheDocument();
  });

  it("shows an error if portal account creation fails", async () => {
    const user = userEvent.setup();
    authMock.mockReturnValue({ accessToken: "token-1", user: { permissions: ["students.update"] } });
    apiMock.getStudent.mockResolvedValue(student());
    apiMock.createStudentPortalAccount.mockRejectedValue(new ApiError("Only secondary students can have a portal account"));
    renderProfile();
    await user.click(await screen.findByRole("button", { name: "Create Student Login" }));
    expect(await screen.findByText("Only secondary students can have a portal account")).toBeInTheDocument();
  });
});

describe("StudentProfile — Student Portal password reset", () => {
  const resetButtons = () => screen.getAllByRole("button", { name: "Reset password" });

  it("offers a reset (and no Create Student Login) once an account exists, only with students.update", async () => {
    authMock.mockReturnValue({ accessToken: "token-1", user: { permissions: ["students.update"] } });
    apiMock.getStudent.mockResolvedValue(student({ userId: "user-1" }));
    renderProfile();

    expect(await screen.findByText("Reset portal password")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create Student Login" })).not.toBeInTheDocument();
  });

  it("is not offered without students.update, nor when the student has no account yet", async () => {
    authMock.mockReturnValue({ accessToken: "token-1", user: { permissions: [] } });
    apiMock.getStudent.mockResolvedValue(student({ userId: "user-1" }));
    const first = renderProfile();
    await screen.findByText("Hodan Ali");
    expect(screen.queryByText("Reset portal password")).not.toBeInTheDocument();
    first.unmount();

    authMock.mockReturnValue({ accessToken: "token-1", user: { permissions: ["students.update"] } });
    apiMock.getStudent.mockResolvedValue(student({ userId: null }));
    renderProfile();
    await screen.findByText("Student Portal account");
    expect(screen.queryByText("Reset portal password")).not.toBeInTheDocument();
  });

  it("asks for confirmation first, then calls the RESET endpoint (never create) and shows the one-time password", async () => {
    const user = userEvent.setup();
    authMock.mockReturnValue({ accessToken: "token-1", user: { permissions: ["students.update"] } });
    apiMock.getStudent.mockResolvedValue(student({ userId: "user-1" }));
    apiMock.resetStudentPortalPassword.mockResolvedValue({ loginId: "STU-2027-00001", temporaryPassword: "NewTemp-9x!" });
    renderProfile();
    await screen.findByText("Reset portal password");

    await user.click(resetButtons()[0]);
    expect(apiMock.resetStudentPortalPassword).not.toHaveBeenCalled();
    await user.click(resetButtons().at(-1)!);

    expect(await screen.findByText(/NewTemp-9x!/)).toBeInTheDocument();
    expect(screen.getByText(/Login ID: STU-2027-00001/)).toBeInTheDocument();
    expect(apiMock.resetStudentPortalPassword).toHaveBeenCalledWith("token-1", "stu-1");
    expect(apiMock.createStudentPortalAccount).not.toHaveBeenCalled();
    expect(screen.getByText(/won.t be shown again/)).toBeInTheDocument();
  });

  it("shows the server's message when the reset is refused", async () => {
    const user = userEvent.setup();
    authMock.mockReturnValue({ accessToken: "token-1", user: { permissions: ["students.update"] } });
    apiMock.getStudent.mockResolvedValue(student({ userId: "user-1" }));
    apiMock.resetStudentPortalPassword.mockRejectedValue(new ApiError("This portal account is suspended"));
    renderProfile();
    await screen.findByText("Reset portal password");

    await user.click(resetButtons()[0]);
    await user.click(resetButtons().at(-1)!);

    expect(await screen.findByText("This portal account is suspended")).toBeInTheDocument();
  });
});

describe("StudentProfile — transfer request", () => {
  it("shows the Transfer card only with transfers.create and an active enrollment", async () => {
    authMock.mockReturnValue({ accessToken: "token-1", user: { permissions: ["transfers.create"] } });
    apiMock.getStudent.mockResolvedValue(student());
    renderProfile();
    expect(await screen.findByRole("button", { name: "Request transfer" })).toBeInTheDocument();
  });

  it("hides the Transfer card without transfers.create", async () => {
    apiMock.getStudent.mockResolvedValue(student());
    renderProfile();
    await screen.findByText("Hodan Ali");
    expect(screen.queryByRole("button", { name: "Request transfer" })).not.toBeInTheDocument();
  });

  it("loads the school directory (excluding the current school) and submits a request", async () => {
    const user = userEvent.setup();
    authMock.mockReturnValue({ accessToken: "token-1", user: { permissions: ["transfers.create"] } });
    apiMock.getStudent.mockResolvedValue(student());
    apiMock.listSchoolDirectory.mockResolvedValue([
      { id: "school-1", name: "Saamalay Primary School" },
      { id: "school-2", name: "Ilays Secondary" },
    ]);
    apiMock.requestTransfer.mockResolvedValue(undefined);
    renderProfile();
    await user.click(await screen.findByRole("button", { name: "Request transfer" }));

    expect(await screen.findByRole("option", { name: "Ilays Secondary" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Saamalay Primary School" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Send request" }));
    expect(apiMock.requestTransfer).toHaveBeenCalledWith("token-1", "stu-1", { toSchoolId: "school-2", reason: undefined });
    // Matches both the toast ("Transfer requested.") and the inline success
    // alert ("Transfer requested — the destination school's admin...").
    expect((await screen.findAllByText(/Transfer requested/)).length).toBeGreaterThan(0);
  });
});

describe("StudentProfile — Attendance tab", () => {
  function attendanceRecord(overrides: Partial<StudentAttendanceHistoryRecord> = {}): StudentAttendanceHistoryRecord {
    return {
      id: "att-1",
      date: "2027-02-01",
      status: "PRESENT",
      note: null,
      enrollment: { academicYear: { id: "year-1", name: "2027" }, class: { name: "Class 1" }, section: { name: "A" } },
      ...overrides,
    };
  }

  it("hides the Attendance tab without attendance.view", async () => {
    apiMock.getStudent.mockResolvedValue(student());
    renderProfile();
    await screen.findByText("Hodan Ali");
    expect(screen.queryByRole("button", { name: "Attendance" })).not.toBeInTheDocument();
    expect(apiMock.getStudentAttendanceHistory).not.toHaveBeenCalled();
  });

  it("shows the Attendance tab and real records with attendance.view", async () => {
    const user = userEvent.setup();
    authMock.mockReturnValue({ accessToken: "token-1", user: { permissions: ["attendance.view"] } });
    apiMock.getStudent.mockResolvedValue(student());
    apiMock.getStudentAttendanceHistory.mockResolvedValue([attendanceRecord(), attendanceRecord({ id: "att-2", status: "ABSENT" })]);
    renderProfile();
    await user.click(await screen.findByRole("button", { name: "Attendance" }));

    expect(await screen.findByText("Attendance Rate")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("feeds the current year's real attendance rate into the Overview summary tile", async () => {
    authMock.mockReturnValue({ accessToken: "token-1", user: { permissions: ["attendance.view"] } });
    apiMock.getStudent.mockResolvedValue(student());
    apiMock.getStudentAttendanceHistory.mockResolvedValue([attendanceRecord(), attendanceRecord({ id: "att-2", status: "PRESENT" })]);
    renderProfile();
    expect(await screen.findByText("Attendance (this year)")).toBeInTheDocument();
    expect(await screen.findByText("100%")).toBeInTheDocument();
  });

  it("shows an empty state when nothing has been recorded", async () => {
    const user = userEvent.setup();
    authMock.mockReturnValue({ accessToken: "token-1", user: { permissions: ["attendance.view"] } });
    apiMock.getStudent.mockResolvedValue(student());
    apiMock.getStudentAttendanceHistory.mockResolvedValue([]);
    renderProfile();
    await user.click(await screen.findByRole("button", { name: "Attendance" }));
    expect(await screen.findByText("No attendance recorded yet")).toBeInTheDocument();
  });
});

describe("StudentProfile — current enrollment Division field", () => {
  it("shows the real Division once resolved from the school's class list", async () => {
    apiMock.getStudent.mockResolvedValue(student());
    apiMock.listClasses.mockResolvedValue([
      { id: "class-1", name: "Class 1", level: 1, division: { id: "div-1", type: "PRIMARY" }, sections: [], _count: { classSubjects: 0 } },
    ]);
    renderProfile();
    expect(await screen.findByText("Primary")).toBeInTheDocument();
    expect(apiMock.listClasses).toHaveBeenCalledWith("token-1", "school-1", "year-1");
  });

  it("shows a dash instead of guessing when the class can't be resolved", async () => {
    apiMock.getStudent.mockResolvedValue(student());
    apiMock.listClasses.mockResolvedValue([]);
    renderProfile();
    await screen.findByText("Current enrollment");
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
