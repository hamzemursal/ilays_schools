import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { emptyWizardState, type WizardState } from "../types";
import { SubjectsStep } from "./SubjectsStep";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authMock() }));

const apiMock = vi.hoisted(() => ({ listClassSubjects: vi.fn(), listSectionTeacherAssignments: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock }));

const FULL_STATE: WizardState = {
  ...emptyWizardState(),
  classId: "class-1",
  sectionId: "section-1",
  academicYearId: "year-1",
};

function renderStep(state: WizardState = FULL_STATE) {
  return render(<SubjectsStep schoolId="school-1" state={state} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockReturnValue({ accessToken: "token-1" });
});

describe("SubjectsStep — subjects", () => {
  it("shows a skeleton while subjects are loading", () => {
    apiMock.listClassSubjects.mockReturnValue(new Promise(() => {}));
    apiMock.listSectionTeacherAssignments.mockReturnValue(new Promise(() => {}));
    const { container } = renderStep();
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("shows an empty state when the class has no subjects configured", async () => {
    apiMock.listClassSubjects.mockResolvedValue([]);
    apiMock.listSectionTeacherAssignments.mockReturnValue(new Promise(() => {}));
    renderStep();
    expect(await screen.findByText("No subjects configured")).toBeInTheDocument();
  });

  it("renders each subject as a badge", async () => {
    apiMock.listClassSubjects.mockResolvedValue([
      { classId: "class-1", subjectId: "subj-1", subject: { id: "subj-1", name: "Mathematics", code: "MATH" } },
    ]);
    apiMock.listSectionTeacherAssignments.mockReturnValue(new Promise(() => {}));
    renderStep();
    expect(await screen.findByText("Mathematics")).toBeInTheDocument();
  });

  it("treats a student with no class chosen as having no subjects, without calling the API", () => {
    renderStep({ ...FULL_STATE, classId: "" });
    expect(screen.getByText("No subjects configured")).toBeInTheDocument();
    expect(apiMock.listClassSubjects).not.toHaveBeenCalled();
  });
});

describe("SubjectsStep — teachers", () => {
  it("shows an empty state when no teacher is assigned yet", async () => {
    apiMock.listClassSubjects.mockReturnValue(new Promise(() => {}));
    apiMock.listSectionTeacherAssignments.mockResolvedValue([]);
    renderStep();
    expect(await screen.findByText("No teachers assigned yet")).toBeInTheDocument();
  });

  it("renders each teacher assignment as 'Subject — Teacher Name'", async () => {
    apiMock.listClassSubjects.mockReturnValue(new Promise(() => {}));
    apiMock.listSectionTeacherAssignments.mockResolvedValue([
      {
        id: "assign-1",
        subjectId: "subj-1",
        subject: { id: "subj-1", name: "Mathematics", code: "MATH" },
        teacher: { id: "teacher-1", firstName: "Amran", lastName: "Hassan" },
      },
    ]);
    renderStep();
    expect(await screen.findByText("Mathematics — Amran Hassan")).toBeInTheDocument();
  });

  it("does not fetch assignments until class, section, and academic year are all known", () => {
    apiMock.listClassSubjects.mockReturnValue(new Promise(() => {}));
    renderStep({ ...FULL_STATE, sectionId: "" });
    expect(apiMock.listSectionTeacherAssignments).not.toHaveBeenCalled();
  });
});

describe("SubjectsStep — caching", () => {
  it("does not refetch subjects for a class already loaded", async () => {
    apiMock.listClassSubjects.mockResolvedValue([]);
    apiMock.listSectionTeacherAssignments.mockResolvedValue([]);
    const { rerender } = renderStep();
    await screen.findByText("No subjects configured");
    expect(apiMock.listClassSubjects).toHaveBeenCalledTimes(1);

    rerender(<SubjectsStep schoolId="school-1" state={{ ...FULL_STATE }} />);
    expect(apiMock.listClassSubjects).toHaveBeenCalledTimes(1);
  });
});
