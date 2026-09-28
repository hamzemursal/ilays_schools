import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AcademicYear, PromotionPreview, ProgressionOverview } from "@/lib/api";
import { Form4Graduation } from "./Form4Graduation";

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
  getProgressionOverview: vi.fn(),
  previewPromotion: vi.fn(),
  confirmPromotion: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

const YEARS: AcademicYear[] = [
  { id: "y1", name: "2025-2026", startDate: "2025-09-01", endDate: "2026-06-30", isCurrent: true, terms: [] },
];
const OVERVIEW: ProgressionOverview = {
  academicYear: { id: "y1", name: "2025-2026" },
  classes: [
    {
      id: "f4",
      name: "Form 4",
      level: 4,
      divisionType: "SECONDARY",
      isFinal: true,
      sections: [
        { id: "f4-a", name: "A", activeCount: 2, progressedCount: 0 },
        { id: "f4-b", name: "B", activeCount: 1, progressedCount: 0 },
        { id: "f4-c", name: "C", activeCount: 1, progressedCount: 0 },
      ],
      activeCount: 4,
      progressedCount: 0,
    },
  ],
};

function student(id: string, first: string, eligible: boolean | null): PromotionPreview["students"][number] {
  const pct = eligible === null ? null : eligible ? 70 : 40;
  return {
    studentId: `st-${id}`,
    enrollmentId: `enr-${id}`,
    firstName: first,
    lastName: "Test",
    rollNumber: 1,
    studentNumber: `STU-${id}`,
    term1Percentage: pct,
    term2Percentage: pct,
    annualPercentage: pct,
    eligible,
    suggestedOutcome: eligible === null ? null : eligible ? "GRADUATED" : "RETAINED",
  };
}

function preview(students: PromotionPreview["students"], withNextYear = true): PromotionPreview {
  return {
    naturalOutcome: "GRADUATED",
    currentClass: { id: "f4", name: "Form 4" },
    nextClass: null,
    retainedClass: withNextYear ? { id: "f4-next", name: "Form 4" } : null,
    targetAcademicYear: withNextYear ? { id: "y2", name: "2026-2027" } : null,
    currentClassSections: withNextYear ? [{ id: "f4n-a", name: "A", capacity: null, currentActive: 0, available: null }] : [],
    nextClassSections: [],
    warnings: [],
    students,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockReturnValue({ accessToken: "token", user: { schools: [{ id: "school-1", name: "Ilays Secondary" }] } });
  apiMock.listAcademicYears.mockResolvedValue(YEARS);
  apiMock.getProgressionOverview.mockResolvedValue(OVERVIEW);
  apiMock.previewPromotion.mockImplementation((_t: string, _s: string, sectionId: string) =>
    Promise.resolve(
      sectionId === "f4-a"
        ? preview([student("1", "Amina", true), student("2", "Bashir", false)])
        : sectionId === "f4-b"
          ? preview([student("3", "Caalo", true)])
          : preview([student("4", "Deeqa", true)]),
    ),
  );
  apiMock.confirmPromotion.mockResolvedValue({ id: "batch", items: [] });
});

async function openReview() {
  render(<Form4Graduation schoolId="school-1" />);
  await userEvent.click(await screen.findByRole("button", { name: /Review 3 sections/ }));
  await screen.findByRole("radiogroup", { name: "Outcome for Amina Test" });
}

describe("Form 4 Graduation", () => {
  it("selects every Form 4 section by default and shows all their students in one table", async () => {
    await openReview();
    expect(apiMock.previewPromotion).toHaveBeenCalledTimes(3);
    for (const name of ["Amina", "Bashir", "Caalo", "Deeqa"]) {
      expect(screen.getByRole("radiogroup", { name: `Outcome for ${name} Test` })).toBeInTheDocument();
    }
    expect(screen.getAllByText("Graduated → Alumni")).toHaveLength(3);
    const bashir = screen.getByRole("radiogroup", { name: "Outcome for Bashir Test" });
    expect(within(bashir).getByRole("radio", { name: "Retain" })).toHaveAttribute("aria-checked", "true");
    expect(within(bashir).getByRole("radio", { name: "Graduate" })).toBeDisabled();
  });

  it("states the outcome plainly on review, and sends no destination for graduates", async () => {
    await openReview();
    await userEvent.click(screen.getByRole("button", { name: "Review" }));

    expect(screen.getByTestId("graduation-statement")).toHaveTextContent(
      "3 students will graduate and become Alumni. 1 student will repeat Form 4 in 2026-2027. No Form 5 will be created.",
    );

    await userEvent.click(screen.getByRole("button", { name: "Confirm graduation" }));
    await screen.findByText("Graduation complete");

    expect(apiMock.confirmPromotion).toHaveBeenCalledWith("token", "school-1", "f4-a", {
      fromAcademicYearId: "y1",
      toAcademicYearId: "y2",
      assignments: [
        { enrollmentId: "enr-1", outcome: "GRADUATED" },
        { enrollmentId: "enr-2", outcome: "RETAINED", targetSectionId: "f4n-a" },
      ],
    });
    // A graduation-only section needs no destination year at all.
    expect(apiMock.confirmPromotion).toHaveBeenCalledWith("token", "school-1", "f4-b", {
      fromAcademicYearId: "y1",
      toAcademicYearId: undefined,
      assignments: [{ enrollmentId: "enr-3", outcome: "GRADUATED" }],
    });
    expect(screen.getByRole("link", { name: /View Alumni/ })).toHaveAttribute("href", "/schools/school-1/alumni");
  });

  it("graduates without any next academic year — only retention needs one", async () => {
    apiMock.previewPromotion.mockImplementation((_t: string, _s: string, sectionId: string) =>
      Promise.resolve(preview(sectionId === "f4-a" ? [student("1", "Amina", true)] : [], false)),
    );
    await openReview();
    expect(screen.getByRole("button", { name: "Review" })).toBeEnabled();

    await userEvent.click(within(screen.getByRole("radiogroup", { name: "Outcome for Amina Test" })).getByRole("radio", { name: "Retain" }));
    expect(screen.getByText(/Retaining needs the next academic year/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review" })).toBeDisabled();
  });

  it("stops at a failing section and reports what was saved", async () => {
    apiMock.confirmPromotion
      .mockResolvedValueOnce({ id: "b1", items: [] })
      .mockRejectedValueOnce(new ApiError("Target section A doesn't have room"));
    await openReview();
    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm graduation" }));

    expect(await screen.findByText("Graduation partly complete")).toBeInTheDocument();
    expect(screen.getByText("Section B was not graduated.")).toBeInTheDocument();
    expect(screen.getByText(/Sections A were saved/)).toBeInTheDocument();
    expect(apiMock.confirmPromotion).toHaveBeenCalledTimes(2);
  });
});
