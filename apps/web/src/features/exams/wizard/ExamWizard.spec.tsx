import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AcademicYear, ClassWithSections, Subject } from "@/lib/api";
import { ToastProvider } from "@/components/ui/Toast";
import { ExamWizard } from "./ExamWizard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

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
  listAcademicYears: vi.fn(),
  listClasses: vi.fn(),
  listSubjects: vi.fn(),
  listClassSubjects: vi.fn(),
  createExam: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

// The class/subject picker is its own (already-covered) step with async
// fetching — a stand-in that just selects one class and subject keeps this
// test about what it's for: the wizard's own flow and reset behaviour.
vi.mock("./steps/ClassesSubjectsStep", () => ({
  isClassesSubjectsValid: (state: { selectedClassIds: Set<string>; selectedSubjectIds: Set<string> }) =>
    state.selectedClassIds.size > 0 && state.selectedSubjectIds.size > 0,
  ClassesSubjectsStep: ({ onChange }: { onChange: (patch: Record<string, unknown>) => void }) => (
    <button onClick={() => onChange({ selectedClassIds: new Set(["class-1"]), selectedSubjectIds: new Set(["subject-1"]) })}>
      Pick class and subject
    </button>
  ),
}));

const YEAR: AcademicYear = {
  id: "year-1",
  name: "2026-2027",
  startDate: "2026-09-01",
  endDate: "2027-06-30",
  isCurrent: true,
  terms: [
    { id: "term-1", name: "Term 1", weight: 50 },
    { id: "term-2", name: "Term 2", weight: 50 },
  ],
};
const CLASS = { id: "class-1", name: "Form 2", level: 2, division: { id: "d", type: "SECONDARY" }, sections: [], _count: { classSubjects: 1 } } as ClassWithSections;
const SUBJECT: Subject = { id: "subject-1", name: "Mathematics", code: null };

function renderWizard() {
  return render(
    <ToastProvider>
      <ExamWizard schoolId="school-1" />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockReturnValue({ accessToken: "token" });
  apiMock.listAcademicYears.mockResolvedValue([YEAR]);
  apiMock.listClasses.mockResolvedValue([CLASS]);
  apiMock.listSubjects.mockResolvedValue([SUBJECT]);
  apiMock.listClassSubjects.mockResolvedValue([{ classId: "class-1", subjectId: "subject-1", subject: SUBJECT }]);
  apiMock.createExam.mockResolvedValue({ id: "exam-1", name: "Term 2 Exam", examSubjects: [{ classId: "class-1" }] });
});

async function createExamForTerm(user: ReturnType<typeof userEvent.setup>, name: string, termLabel: string) {
  await user.type(screen.getByPlaceholderText("e.g. Term 1 Exam 2027"), name);
  await user.selectOptions(screen.getByLabelText("Term", { exact: false }), termLabel);
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Pick class and subject" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" })); // Exam Settings (Maximum Mark defaults to 100)
  await user.click(screen.getByRole("button", { name: "Create Exam" }));
  await screen.findByText("Exam created");
}

describe("ExamWizard — Term 1 exam / Term 2 exam", () => {
  it("cannot advance until a Term is chosen on purpose — nothing is pre-selected", async () => {
    const user = userEvent.setup();
    renderWizard();
    await screen.findByPlaceholderText("e.g. Term 1 Exam 2027");

    await user.type(screen.getByPlaceholderText("e.g. Term 1 Exam 2027"), "Term 2 Exam");

    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Term", { exact: false }), "term-2");
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("saves the exam under the chosen term (Term 2 stays Term 2)", async () => {
    const user = userEvent.setup();
    renderWizard();
    await screen.findByPlaceholderText("e.g. Term 1 Exam 2027");

    await createExamForTerm(user, "Term 2 Exam", "term-2");

    expect(apiMock.createExam).toHaveBeenCalledWith(
      "token",
      "school-1",
      expect.objectContaining({ termId: "term-2", academicYearId: "year-1", name: "Term 2 Exam" }),
    );
  });

  it("does not send an Exam Type — the term is the only academic period saved", async () => {
    const user = userEvent.setup();
    renderWizard();
    await screen.findByPlaceholderText("e.g. Term 1 Exam 2027");

    await createExamForTerm(user, "Term 1 Exam", "term-1");

    expect(apiMock.createExam.mock.calls[0][2]).not.toHaveProperty("type");
    expect(apiMock.createExam.mock.calls[0][2].termId).toBe("term-1");
  });

  it("Create another starts from a clean form: the previous Term (and name) are NOT kept", async () => {
    const user = userEvent.setup();
    renderWizard();
    await screen.findByPlaceholderText("e.g. Term 1 Exam 2027");
    await createExamForTerm(user, "Term 1 Exam", "term-1");

    await user.click(screen.getByRole("button", { name: "Create another" }));

    // Back on the first step, with nothing carried over.
    expect(await screen.findByText("Basic information")).toBeInTheDocument();
    expect((screen.getByLabelText("Term", { exact: false }) as HTMLSelectElement).value).toBe("");
    expect((screen.getByPlaceholderText("e.g. Term 1 Exam 2027") as HTMLInputElement).value).toBe("");
    // The academic year still defaults to the current one.
    expect((screen.getByLabelText("Academic Year", { exact: false }) as HTMLSelectElement).value).toBe("year-1");
  });

  it("the second exam made via Create another cannot be saved under the old Term by accident — it must be chosen again", async () => {
    const user = userEvent.setup();
    renderWizard();
    await screen.findByPlaceholderText("e.g. Term 1 Exam 2027");
    await createExamForTerm(user, "Term 1 Exam", "term-1");
    await user.click(screen.getByRole("button", { name: "Create another" }));
    await screen.findByText("Basic information");

    await user.type(screen.getByPlaceholderText("e.g. Term 1 Exam 2027"), "Term 2 Exam");
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("Term", { exact: false }), "term-2");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Pick class and subject" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Create Exam" }));

    await waitFor(() => expect(apiMock.createExam).toHaveBeenCalledTimes(2));
    expect(apiMock.createExam.mock.calls[0][2].termId).toBe("term-1");
    expect(apiMock.createExam.mock.calls[1][2].termId).toBe("term-2");
  });
});
