import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { StudentEnrollmentRecord } from "@/lib/api";
import { AcademicHistoryTimeline } from "./AcademicHistoryTimeline";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

function enrollment(overrides: Partial<StudentEnrollmentRecord> = {}): StudentEnrollmentRecord {
  return {
    id: "enr-2027",
    studentNumber: "STU-2027-00001",
    rollNumber: 3,
    status: "ACTIVE",
    startDate: "2027-01-01",
    endDate: null,
    school: { id: "school-1", name: "Saamalay Secondary" },
    academicYear: { id: "year-2027", name: "2027", isCurrent: true },
    class: { id: "class-form3", name: "Form 3" },
    section: { id: "section-a", name: "A" },
    ...overrides,
  };
}

const CURRENT = enrollment();
const PREVIOUS = enrollment({
  id: "enr-2026",
  status: "PROMOTED",
  academicYear: { id: "year-2026", name: "2026", isCurrent: false },
  class: { id: "class-form2", name: "Form 2" },
  section: { id: "section-b", name: "B" },
});

function renderTimeline(props: Partial<Parameters<typeof AcademicHistoryTimeline>[0]> = {}) {
  return render(
    <AcademicHistoryTimeline
      enrollments={[CURRENT, PREVIOUS]}
      schoolId="school-1"
      studentId="stu-1"
      canViewResults
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AcademicHistoryTimeline — Current Year / Previous Year labeling", () => {
  it("marks the current-year enrollment as Current Year and others as Previous Year", () => {
    renderTimeline();
    expect(screen.getByText("Current Year")).toBeInTheDocument();
    expect(screen.getByText("Previous Year")).toBeInTheDocument();
  });

  it("shows an empty state when there is no enrollment at all", () => {
    renderTimeline({ enrollments: [] });
    expect(screen.getByText("No enrollment history yet")).toBeInTheDocument();
  });
});

describe("AcademicHistoryTimeline — View Results navigation", () => {
  it("hides the View Results link entirely without canViewResults", () => {
    renderTimeline({ canViewResults: false });
    expect(screen.queryByRole("link", { name: "View Results" })).not.toBeInTheDocument();
  });

  it("links each row's View Results to the dedicated results page for THAT enrollment's own academic year", () => {
    renderTimeline();
    const links = screen.getAllByRole("link", { name: "View Results" });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "/schools/school-1/students/stu-1/results/year-2027");
    expect(links[1]).toHaveAttribute("href", "/schools/school-1/students/stu-1/results/year-2026");
  });

  it("never renders any results content inline — the page itself only links out", () => {
    renderTimeline();
    expect(screen.queryByText(/Annual result/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Results not published/)).not.toBeInTheDocument();
  });

  it("builds the results link off the CURRENTLY browsed school, not a past enrollment's own (possibly different) school", () => {
    const transferredPrevious = enrollment({
      id: "enr-old-school",
      academicYear: { id: "year-2025", name: "2025", isCurrent: false },
      school: { id: "school-OLD", name: "Old School" },
    });
    renderTimeline({ enrollments: [CURRENT, transferredPrevious], schoolId: "school-1" });
    const links = screen.getAllByRole("link", { name: "View Results" });
    expect(links[1]).toHaveAttribute("href", "/schools/school-1/students/stu-1/results/year-2025");
  });
});
