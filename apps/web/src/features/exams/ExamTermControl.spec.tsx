import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AcademicYear, Exam } from "@/lib/api";
import { ToastProvider } from "@/components/ui/Toast";
import { ExamTermControl } from "./ExamTermControl";

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

const apiMock = vi.hoisted(() => ({ updateExamTerm: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock }));

const YEARS: AcademicYear[] = [
  {
    id: "year-1",
    name: "2026-2027",
    startDate: "2026-09-01",
    endDate: "2027-06-30",
    isCurrent: true,
    terms: [
      { id: "term-1", name: "Term 1", weight: 50 },
      { id: "term-2", name: "Term 2", weight: 50 },
    ],
  },
];

function exam(overrides: Partial<Exam> = {}): Exam {
  return {
    id: "exam-1",
    name: "Second Exam",
    type: "MIDTERM",
    academicYearId: "year-1",
    termId: "term-1",
    term: { id: "term-1", name: "Term 1" },
    startDate: null,
    endDate: null,
    description: null,
    examSubjects: [],
    ...overrides,
  } as Exam;
}

function renderControl(e: Exam, canManage = true, onChanged = vi.fn()) {
  render(
    <ToastProvider>
      <ExamTermControl schoolId="school-1" accessToken="token" exam={e} years={YEARS} canManage={canManage} onChanged={onChanged} />
    </ToastProvider>,
  );
  return { onChanged };
}

beforeEach(() => vi.clearAllMocks());

describe("ExamTermControl", () => {
  it("shows which term an exam belongs to", () => {
    renderControl(exam(), false);
    expect(screen.getByText("Term 1")).toBeInTheDocument();
  });

  it("flags a legacy exam with no term instead of hiding it", () => {
    renderControl(exam({ termId: null, term: null }), false);
    expect(screen.getByText("No term assigned")).toBeInTheDocument();
  });

  it("offers exactly the year's two terms to an admin — never a third", () => {
    renderControl(exam());
    const select = screen.getByLabelText("Term for Second Exam") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(["Term 1", "Term 2"]);
  });

  it("gives read-only viewers no way to change the term", () => {
    renderControl(exam(), false);
    expect(screen.queryByLabelText("Term for Second Exam")).not.toBeInTheDocument();
  });

  it("moving an exam to Term 2 asks for confirmation, then saves and reports the new term", async () => {
    apiMock.updateExamTerm.mockResolvedValue({ id: "exam-1", termId: "term-2", term: { id: "term-2", name: "Term 2" } });
    const user = userEvent.setup();
    const { onChanged } = renderControl(exam());

    await user.selectOptions(screen.getByLabelText("Term for Second Exam"), "term-2");
    expect(apiMock.updateExamTerm).not.toHaveBeenCalled();
    expect(screen.getByText(/count toward Term 2 in every student's Annual Result/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Move to Term 2" }));

    await waitFor(() => expect(apiMock.updateExamTerm).toHaveBeenCalledWith("token", "school-1", "exam-1", { termId: "term-2" }));
    expect(onChanged).toHaveBeenCalledWith({ id: "term-2", name: "Term 2" });
  });

  it("cancelling the confirmation changes nothing", async () => {
    const user = userEvent.setup();
    const { onChanged } = renderControl(exam());

    await user.selectOptions(screen.getByLabelText("Term for Second Exam"), "term-2");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(apiMock.updateExamTerm).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("assigning a term to a legacy exam works the same way", async () => {
    apiMock.updateExamTerm.mockResolvedValue({ id: "exam-1", termId: "term-1", term: { id: "term-1", name: "Term 1" } });
    const user = userEvent.setup();
    const { onChanged } = renderControl(exam({ termId: null, term: null }));

    await user.selectOptions(screen.getByLabelText("Term for Second Exam"), "term-1");
    await user.click(screen.getByRole("button", { name: "Move to Term 1" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledWith({ id: "term-1", name: "Term 1" }));
  });
});
