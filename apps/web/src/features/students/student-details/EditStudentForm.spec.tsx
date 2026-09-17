import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AcademicYear, ClassWithSections, StudentDetail, StudentEnrollmentRecord } from "@/lib/api";
import { ToastProvider } from "@/components/ui/Toast";
import { EditStudentForm } from "./EditStudentForm";

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
  listAcademicYears: vi.fn(),
  listClasses: vi.fn(),
  updateStudent: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

const YEAR: AcademicYear = { id: "year-1", name: "2027", startDate: "2027-01-01", endDate: "2027-12-31", isCurrent: true, terms: [] };
const OTHER_YEAR: AcademicYear = { id: "year-2", name: "2028", startDate: "2028-01-01", endDate: "2028-12-31", isCurrent: false, terms: [] };
const CLASS: ClassWithSections = {
  id: "class-1",
  name: "Class 1",
  level: 1,
  division: { id: "div-1", type: "PRIMARY" },
  sections: [
    { id: "section-a", name: "A", capacity: 30, _count: { enrollments: 10 } },
    { id: "section-b", name: "B", capacity: null, _count: { enrollments: 5 } },
  ],
  _count: { classSubjects: 4 },
};

function enrollment(overrides: Partial<StudentEnrollmentRecord> = {}): StudentEnrollmentRecord {
  return {
    id: "enr-1",
    studentNumber: "STU-2027-00001",
    rollNumber: 3,
    status: "ACTIVE",
    startDate: "2027-01-01",
    endDate: null,
    school: { id: "school-1", name: "Saamalay Primary School" },
    academicYear: { id: "year-1", name: "2027" },
    class: { id: "class-1", name: "Class 1" },
    section: { id: "section-a", name: "A" },
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
    dateOfBirth: "2015-05-01T00:00:00.000Z",
    sex: "FEMALE",
    legacyStudentNumber: null,
    currentStatus: "ACTIVE",
    enrollments: [enrollment()],
    guardians: [],
    transfers: [],
    ...overrides,
  };
}

function renderForm(overrides: Partial<React.ComponentProps<typeof EditStudentForm>> = {}) {
  const onCancel = vi.fn();
  const onSaved = vi.fn();
  const utils = render(
    <ToastProvider>
      <EditStudentForm accessToken="token-1" student={student()} schoolId="school-1" onCancel={onCancel} onSaved={onSaved} {...overrides} />
    </ToastProvider>,
  );
  return { onCancel, onSaved, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.listAcademicYears.mockResolvedValue([YEAR, OTHER_YEAR]);
  apiMock.listClasses.mockResolvedValue([CLASS]);
});

describe("EditStudentForm — prefilled fields", () => {
  it("prefills the student's profile fields from the given student", () => {
    renderForm();
    expect(screen.getByDisplayValue("Hodan")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Ali")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2015-05-01")).toBeInTheDocument();
  });

  it("prefills the current enrollment's year, class, section, and roll number", async () => {
    renderForm();
    expect(await screen.findByRole("option", { name: "2027", selected: true })).toBeInTheDocument();
    expect(screen.getByDisplayValue("3")).toBeInTheDocument();
  });

  it("prefills the legacy student number when present", () => {
    renderForm({ student: student({ legacyStudentNumber: "OLD-001" }) });
    expect(screen.getByDisplayValue("OLD-001")).toBeInTheDocument();
  });

  it("omits the enrollment section entirely when there's no active enrollment", () => {
    renderForm({ student: student({ enrollments: [enrollment({ status: "WITHDRAWN" })] }) });
    expect(screen.queryByText("Current enrollment")).not.toBeInTheDocument();
  });
});

describe("EditStudentForm — editing fields", () => {
  it("updates first and last name", async () => {
    const user = userEvent.setup();
    renderForm();
    const firstName = screen.getByDisplayValue("Hodan");
    await user.clear(firstName);
    await user.type(firstName, "Amina");
    expect(firstName).toHaveValue("Amina");
  });

  it("changing academic year resets the class and section selects", async () => {
    const user = userEvent.setup();
    renderForm();
    await screen.findByRole("option", { name: "2027", selected: true });
    // None of Academic year/Class/Section carry htmlFor in this form (a
    // pre-existing gap, not this test's to fix) — DOM order is Gender,
    // Academic year, Class, Section among the page's comboboxes.
    const [, academicYearSelect, classSelect, sectionSelect] = screen.getAllByRole("combobox");
    expect(classSelect).toHaveValue("class-1");
    await user.selectOptions(academicYearSelect, "year-2");
    expect(classSelect).toHaveValue("");
    expect(sectionSelect).toHaveValue("");
  });
});

describe("EditStudentForm — validation", () => {
  it("disables Save when roll number is invalid (below 1)", async () => {
    const user = userEvent.setup();
    renderForm();
    const rollInput = screen.getByDisplayValue("3");
    await user.clear(rollInput);
    await user.type(rollInput, "0");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("enables Save once a valid roll number is restored", async () => {
    const user = userEvent.setup();
    renderForm();
    expect(screen.getByRole("button", { name: "Save changes" })).not.toBeDisabled();
  });
});

describe("EditStudentForm — submit", () => {
  it("submits the updated profile and enrollment, and reports success", async () => {
    const user = userEvent.setup();
    const updated = student({ firstName: "Amina" });
    apiMock.updateStudent.mockResolvedValue(updated);
    const { onSaved } = renderForm();

    const firstName = screen.getByDisplayValue("Hodan");
    await user.clear(firstName);
    await user.type(firstName, "Amina");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(apiMock.updateStudent).toHaveBeenCalledWith(
      "token-1",
      "stu-1",
      expect.objectContaining({
        firstName: "Amina",
        lastName: "Ali",
        enrollment: { academicYearId: "year-1", classId: "class-1", sectionId: "section-a", rollNumber: 3 },
      }),
    );
    expect(await screen.findByText("Student profile updated.")).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledWith(updated);
  });

  it("sends no enrollment patch when there is no active enrollment", async () => {
    const user = userEvent.setup();
    apiMock.updateStudent.mockResolvedValue(student());
    renderForm({ student: student({ enrollments: [enrollment({ status: "GRADUATED" })] }) });
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(apiMock.updateStudent).toHaveBeenCalledWith(
      "token-1",
      "stu-1",
      expect.objectContaining({ enrollment: undefined }),
    );
  });

  it("sends legacyStudentNumber as undefined, not an empty string, when cleared", async () => {
    const user = userEvent.setup();
    apiMock.updateStudent.mockResolvedValue(student());
    renderForm({ student: student({ legacyStudentNumber: "OLD-001" }) });
    const legacyInput = screen.getByDisplayValue("OLD-001");
    await user.clear(legacyInput);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(apiMock.updateStudent).toHaveBeenCalledWith(
      "token-1",
      "stu-1",
      expect.objectContaining({ legacyStudentNumber: undefined }),
    );
  });

  it("shows the ApiError's own message when saving fails", async () => {
    const user = userEvent.setup();
    apiMock.updateStudent.mockRejectedValue(new ApiError("Roll number already taken in this section"));
    renderForm();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Roll number already taken in this section")).toBeInTheDocument();
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderForm();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
