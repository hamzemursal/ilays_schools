import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { Suspense } from "react";
import type { DashboardSummary } from "@/lib/api";
import SchoolDashboardPage from "./page";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authMock(), ApiError: Error }));
const apiMock = vi.hoisted(() => ({ getDashboardSummary: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock }));

const SUMMARY: DashboardSummary = {
  academicYear: { id: "y2", name: "2029-2030" },
  academicYears: [
    { id: "y1", name: "2028-2029", isCurrent: false },
    { id: "y2", name: "2029-2030", isCurrent: true },
  ],
  counts: { students: 2, teachers: 7, classes: 2, sections: 2, subjects: 9 },
  enrollment: { total: 2, male: 0, female: 2 },
  teachers: { active: 7, inactive: 0 },
  attendanceToday: { marked: 0, present: 0, absent: 0, late: 0, excused: 0, percent: null },
  outstandingFeesTotal: 0,
  outstandingInvoiceCount: 0,
  setup: {
    academicYear: true,
    classes: true,
    sections: true,
    subjects: true,
    teacherAssignments: true,
    studentEnrollment: true,
    progressPercent: 100,
  } as DashboardSummary["setup"],
};

function user(permissions: string[]) {
  return { id: "u", email: "swl@gmail.com", roles: ["SCHOOL_ADMIN"], permissions, schools: [{ id: "s1", name: "SYL Schools", logoUrl: null }] };
}

async function renderPage() {
  const params = Promise.resolve({ id: "s1" });
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <SchoolDashboardPage params={params} />
      </Suspense>,
    );
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.getDashboardSummary.mockResolvedValue(SUMMARY);
});

describe("School dashboard", () => {
  it("shows the real summary numbers in the KPI cards and panels", async () => {
    authMock.mockReturnValue({ accessToken: "t", user: user(["students.view", "teachers.view", "academic.view"]) });
    await renderPage();

    expect(screen.getByRole("heading", { name: /Welcome back, SYL Schools/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Students: 2/ })).toHaveAttribute("href", "/schools/s1/students");
    expect(screen.getByRole("link", { name: /Teachers: 7/ })).toHaveAttribute("href", "/schools/s1/teachers");
    const enrollment = screen.getByRole("region", { name: "Student enrollment" });
    expect(enrollment).toHaveTextContent("Active enrollment for 2029-2030");
    expect(within(screen.getByRole("region", { name: "Academic" })).getByText("9")).toBeInTheDocument();
    expect(screen.getByTestId("outstanding-fees")).toHaveTextContent("$0.00");
    expect(screen.getByLabelText("Academic year")).toHaveValue("y2");
  });

  it("links only to pages the user may open (same rules as the sidebar)", async () => {
    authMock.mockReturnValue({ accessToken: "t", user: user(["students.view"]) });
    await renderPage();

    expect(within(screen.getByRole("region", { name: "Student enrollment" })).getByRole("link", { name: /View Details/ })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Teachers" })).queryByRole("link")).toBeNull();
    expect(within(screen.getByRole("region", { name: "Outstanding fees" })).queryByRole("link")).toBeNull();
    expect(screen.queryByRole("link", { name: /Teachers: 7/ })).toBeNull();
  });
});
