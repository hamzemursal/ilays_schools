import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { School } from "@/lib/api";
import { Topbar } from "./Topbar";

const apiMock = vi.hoisted(() => ({
  listMyAppNotifications: vi.fn().mockResolvedValue([]),
  listSchools: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

const authMock = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({ useAuth: authMock.useAuth }));

const navMock = vi.hoisted(() => ({ pathname: "/dashboard", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navMock.push }),
  usePathname: () => navMock.pathname,
}));

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

function superAdminUser() {
  return {
    id: "u1",
    email: "admin@ilays.example",
    permissions: ["schools.view"],
    roles: ["SUPER_ADMIN"],
    schools: [], // org-wide accounts hold no UserSchool rows
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.listMyAppNotifications.mockResolvedValue([]);
  navMock.pathname = "/dashboard";
});

describe("Topbar school switcher — Super Admin (organization-wide reach)", () => {
  it("does not fetch the schools list until the switcher is actually opened", () => {
    authMock.useAuth.mockReturnValue({ user: superAdminUser(), accessToken: "token-1", logout: vi.fn(), refreshProfile: vi.fn() });
    render(<Topbar onMenuClick={vi.fn()} />);

    expect(apiMock.listSchools).not.toHaveBeenCalled();
  });

  it("shows every authorized school with its real student/teacher counts once opened", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    authMock.useAuth.mockReturnValue({ user: superAdminUser(), accessToken: "token-1", logout: vi.fn(), refreshProfile: vi.fn() });
    apiMock.listSchools.mockResolvedValue([
      school({ id: "school-a", name: "Xaafuun Secondary School", studentCount: 680, teacherCount: 48 }),
      school({ id: "school-b", name: "Masalla Primary School", studentCount: 420, teacherCount: 32 }),
    ]);
    render(<Topbar onMenuClick={vi.fn()} />);

    await user.click(screen.getByText("Ilays Schools"));

    expect(await screen.findByText("Xaafuun Secondary School")).toBeInTheDocument();
    expect(screen.getByText("680 students · 48 teachers")).toBeInTheDocument();
    expect(screen.getByText("Masalla Primary School")).toBeInTheDocument();
    expect(screen.getByText("View All Schools")).toBeInTheDocument();
  });

  it("navigates to the chosen school's dashboard on click", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    authMock.useAuth.mockReturnValue({ user: superAdminUser(), accessToken: "token-1", logout: vi.fn(), refreshProfile: vi.fn() });
    apiMock.listSchools.mockResolvedValue([school({ id: "school-a", name: "Xaafuun Secondary School" })]);
    render(<Topbar onMenuClick={vi.fn()} />);

    await user.click(screen.getByText("Ilays Schools"));
    await user.click(await screen.findByText("Xaafuun Secondary School"));

    expect(navMock.push).toHaveBeenCalledWith("/schools/school-a/dashboard");
  });
});

describe("Topbar school switcher — School Admin (no schools.view)", () => {
  it("never shows a switcher trigger — a School Admin has nothing authorized to switch to", () => {
    authMock.useAuth.mockReturnValue({
      user: { id: "u2", email: "admin@school.example", permissions: ["academic.view"], roles: ["SCHOOL_ADMIN"], schools: [] },
      accessToken: "token-1",
      logout: vi.fn(),
      refreshProfile: vi.fn(),
    });
    render(<Topbar onMenuClick={vi.fn()} />);

    expect(screen.queryByText("View All Schools")).not.toBeInTheDocument();
    expect(apiMock.listSchools).not.toHaveBeenCalled();
  });
});
