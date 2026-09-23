import { Suspense } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import type { AcademicYear } from "@/lib/api";
import { ToastProvider } from "@/components/ui/Toast";
import AcademicYearDetailPage from "./page";

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

const MANAGER = { accessToken: "token", user: { permissions: ["academic.manage"], schools: [{ id: "school-1", name: "Saamalay" }] } };

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockReturnValue(MANAGER);
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
