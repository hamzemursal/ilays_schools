import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AcademicYear, ClassWithSections } from "@/lib/api";
import { ToastProvider } from "@/components/ui/Toast";
import { StudentWizard } from "./StudentWizard";

const pushMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

const { ApiError } = vi.hoisted(() => {
  class ApiError extends Error {
    status: number;
    body?: unknown;
    constructor(message: string, status = 400, body?: unknown) {
      super(message);
      this.status = status;
      this.body = body;
    }
  }
  return { ApiError };
});
const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authMock(), ApiError }));

const apiMock = vi.hoisted(() => ({
  listAcademicYears: vi.fn(),
  listClasses: vi.fn(),
  createStudent: vi.fn(),
  uploadStudentPhoto: vi.fn(),
  searchGuardians: vi.fn(),
  listClassSubjects: vi.fn(),
  listSectionTeacherAssignments: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

const YEAR: AcademicYear = { id: "year-1", name: "2027", startDate: "2027-01-01", endDate: "2027-12-31", isCurrent: true, terms: [] };
const CLASS: ClassWithSections = {
  id: "class-1",
  name: "Class 1",
  level: 1,
  division: { id: "div-1", type: "PRIMARY" },
  sections: [{ id: "section-a", name: "A", capacity: 30, _count: { enrollments: 10 } }],
  _count: { classSubjects: 4 },
};

function renderWizard(overrides: Partial<React.ComponentProps<typeof StudentWizard>> = {}) {
  return render(
    <ToastProvider>
      <StudentWizard schoolId="school-1" {...overrides} />
    </ToastProvider>,
  );
}

async function fillPersonalInfo(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("First name", { exact: false }), "Hodan");
  await user.type(screen.getByLabelText("Last name", { exact: false }), "Ali");
  fireEvent.change(screen.getByLabelText("Date of birth", { exact: false }), { target: { value: "2015-05-01" } });
  await user.click(screen.getByRole("button", { name: "Next" }));
}

async function fillEnrollment(user: ReturnType<typeof userEvent.setup>) {
  // Now on the Guardian step — skip straight through.
  await user.click(screen.getByRole("button", { name: "Next" }));
  // Now on Enrollment.
  await user.selectOptions(screen.getByLabelText("Academic year", { exact: false }), "year-1");
  await user.selectOptions(screen.getByLabelText("Class", { exact: false }), "class-1");
  await user.click(screen.getByRole("button", { name: "Next" }));
}

async function goToReview(user: ReturnType<typeof userEvent.setup>) {
  await fillPersonalInfo(user);
  await fillEnrollment(user);
  // Now on Subjects — nothing required, continue.
  await user.click(screen.getByRole("button", { name: "Next" }));
  // Now on Review.
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockReturnValue({ accessToken: "token-1" });
  apiMock.listAcademicYears.mockResolvedValue([YEAR]);
  apiMock.listClasses.mockResolvedValue([CLASS]);
  apiMock.listClassSubjects.mockResolvedValue([]);
  apiMock.listSectionTeacherAssignments.mockResolvedValue([]);
});

describe("StudentWizard — initial load", () => {
  it("loads academic years and classes scoped to the school", async () => {
    renderWizard();
    await waitFor(() => expect(apiMock.listAcademicYears).toHaveBeenCalledWith("token-1", "school-1"));
    expect(apiMock.listClasses).toHaveBeenCalledWith("token-1", "school-1");
  });

  it("preselects the current academic year once loaded", async () => {
    const user = userEvent.setup();
    renderWizard();
    await screen.findByText("Personal information");
    await fillPersonalInfo(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByLabelText("Academic year", { exact: false })).toHaveValue("year-1");
  });

  it("preselects a class and section given initialClassId/initialSectionId", async () => {
    const user = userEvent.setup();
    renderWizard({ initialClassId: "class-1", initialSectionId: "section-a" });
    await screen.findByText("Personal information");
    await fillPersonalInfo(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByLabelText("Class", { exact: false })).toHaveValue("class-1");
  });

  it("shows an error instead of the wizard when the initial load fails", async () => {
    apiMock.listAcademicYears.mockRejectedValue(new ApiError("School not found"));
    renderWizard();
    expect(await screen.findByText("School not found")).toBeInTheDocument();
  });
});

describe("StudentWizard — step navigation", () => {
  it("disables Next on the Personal step until first name, last name, and DOB are set", async () => {
    renderWizard();
    expect(await screen.findByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("disables Back on the first step", async () => {
    renderWizard();
    await screen.findByRole("button", { name: "Next" });
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
  });

  it("advances through steps in order as each is completed", async () => {
    const user = userEvent.setup();
    renderWizard();
    await screen.findByText("Personal information");
    await fillPersonalInfo(user);
    expect(screen.getByText("Parent / guardian")).toBeInTheDocument();
  });

  it("disables Next on the Enrollment step until year, class, and section are chosen", async () => {
    const user = userEvent.setup();
    renderWizard();
    await screen.findByText("Personal information");
    await fillPersonalInfo(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Academic enrollment")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("lets Back return to the previous step", async () => {
    const user = userEvent.setup();
    renderWizard();
    await screen.findByText("Personal information");
    await fillPersonalInfo(user);
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Personal information")).toBeInTheDocument();
  });

  it("reaches Review with a Create student button as the final action", async () => {
    const user = userEvent.setup();
    renderWizard();
    await screen.findByText("Personal information");
    await goToReview(user);
    expect(screen.getByText("Review & confirm")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create student" })).toBeInTheDocument();
  });
});

describe("StudentWizard — submission", () => {
  it("creates the student and shows the success screen with the assigned code and roll number", async () => {
    const user = userEvent.setup();
    apiMock.createStudent.mockResolvedValue({
      student: { id: "stu-1" },
      enrollment: { studentNumber: "STU-2027-00042", rollNumber: 7 },
    });
    renderWizard();
    await screen.findByText("Personal information");
    await goToReview(user);
    await user.click(screen.getByRole("button", { name: "Create student" }));

    expect(await screen.findByText("Student created")).toBeInTheDocument();
    expect(screen.getByText("STU-2027-00042")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(apiMock.createStudent).toHaveBeenCalledWith(
      "token-1",
      "school-1",
      expect.objectContaining({ firstName: "Hodan", lastName: "Ali", confirmDespiteDuplicates: false }),
    );
  });

  it("navigates to the new student's profile from the success screen", async () => {
    const user = userEvent.setup();
    apiMock.createStudent.mockResolvedValue({
      student: { id: "stu-1" },
      enrollment: { studentNumber: "STU-2027-00042", rollNumber: 7 },
    });
    renderWizard();
    await screen.findByText("Personal information");
    await goToReview(user);
    await user.click(screen.getByRole("button", { name: "Create student" }));
    await user.click(await screen.findByRole("button", { name: "View student profile" }));
    expect(pushMock).toHaveBeenCalledWith("/schools/school-1/students/stu-1");
  });

  it("shows a submit error and stays on the wizard for a non-duplicate failure", async () => {
    const user = userEvent.setup();
    apiMock.createStudent.mockRejectedValue(new ApiError("Something went wrong"));
    renderWizard();
    await screen.findByText("Personal information");
    await goToReview(user);
    await user.click(screen.getByRole("button", { name: "Create student" }));
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Review & confirm")).toBeInTheDocument();
  });

  it("shows a toast but still succeeds when the photo upload fails after creation", async () => {
    const user = userEvent.setup();
    URL.createObjectURL = vi.fn(() => "blob:preview");
    apiMock.uploadStudentPhoto.mockRejectedValue(new Error("upload failed"));
    apiMock.createStudent.mockResolvedValue({
      student: { id: "stu-1" },
      enrollment: { studentNumber: "STU-2027-00042", rollNumber: 7 },
    });
    renderWizard();
    await screen.findByText("Personal information");

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, new File(["bytes"], "photo.png", { type: "image/png" }));
    await fillPersonalInfo(user);
    await fillEnrollment(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Create student" }));

    expect(await screen.findByText("Student created, but the photo failed to upload. You can add it from the profile.")).toBeInTheDocument();
  });
});

describe("StudentWizard — duplicate detection", () => {
  it("shows possible duplicates instead of the success screen on a 409 with candidates", async () => {
    const user = userEvent.setup();
    apiMock.createStudent.mockRejectedValue(
      new ApiError("Conflict", 409, {
        possibleDuplicates: [{ id: "dup-1", firstName: "Hodan", lastName: "Ali", dateOfBirth: "2015-05-01", legacyStudentNumber: null }],
      }),
    );
    renderWizard();
    await screen.findByText("Personal information");
    await goToReview(user);
    await user.click(screen.getByRole("button", { name: "Create student" }));

    expect(await screen.findByText("1 similar student already exist")).toBeInTheDocument();
    expect(screen.getAllByText(/Hodan Ali/).length).toBeGreaterThan(0);
  });

  it("returns to the wizard from 'Go back and check'", async () => {
    const user = userEvent.setup();
    apiMock.createStudent.mockRejectedValue(
      new ApiError("Conflict", 409, {
        possibleDuplicates: [{ id: "dup-1", firstName: "Hodan", lastName: "Ali", dateOfBirth: "2015-05-01", legacyStudentNumber: null }],
      }),
    );
    renderWizard();
    await screen.findByText("Personal information");
    await goToReview(user);
    await user.click(screen.getByRole("button", { name: "Create student" }));
    await user.click(await screen.findByRole("button", { name: "Go back and check" }));
    expect(screen.getByText("Review & confirm")).toBeInTheDocument();
  });

  it("creates anyway with confirmDespiteDuplicates when the admin confirms", async () => {
    const user = userEvent.setup();
    apiMock.createStudent
      .mockRejectedValueOnce(
        new ApiError("Conflict", 409, {
          possibleDuplicates: [{ id: "dup-1", firstName: "Hodan", lastName: "Ali", dateOfBirth: "2015-05-01", legacyStudentNumber: null }],
        }),
      )
      .mockResolvedValueOnce({ student: { id: "stu-1" }, enrollment: { studentNumber: "STU-2027-00042", rollNumber: 7 } });
    renderWizard();
    await screen.findByText("Personal information");
    await goToReview(user);
    await user.click(screen.getByRole("button", { name: "Create student" }));
    await user.click(await screen.findByRole("button", { name: "This is a different person — create anyway" }));

    expect(await screen.findByText("Student created")).toBeInTheDocument();
    expect(apiMock.createStudent).toHaveBeenLastCalledWith(
      "token-1",
      "school-1",
      expect.objectContaining({ confirmDespiteDuplicates: true }),
    );
  });
});
