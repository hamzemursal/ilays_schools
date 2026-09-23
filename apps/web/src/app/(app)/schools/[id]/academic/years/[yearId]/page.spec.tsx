import { Suspense } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import type { AcademicYear, ClassWithSections } from "@/lib/api";
import { ToastProvider } from "@/components/ui/Toast";
import AcademicYearDetailPage from "./page";

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

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
  resolveAcademicYear: vi.fn(),
  updateTermWeights: vi.fn(),
  listClasses: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

const CURRENT_YEAR: AcademicYear = {
  id: "year-2027",
  name: "2027",
  startDate: "2027-01-01",
  endDate: "2027-12-31",
  isCurrent: true,
  terms: [
    { id: "t1", name: "Term 1", weight: 50 },
    { id: "t2", name: "Term 2", weight: 50 },
  ],
};
const PREVIOUS_YEAR: AcademicYear = { ...CURRENT_YEAR, id: "year-2026", name: "2026", isCurrent: false };

function classFixture(overrides: Partial<ClassWithSections> = {}): ClassWithSections {
  return {
    id: "class-1",
    name: "Form 2",
    level: 2,
    division: { id: "div-secondary", type: "SECONDARY" },
    sections: [{ id: "sec-a", name: "A", capacity: 30, _count: { enrollments: 10 } }],
    _count: { classSubjects: 4 },
    ...overrides,
  };
}

const MANAGER = { accessToken: "token", user: { permissions: ["academic.manage"], schools: [{ id: "school-1", name: "Saamalay" }] } };

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockReturnValue(MANAGER);
  apiMock.listClasses.mockResolvedValue([]);
});

async function renderPage(yearId = "year-2026") {
  const params = Promise.resolve({ id: "school-1", yearId });
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <ToastProvider>
        <Suspense fallback={null}>
          <AcademicYearDetailPage params={params} />
        </Suspense>
      </ToastProvider>,
    );
  });
  return result;
}

describe("AcademicYearDetailPage — opening a specific academic year", () => {
  it("resolves and shows a PREVIOUS year's own details, using the real resolve-by-identifier API", async () => {
    apiMock.resolveAcademicYear.mockResolvedValue(PREVIOUS_YEAR);
    await renderPage("year-2026");

    expect(await screen.findByText("Previous Year")).toBeInTheDocument();
    expect(screen.getAllByText("2026").length).toBeGreaterThan(0);
    expect(apiMock.resolveAcademicYear).toHaveBeenCalledWith("token", "school-1", "year-2026");
  });

  it("resolves and shows the CURRENT year's own details — never mixed with another year's data", async () => {
    apiMock.resolveAcademicYear.mockResolvedValue(CURRENT_YEAR);
    await renderPage("year-2027");

    expect(await screen.findByText("Current Year")).toBeInTheDocument();
    expect(screen.getAllByText("2027").length).toBeGreaterThan(0);
    expect(screen.queryByText("Previous Year")).not.toBeInTheDocument();
    expect(screen.queryByText("2026")).not.toBeInTheDocument();
    expect(apiMock.resolveAcademicYear).toHaveBeenCalledWith("token", "school-1", "year-2027");
  });

  it("still shows the existing Term Weights editor for the resolved year, unchanged", async () => {
    apiMock.resolveAcademicYear.mockResolvedValue(PREVIOUS_YEAR);
    await renderPage("year-2026");

    expect(await screen.findByText("Term 1 — 50%")).toBeInTheDocument();
    expect(screen.getByText("Term 2 — 50%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit weights" })).toBeInTheDocument();
  });

  it("shows a real error, never fabricated data, when the year can't be resolved", async () => {
    apiMock.resolveAcademicYear.mockRejectedValue(new ApiError("Academic year not found in this school", 404));
    await renderPage("does-not-exist");

    expect(await screen.findByText("Academic year not found in this school")).toBeInTheDocument();
  });

  it("re-resolves fresh (never showing stale data) when navigating from one year id to another", async () => {
    apiMock.resolveAcademicYear.mockResolvedValueOnce(PREVIOUS_YEAR).mockResolvedValueOnce(CURRENT_YEAR);
    const { rerender } = await renderPage("year-2026");
    expect(await screen.findByText("Previous Year")).toBeInTheDocument();

    await act(async () => {
      rerender(
        <ToastProvider>
          <Suspense fallback={null}>
            <AcademicYearDetailPage params={Promise.resolve({ id: "school-1", yearId: "year-2027" })} />
          </Suspense>
        </ToastProvider>,
      );
    });

    await waitFor(() => expect(screen.getByText("Current Year")).toBeInTheDocument());
    expect(screen.queryByText("Previous Year")).not.toBeInTheDocument();
  });

  // Regression: production crashed with "Uncaught TypeError: Cannot read
  // properties of undefined (reading 'find')" because resolveAcademicYear's
  // backend response omitted `terms` (now fixed server-side in
  // academic-years.service.ts), and TermWeightsEditor called
  // `year.terms.find(...)` unconditionally. Reproduces the exact undefined
  // shape here so the page must render safely regardless of what the API
  // sends, not just because the backend now happens to include it.
  it("never crashes when the resolved year is missing its terms array", async () => {
    const yearMissingTerms = { ...PREVIOUS_YEAR, terms: undefined } as unknown as AcademicYear;
    apiMock.resolveAcademicYear.mockResolvedValue(yearMissingTerms);

    await renderPage("year-2026");

    expect(await screen.findByText("Previous Year")).toBeInTheDocument();
    // TermWeightsEditor safely renders nothing rather than crashing.
    expect(screen.queryByText(/Term 1/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit weights" })).not.toBeInTheDocument();
  });
});

// Task: "Make Academic Year navigation truly year-scoped" —
// Primary/Secondary -> Class/Form, all reusing the existing (already
// year-aware) listClasses() call and the existing class-detail page.
describe("AcademicYearDetailPage — year-scoped Classes & Sections hierarchy", () => {
  it("shows only the classes/forms that belong to THIS academic year", async () => {
    apiMock.resolveAcademicYear.mockResolvedValue(CURRENT_YEAR);
    apiMock.listClasses.mockResolvedValue([
      classFixture({ id: "class-form2-2027", name: "Form 2" }),
      classFixture({ id: "class-form3-2027", name: "Form 3", level: 3 }),
    ]);

    await renderPage("year-2027");

    expect(await screen.findByText("Form 2")).toBeInTheDocument();
    expect(screen.getByText("Form 3")).toBeInTheDocument();
    expect(apiMock.listClasses).toHaveBeenCalledWith("token", "school-1", "year-2027");
  });

  it("a previous academic year's classes never appear when viewing a different year", async () => {
    // The mock is itself year-aware, like the real backend — proving the
    // page only ever asks for (and shows) the one year it was given.
    apiMock.resolveAcademicYear.mockResolvedValue(CURRENT_YEAR);
    apiMock.listClasses.mockImplementation((_token: string, _schoolId: string, yearId?: string) =>
      Promise.resolve(yearId === "year-2027" ? [classFixture({ id: "class-2027", name: "Form 2" })] : [classFixture({ id: "class-2026", name: "Form 1 (2026)" })]),
    );

    await renderPage("year-2027");

    expect(await screen.findByText("Form 2")).toBeInTheDocument();
    expect(screen.queryByText("Form 1 (2026)")).not.toBeInTheDocument();
  });

  it("separates classes into Primary and Secondary groups", async () => {
    apiMock.resolveAcademicYear.mockResolvedValue(CURRENT_YEAR);
    apiMock.listClasses.mockResolvedValue([
      classFixture({ id: "class-form1", name: "Form 1", level: 1, division: { id: "div-secondary", type: "SECONDARY" } }),
      classFixture({ id: "class-class1", name: "Class 1", level: 1, division: { id: "div-primary", type: "PRIMARY" } }),
    ]);

    await renderPage("year-2027");

    expect(await screen.findByText("Secondary")).toBeInTheDocument();
    expect(screen.getByText("Primary")).toBeInTheDocument();
    expect(screen.getByText("Form 1")).toBeInTheDocument();
    expect(screen.getByText("Class 1")).toBeInTheDocument();
  });

  it("shows each class/form's real section count — never fabricated", async () => {
    apiMock.resolveAcademicYear.mockResolvedValue(CURRENT_YEAR);
    apiMock.listClasses.mockResolvedValue([
      classFixture({
        id: "class-form2",
        name: "Form 2",
        sections: [
          { id: "sec-a", name: "A", capacity: 30, _count: { enrollments: 10 } },
          { id: "sec-b", name: "B", capacity: 30, _count: { enrollments: 8 } },
        ],
      }),
    ]);

    await renderPage("year-2027");

    expect(await screen.findByText("2 Sections")).toBeInTheDocument();
  });

  it("clicking a class/form stays within the selected academic year — the link carries this exact year's id", async () => {
    apiMock.resolveAcademicYear.mockResolvedValue(PREVIOUS_YEAR);
    apiMock.listClasses.mockResolvedValue([classFixture({ id: "class-form2-2026", name: "Form 2" })]);

    await renderPage("year-2026");

    const link = await screen.findByRole("link", { name: /Form 2/ });
    expect(link).toHaveAttribute("href", "/schools/school-1/academic/classes/class-form2-2026?year=year-2026");
  });

  it("shows a real empty state, never fake classes, when this year has none yet", async () => {
    apiMock.resolveAcademicYear.mockResolvedValue(CURRENT_YEAR);
    apiMock.listClasses.mockResolvedValue([]);

    await renderPage("year-2027");

    expect(await screen.findByText("No classes yet for this year")).toBeInTheDocument();
  });
});
