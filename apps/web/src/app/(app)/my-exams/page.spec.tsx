import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MyExamRow } from "@/lib/api";
import MyExamsPage from "./page";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authMock(), ApiError: Error }));
const apiMock = vi.hoisted(() => ({ listMyExams: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock }));

function row(over: Partial<MyExamRow>): MyExamRow {
  return {
    examSubjectId: "es-1",
    examId: "ex-1",
    examName: "TERM 1 EXAMS",
    examType: "FINAL",
    schoolId: "school-1",
    academicYearId: "y1",
    academicYearName: "2025-2026",
    classId: "c3",
    className: "Form 3",
    sectionId: "s3a",
    sectionName: "A",
    subjectId: "sub-fa",
    subjectName: "FA",
    examDate: "2025-09-14",
    maxMarks: 100,
    paperStatus: null,
    resultsStatus: "PUBLISHED",
    lastUpdated: "2025-09-20",
    ...over,
  };
}

const ROWS = [
  row({ examSubjectId: "es-1" }),
  row({ examSubjectId: "es-2", subjectId: "sub-it", subjectName: "IT", resultsStatus: "DRAFT" }),
  row({ examSubjectId: "es-3", classId: "c2", className: "Form 2", sectionId: "s2a", subjectId: "sub-isl", subjectName: "ISLAMIC", resultsStatus: "SUBMITTED" }),
];

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockReturnValue({ accessToken: "t" });
  apiMock.listMyExams.mockResolvedValue(ROWS);
});

describe("My Exams — grouped by class", () => {
  it("shows each class·section in its own group, with the same actions as before", async () => {
    render(<MyExamsPage />);

    const form3 = await screen.findByRole("region", { name: "Form 3 · A" });
    const form2 = screen.getByRole("region", { name: "Form 2 · A" });
    expect(within(form3).getAllByRole("row")).toHaveLength(3); // header + 2 exams
    expect(within(form2).getByText("ISLAMIC")).toBeInTheDocument();

    const draftRow = within(form3).getByText("IT").closest("tr")!;
    expect(within(draftRow).getByRole("link", { name: /Enter Results/ })).toHaveAttribute(
      "href",
      "/schools/school-1/exam-subjects/es-2/sections/s3a/results",
    );
    expect(within(draftRow).getByRole("link", { name: /Upload Paper/ })).toHaveAttribute("href", "/my-exams/es-2/sections/s3a/paper");
  });

  it("filters to one class with the class chips", async () => {
    render(<MyExamsPage />);
    await screen.findByRole("region", { name: "Form 3 · A" });

    await userEvent.click(screen.getByRole("button", { name: /^Form 2 · A/ }));
    expect(screen.queryByRole("region", { name: "Form 3 · A" })).toBeNull();
    expect(screen.getByRole("region", { name: "Form 2 · A" })).toBeInTheDocument();
    expect(screen.getByText("1 of 3 exam(s)")).toBeInTheDocument();
  });

  it("filters by what the teacher still has to do", async () => {
    render(<MyExamsPage />);
    await screen.findByRole("region", { name: "Form 3 · A" });

    const needResults = screen.getByRole("button", { name: /Need results/ });
    expect(needResults).toHaveTextContent("1");
    await userEvent.click(needResults);

    expect(screen.getAllByText("IT").length).toBeGreaterThan(0);
    // The FA exam (published) is filtered out of the table; only the Subject filter still lists FA.
    expect(screen.queryByRole("cell", { name: "FA" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Form 2 · A" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /Clear filters/ }));
    expect(screen.getByText("3 of 3 exam(s)")).toBeInTheDocument();
  });

  it("searches exams, subjects and classes", async () => {
    render(<MyExamsPage />);
    await screen.findByRole("region", { name: "Form 3 · A" });
    await userEvent.type(screen.getByLabelText("Search"), "islamic");
    expect(screen.getByText("1 of 3 exam(s)")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Form 2 · A" })).toBeInTheDocument();
  });
});
