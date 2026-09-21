import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SystemSummary } from "@/lib/api";
import DashboardPage from "./page";

const apiMock = vi.hoisted(() => ({ getSystemSummary: vi.fn(), getDashboardSummary: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock }));
const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authMock(), ApiError: class ApiError extends Error {} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const SUMMARY: SystemSummary = {
  totals: { schools: 2, primarySchools: 1, secondarySchools: 1, activeSchools: 2, inactiveSchools: 0, students: 10, maleStudents: 5, femaleStudents: 5, teachers: 3, guardians: 8, staff: 1 },
  schools: [],
  recentActivity: [],
  alerts: [],
};

const profile = (roles: string[], permissions: string[], schools: { id: string; name: string; logoUrl: string | null }[] = []) => ({
  id: "u1",
  email: "user@ilays.test",
  roles,
  permissions,
  schools,
  mustChangePassword: false,
  mustSetup2FA: false,
});

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.getSystemSummary.mockResolvedValue(SUMMARY);
  apiMock.getDashboardSummary.mockResolvedValue({
    counts: { students: 1, teachers: 1, classes: 1 },
    attendanceToday: { percent: null, marked: 0 },
    outstandingFeesTotal: 0,
    outstandingInvoiceCount: 0,
  });
});

describe("Dashboard routing by role", () => {
  it("SUPER_ADMIN gets the Organization Control Center (and keeps the account summary with the raw role badge)", async () => {
    authMock.mockReturnValue({ user: profile(["SUPER_ADMIN"], ["schools.view", "audit.view"]), accessToken: "t", loading: false });
    render(<DashboardPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "Super Admin Command Center" })).toBeInTheDocument();
    expect(screen.getByText("Your account")).toBeInTheDocument();
    expect(screen.getByText("SUPER_ADMIN")).toBeInTheDocument();
    expect(screen.getByText("Organization-wide access.")).toBeInTheDocument();
    expect(screen.queryByText(/^Welcome back/)).not.toBeInTheDocument();
  });

  it("ORGANIZATION_ADMIN keeps the existing system overview — the redesign is Super Admin only", async () => {
    authMock.mockReturnValue({ user: profile(["ORGANIZATION_ADMIN"], ["schools.view"]), accessToken: "t", loading: false });
    render(<DashboardPage />);

    expect(await screen.findByText("Welcome back!")).toBeInTheDocument();
    expect(screen.queryByText("Super Admin Command Center")).not.toBeInTheDocument();
    expect(screen.getByText("System overview")).toBeInTheDocument();
  });

  it("SCHOOL_ADMIN keeps the school dashboard, untouched", async () => {
    authMock.mockReturnValue({
      user: profile(["SCHOOL_ADMIN"], ["academic.view", "students.view"], [{ id: "s1", name: "Ilays Primary School", logoUrl: null }]),
      accessToken: "t",
      loading: false,
    });
    render(<DashboardPage />);

    expect(await screen.findByText("Welcome back, Ilays Primary School")).toBeInTheDocument();
    expect(await screen.findByText("Quick links")).toBeInTheDocument();
    expect(screen.queryByText("Super Admin Command Center")).not.toBeInTheDocument();
    expect(apiMock.getSystemSummary).not.toHaveBeenCalled();
  });
});
