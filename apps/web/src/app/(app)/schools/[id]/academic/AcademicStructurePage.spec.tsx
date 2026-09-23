import { Suspense } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "@/components/ui/Toast";
import AcademicStructurePage from "./page";

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => null }),
}));
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
  listDivisions: vi.fn(),
  listAcademicYears: vi.fn(),
  listClasses: vi.fn(),
  listSubjects: vi.fn(),
  listExams: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

const MANAGER = { accessToken: "token", user: { permissions: ["academic.manage"], schools: [{ id: "school-1", name: "Saamalay" }] } };

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockReturnValue(MANAGER);
  apiMock.listDivisions.mockResolvedValue([{ id: "div-1", type: "PRIMARY" }]);
  apiMock.listAcademicYears.mockResolvedValue([
    { id: "year-1", name: "2027", startDate: "2027-01-01", endDate: "2027-12-31", isCurrent: true, terms: [] },
  ]);
  apiMock.listClasses.mockResolvedValue([]);
  apiMock.listSubjects.mockResolvedValue([]);
  apiMock.listExams.mockResolvedValue([]);
});

async function renderPage() {
  const params = Promise.resolve({ id: "school-1" });
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <ToastProvider>
        <Suspense fallback={null}>
          <AcademicStructurePage params={params} />
        </Suspense>
      </ToastProvider>,
    );
  });
  return result;
}

describe("AcademicStructurePage — main navigation", () => {
  it("no longer shows the old standalone 'Classes & sections' tab", async () => {
    await renderPage();

    await waitFor(() => expect(screen.getByRole("button", { name: "Years" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Classes & sections" })).not.toBeInTheDocument();
    // Still exactly the other three tabs — nothing else removed.
    expect(screen.getByRole("button", { name: "Subjects" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exams" })).toBeInTheDocument();
  });

  it("defaults to the Years tab, which shows the clickable Academic Year cards", async () => {
    await renderPage();

    expect(await screen.findByText("Current Year")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open 2027" })).toHaveAttribute(
      "href",
      "/schools/school-1/academic/years/year-1",
    );
  });

  it("the Subjects and Exams tabs still render without the removed Classes section", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: "Years" })).toBeInTheDocument());

    await screen.getByRole("button", { name: "Subjects" }).click();
    expect(await screen.findByText("Every subject offered at this school.")).toBeInTheDocument();

    await screen.getByRole("button", { name: "Exams" }).click();
    expect(await screen.findByText(/No exams yet|Create an exam/)).toBeInTheDocument();
  });
});
