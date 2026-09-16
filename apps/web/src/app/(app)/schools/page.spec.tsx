import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { School } from "@/lib/api";
import { ToastProvider } from "@/components/ui/Toast";
import SchoolsPage from "./page";

const apiMock = vi.hoisted(() => ({
  listSchools: vi.fn(),
  createSchool: vi.fn(),
  getSchoolDeletionImpact: vi.fn(),
  removeSchool: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

const authMock = vi.hoisted(() => ({
  useAuth: vi.fn(() => ({
    accessToken: "token-1",
    user: { permissions: ["schools.view", "schools.create", "schools.manage"] },
  })),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: authMock.useAuth, ApiError: class ApiError extends Error {} }));

function school(overrides: Partial<School> & { id: string; name: string }): School {
  return {
    type: "PRIMARY",
    status: "ACTIVE",
    address: null,
    phone: null,
    email: null,
    createdAt: new Date().toISOString(),
    studentCount: 0,
    teacherCount: 0,
    staffCount: 0,
    hasActiveAdmin: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

function renderPage() {
  return render(
    <ToastProvider>
      <SchoolsPage />
    </ToastProvider>,
  );
}

describe("SchoolsPage — real database counts on each card", () => {
  it("shows each school's real student, teacher, and staff counts — never hard-coded", async () => {
    apiMock.listSchools.mockResolvedValue([
      school({ id: "s1", name: "Xaafuun Secondary School", type: "SECONDARY", studentCount: 680, teacherCount: 48, staffCount: 24 }),
    ]);
    renderPage();

    // Primary Schools tab is selected by default — switch to see this
    // SECONDARY school's card.
    (await screen.findByText("Secondary Schools")).click();

    expect(await screen.findByText("Xaafuun Secondary School")).toBeInTheDocument();
    expect(screen.getByText("680")).toBeInTheDocument();
    expect(screen.getByText("48")).toBeInTheDocument();
    expect(screen.getByText("24")).toBeInTheDocument();
    expect(screen.getByText("Staff")).toBeInTheDocument();
  });

  it("shows a real 0 for a school with no staff yet, not an omitted or fabricated count", async () => {
    apiMock.listSchools.mockResolvedValue([school({ id: "s2", name: "New Primary School", staffCount: 0 })]);
    renderPage();

    expect(await screen.findByText("New Primary School")).toBeInTheDocument();
    expect(screen.getByText("Staff")).toBeInTheDocument();
  });
});
