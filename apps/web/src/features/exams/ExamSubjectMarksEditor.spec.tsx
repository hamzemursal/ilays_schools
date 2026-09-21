import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Exam } from "@/lib/api";
import { ToastProvider } from "@/components/ui/Toast";
import { ExamSubjectMarksEditor, marksConfigError } from "./ExamSubjectMarksEditor";

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

const apiMock = vi.hoisted(() => ({ updateExamSubject: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock }));

const SUBJECT: Exam["examSubjects"][number] = {
  id: "es-1",
  classId: "class-1",
  subjectId: "sub-1",
  maxMarks: 100,
  passingMark: 40,
  examDate: null,
  class: { id: "class-1", name: "Form 2" },
  subject: { id: "sub-1", name: "Physics" },
};

function renderEditor(onUpdated = vi.fn()) {
  render(
    <ToastProvider>
      <ExamSubjectMarksEditor schoolId="school-1" accessToken="token" examId="exam-1" examSubject={SUBJECT} onUpdated={onUpdated} />
    </ToastProvider>,
  );
  return onUpdated;
}

beforeEach(() => vi.clearAllMocks());

describe("marksConfigError — the same rules the server enforces", () => {
  it("maximum marks must be a whole number above 0 (and at most 1000)", () => {
    expect(marksConfigError("", "")).not.toBeNull();
    expect(marksConfigError("0", "")).not.toBeNull();
    expect(marksConfigError("-5", "")).not.toBeNull();
    expect(marksConfigError("50.5", "")).not.toBeNull();
    expect(marksConfigError("1001", "")).not.toBeNull();
    expect(marksConfigError("1", "")).toBeNull();
    expect(marksConfigError("1000", "")).toBeNull();
  });

  it("pass mark is optional, 0 or more, and never above the maximum", () => {
    expect(marksConfigError("100", "")).toBeNull();
    expect(marksConfigError("100", "0")).toBeNull();
    expect(marksConfigError("100", "100")).toBeNull();
    expect(marksConfigError("100", "101")).toBe("Pass mark can't be higher than the maximum marks.");
    expect(marksConfigError("100", "-1")).not.toBeNull();
    expect(marksConfigError("100", "39.5")).not.toBeNull();
  });
});

describe("ExamSubjectMarksEditor", () => {
  it("opens with the current maximum and pass mark", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Edit marks for Form 2 Physics" }));

    expect(screen.getByLabelText("Maximum marks for Form 2 Physics")).toHaveValue(100);
    expect(screen.getByLabelText("Pass mark for Form 2 Physics")).toHaveValue(40);
  });

  it("saves the new maximum and pass mark for exactly this exam subject and reports the update", async () => {
    const user = userEvent.setup();
    apiMock.updateExamSubject.mockResolvedValue({ ...SUBJECT, maxMarks: 50, passingMark: 25 });
    const onUpdated = renderEditor();
    await user.click(screen.getByRole("button", { name: "Edit marks for Form 2 Physics" }));

    await user.clear(screen.getByLabelText("Maximum marks for Form 2 Physics"));
    await user.type(screen.getByLabelText("Maximum marks for Form 2 Physics"), "50");
    await user.clear(screen.getByLabelText("Pass mark for Form 2 Physics"));
    await user.type(screen.getByLabelText("Pass mark for Form 2 Physics"), "25");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(apiMock.updateExamSubject).toHaveBeenCalledWith("token", "school-1", "exam-1", "es-1", { maxMarks: 50, passingMark: 25 });
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ id: "es-1", maxMarks: 50, passingMark: 25 }));
  });

  it("clearing the pass mark sends null", async () => {
    const user = userEvent.setup();
    apiMock.updateExamSubject.mockResolvedValue({ ...SUBJECT, passingMark: null });
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Edit marks for Form 2 Physics" }));

    await user.clear(screen.getByLabelText("Pass mark for Form 2 Physics"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(apiMock.updateExamSubject).toHaveBeenCalledWith("token", "school-1", "exam-1", "es-1", { maxMarks: 100, passingMark: null });
  });

  it("blocks Save and explains when the pass mark is above the maximum — nothing is sent", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Edit marks for Form 2 Physics" }));

    await user.clear(screen.getByLabelText("Pass mark for Form 2 Physics"));
    await user.type(screen.getByLabelText("Pass mark for Form 2 Physics"), "150");

    expect(screen.getByText("Pass mark can't be higher than the maximum marks.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(apiMock.updateExamSubject).not.toHaveBeenCalled();
  });

  it("shows the server's refusal (e.g. results already published) and stays open", async () => {
    const user = userEvent.setup();
    apiMock.updateExamSubject.mockRejectedValue(new ApiError("Maximum marks can't be changed once results are approved or published"));
    const onUpdated = renderEditor();
    await user.click(screen.getByRole("button", { name: "Edit marks for Form 2 Physics" }));

    await user.clear(screen.getByLabelText("Maximum marks for Form 2 Physics"));
    await user.type(screen.getByLabelText("Maximum marks for Form 2 Physics"), "200");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/can't be changed once results are approved or published/)).toBeInTheDocument();
    expect(onUpdated).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Maximum marks for Form 2 Physics")).toBeInTheDocument();
  });

  it("Cancel closes without saving", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Edit marks for Form 2 Physics" }));

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(apiMock.updateExamSubject).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Edit marks for Form 2 Physics" })).toBeInTheDocument();
  });
});
