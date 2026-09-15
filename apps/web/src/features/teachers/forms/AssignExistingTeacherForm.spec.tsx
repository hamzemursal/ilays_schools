import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AcademicYear, ClassSubjectRecord, ClassWithSections, Teacher, TeacherSearchResult } from "@/lib/api";
import { AssignExistingTeacherForm } from "./AssignExistingTeacherForm";

const apiMock = vi.hoisted(() => ({
  searchTeachers: vi.fn(),
  listAcademicYears: vi.fn(),
  listClasses: vi.fn(),
  listClassSubjects: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

const teachersApiMock = vi.hoisted(() => ({ list: vi.fn(), addAssignment: vi.fn() }));
vi.mock("../api", () => ({ teachersApi: teachersApiMock }));

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

function searchResult(overrides: Partial<TeacherSearchResult> = {}): TeacherSearchResult {
  return {
    id: "teacher-1",
    firstName: "Ahmed",
    lastName: "Mohamed",
    employeeNumber: "EMP-0042",
    email: "ahmed@example.com",
    phone: null,
    school: { id: "school-a", name: "Ilays Primary School", type: "PRIMARY" },
    ...overrides,
  };
}

const YEAR: AcademicYear = { id: "year-1", name: "2027", startDate: "2027-01-01", endDate: "2027-12-31", isCurrent: true };
const CLASS: ClassWithSections = {
  id: "class-1",
  name: "Class 6",
  level: 6,
  division: { id: "div-1", type: "PRIMARY" },
  sections: [{ id: "section-1", name: "A", capacity: null, _count: { enrollments: 0 } }],
  _count: { classSubjects: 1 },
};
const CLASS_SUBJECT: ClassSubjectRecord = { classId: "class-1", subjectId: "subject-1", subject: { id: "subject-1", name: "Mathematics", code: null } };

function renderForm(overrides: Partial<React.ComponentProps<typeof AssignExistingTeacherForm>> = {}) {
  const onAssigned = vi.fn();
  const onCancel = vi.fn();
  const utils = render(
    <AssignExistingTeacherForm accessToken="token-1" schoolId="school-b" onAssigned={onAssigned} onCancel={onCancel} {...overrides} />,
  );
  return { onAssigned, onCancel, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.listAcademicYears.mockResolvedValue([YEAR]);
  apiMock.listClasses.mockResolvedValue([CLASS]);
  apiMock.listClassSubjects.mockResolvedValue([CLASS_SUBJECT]);
  teachersApiMock.list.mockResolvedValue([] satisfies Teacher[]);
});

describe("AssignExistingTeacherForm — search across the org", () => {
  it("shows the search box, not the assignment picker, by default", () => {
    renderForm();
    expect(screen.getByPlaceholderText("Search by name, employee number, or email…")).toBeInTheDocument();
  });

  it("does not search until at least 2 characters are typed (debounced)", async () => {
    vi.useFakeTimers();
    renderForm();
    fireEvent.change(screen.getByPlaceholderText("Search by name, employee number, or email…"), { target: { value: "A" } });
    await vi.advanceTimersByTimeAsync(500);
    expect(apiMock.searchTeachers).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("searches org-wide and shows a result with their home school", async () => {
    vi.useFakeTimers();
    apiMock.searchTeachers.mockResolvedValue([searchResult()]);
    renderForm();
    fireEvent.change(screen.getByPlaceholderText("Search by name, employee number, or email…"), { target: { value: "Ahmed" } });
    await vi.advanceTimersByTimeAsync(500);
    vi.useRealTimers();

    expect(apiMock.searchTeachers).toHaveBeenCalledWith("token-1", "school-b", "Ahmed");
    expect(await screen.findByText("Ahmed Mohamed")).toBeInTheDocument();
    expect(screen.getByText(/Ilays Primary School/)).toBeInTheDocument();
  });

  it("shows a 'no match' message pointing at Add teacher when nothing is found", async () => {
    vi.useFakeTimers();
    apiMock.searchTeachers.mockResolvedValue([]);
    renderForm();
    fireEvent.change(screen.getByPlaceholderText("Search by name, employee number, or email…"), { target: { value: "Nobody" } });
    await vi.advanceTimersByTimeAsync(500);
    vi.useRealTimers();

    expect(await screen.findByText("No matching teacher found in this organization.")).toBeInTheDocument();
  });

  it("calls onCancel from the search step", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderForm();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe("AssignExistingTeacherForm — assigning a selected teacher", () => {
  async function selectTeacher() {
    vi.useFakeTimers();
    apiMock.searchTeachers.mockResolvedValue([searchResult()]);
    const utils = renderForm();
    fireEvent.change(screen.getByPlaceholderText("Search by name, employee number, or email…"), { target: { value: "Ahmed" } });
    await vi.advanceTimersByTimeAsync(500);
    vi.useRealTimers();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Select" }));
    return { user, ...utils };
  }

  it("shows the picked teacher and their home school before assigning", async () => {
    await selectTeacher();
    expect(screen.getByText("Assign Ahmed Mohamed to a class here")).toBeInTheDocument();
    expect(screen.getByText(/home school: Ilays Primary School/)).toBeInTheDocument();
  });

  it("assigns each selected subject via addAssignment, scoped to the target school, and reports the new teacher", async () => {
    const { user, onAssigned } = await selectTeacher();
    teachersApiMock.addAssignment.mockResolvedValue({});

    // FormField's <label> here has no htmlFor (see FormControls.tsx), so
    // these selects carry no accessible name — targeted by DOM order
    // (Academic year, Class, Section), same convention as EnrollmentStep.spec.
    const [yearSelect, classSelect, sectionSelect] = screen.getAllByRole("combobox");
    await user.selectOptions(yearSelect, "year-1");
    await user.selectOptions(classSelect, "class-1");
    await user.selectOptions(sectionSelect, "section-1");
    await user.click(await screen.findByText("Mathematics"));
    await user.click(screen.getByRole("button", { name: "Assign 1 subject" }));

    expect(teachersApiMock.addAssignment).toHaveBeenCalledWith("token-1", "school-b", "teacher-1", {
      academicYearId: "year-1",
      sectionId: "section-1",
      subjectId: "subject-1",
    });
    expect(onAssigned).toHaveBeenCalledWith("teacher-1");
  });

  it("fetches this school's own years/classes/teachers, not the candidate's home school's", async () => {
    await selectTeacher();
    expect(apiMock.listAcademicYears).toHaveBeenCalledWith("token-1", "school-b");
    expect(apiMock.listClasses).toHaveBeenCalledWith("token-1", "school-b");
    expect(teachersApiMock.list).toHaveBeenCalledWith("token-1", "school-b");
  });

  it("returns to search without assigning when 'Back to search' is clicked", async () => {
    const { user } = await selectTeacher();
    await user.click(screen.getByRole("button", { name: "Back to search" }));
    expect(screen.getByPlaceholderText("Search by name, employee number, or email…")).toBeInTheDocument();
    expect(teachersApiMock.addAssignment).not.toHaveBeenCalled();
  });

  it("shows an error and does not call onAssigned when every assignment call fails", async () => {
    const { user, onAssigned } = await selectTeacher();
    teachersApiMock.addAssignment.mockRejectedValue(new ApiError("This teacher is already assigned to that section/subject/year"));

    const [yearSelect, classSelect, sectionSelect] = screen.getAllByRole("combobox");
    await user.selectOptions(yearSelect, "year-1");
    await user.selectOptions(classSelect, "class-1");
    await user.selectOptions(sectionSelect, "section-1");
    await user.click(await screen.findByText("Mathematics"));
    await user.click(screen.getByRole("button", { name: "Assign 1 subject" }));

    expect(await screen.findByText("This teacher is already assigned to that section/subject/year")).toBeInTheDocument();
    expect(onAssigned).not.toHaveBeenCalled();
  });
});
