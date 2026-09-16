import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SystemSummary } from "@/lib/api";
import { SuperAdminDashboard } from "./SuperAdminDashboard";

const apiMock = vi.hoisted(() => ({ getSystemSummary: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ accessToken: "token-1" }),
  ApiError: class ApiError extends Error {},
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

function summary(overrides: Partial<SystemSummary> = {}): SystemSummary {
  return {
    totals: {
      schools: 2,
      primarySchools: 1,
      secondarySchools: 1,
      activeSchools: 2,
      inactiveSchools: 0,
      students: 1100,
      maleStudents: 560,
      femaleStudents: 540,
      teachers: 80,
      guardians: 400,
      staff: 42,
    },
    schools: [
      {
        id: "school-a",
        name: "Xaafuun Secondary School",
        type: "SECONDARY",
        status: "ACTIVE",
        address: null,
        phone: null,
        email: null,
        createdAt: new Date().toISOString(),
        studentCount: 680,
        teacherCount: 48,
        staffCount: 24,
        hasActiveAdmin: true,
      },
      {
        id: "school-b",
        name: "Masalla Primary School",
        type: "PRIMARY",
        status: "ACTIVE",
        address: null,
        phone: null,
        email: null,
        createdAt: new Date().toISOString(),
        studentCount: 420,
        teacherCount: 32,
        staffCount: 18,
        hasActiveAdmin: true,
      },
    ],
    recentActivity: [],
    alerts: [],
    ...overrides,
  };
}

describe("SuperAdminDashboard — real, non-hard-coded organization data", () => {
  it("shows a real total staff figure — summed from the Staff model, not the teacher count relabeled", async () => {
    apiMock.getSystemSummary.mockResolvedValue(summary());
    render(<SuperAdminDashboard />);

    expect(await screen.findByText("42")).toBeInTheDocument();
    expect(screen.getByText("Total staff")).toBeInTheDocument();
    // The old stale hint claiming there's no separate Staff model must be gone.
    expect(screen.queryByText(/no separate staff records/i)).not.toBeInTheDocument();
  });

  it("lists every authorized school in a real per-school table, with each school's own counts and a View School action", async () => {
    apiMock.getSystemSummary.mockResolvedValue(summary());
    render(<SuperAdminDashboard />);

    expect(await screen.findByText("Xaafuun Secondary School")).toBeInTheDocument();
    expect(screen.getByText("Masalla Primary School")).toBeInTheDocument();
    expect(screen.getByText("680")).toBeInTheDocument();
    expect(screen.getByText("48")).toBeInTheDocument();
    expect(screen.getByText("24")).toBeInTheDocument();
    expect(screen.getAllByText("View School").length).toBe(2);
  });

  it("never mixes one school's counts into another's row", async () => {
    apiMock.getSystemSummary.mockResolvedValue(summary());
    render(<SuperAdminDashboard />);

    await screen.findByText("Xaafuun Secondary School");
    const rows = screen.getAllByRole("row");
    const xaafuunRow = rows.find((r) => r.textContent?.includes("Xaafuun"));
    const masallaRow = rows.find((r) => r.textContent?.includes("Masalla"));
    expect(xaafuunRow?.textContent).toContain("680");
    expect(masallaRow?.textContent).not.toContain("680");
  });
});
