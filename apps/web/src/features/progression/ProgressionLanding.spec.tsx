import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { AcademicYear, ProgressionOverview, ProgressionOverviewClass } from "@/lib/api";
import { ProgressionLanding, progressionStatus } from "./ProgressionLanding";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authMock(), ApiError: Error }));
const apiMock = vi.hoisted(() => ({ listAcademicYears: vi.fn(), getProgressionOverview: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock }));

const YEARS: AcademicYear[] = [
  { id: "y1", name: "2025-2026", startDate: "2025-09-01", endDate: "2026-06-30", isCurrent: true, terms: [] },
];

function cls(over: Partial<ProgressionOverviewClass>): ProgressionOverviewClass {
  return {
    id: "c",
    name: "Class",
    level: 1,
    divisionType: "PRIMARY",
    isFinal: false,
    sections: [{ id: "s", name: "A", activeCount: 0, progressedCount: 0 }],
    activeCount: 0,
    progressedCount: 0,
    ...over,
  };
}

const OVERVIEW: ProgressionOverview = {
  academicYear: { id: "y1", name: "2025-2026" },
  classes: [
    cls({ id: "c1", name: "Class 1", level: 1, activeCount: 32 }),
    cls({ id: "c8", name: "Class 8", level: 8, isFinal: true, activeCount: 30 }),
    cls({ id: "f2", name: "Form 2", level: 2, divisionType: "SECONDARY", activeCount: 5, progressedCount: 20 }),
    cls({ id: "f4", name: "Form 4", level: 4, divisionType: "SECONDARY", isFinal: true, activeCount: 0, progressedCount: 34 }),
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockReturnValue({ accessToken: "token" });
  apiMock.listAcademicYears.mockResolvedValue(YEARS);
  apiMock.getProgressionOverview.mockResolvedValue(OVERVIEW);
});

describe("Year-End Progression landing", () => {
  it("derives the status from real counts only", () => {
    expect(progressionStatus({ activeCount: 0, progressedCount: 0 })).toBe("NOT_STARTED");
    expect(progressionStatus({ activeCount: 10, progressedCount: 0 })).toBe("READY");
    expect(progressionStatus({ activeCount: 3, progressedCount: 7 })).toBe("NEEDS_DECISIONS");
    expect(progressionStatus({ activeCount: 0, progressedCount: 7 })).toBe("COMPLETED");
  });

  it("groups class cards by division, flags the final classes, and links each to its workflow", async () => {
    render(<ProgressionLanding schoolId="school-1" />);

    const primary = await screen.findByRole("region", { name: "Primary" });
    const secondary = screen.getByRole("region", { name: "Secondary" });

    const class8 = within(primary).getByRole("link", { name: /Class 8/ });
    expect(class8).toHaveAttribute("href", "/schools/school-1/promotions/class-8?academicYearId=y1");
    expect(within(class8).getByText("Final class")).toBeInTheDocument();
    expect(within(class8).getByText("Ready")).toBeInTheDocument();

    expect(within(primary).getByRole("link", { name: /Class 1/ })).toHaveAttribute(
      "href",
      "/schools/school-1/promotions/promote?academicYearId=y1&classId=c1",
    );
    expect(within(secondary).getByRole("link", { name: /Form 2/ })).toHaveTextContent("Needs Decisions");

    // A finished class is not a link any more.
    expect(within(secondary).queryByRole("link", { name: /Form 4/ })).toBeNull();
    expect(within(secondary).getByText("Form 4").closest(".rounded-xl")).toHaveTextContent("Completed");
  });
});
