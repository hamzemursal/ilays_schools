import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { School } from "@/lib/api";
import { Topbar } from "./Topbar";

const apiMock = vi.hoisted(() => ({ listMyAppNotifications: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/api", () => ({ api: apiMock }));

const authMock = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({ useAuth: authMock.useAuth }));

const navMock = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: navMock.push }) }));

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

function renderTopbar(props: Partial<React.ComponentProps<typeof Topbar>> = {}) {
  return render(
    <Topbar
      onMenuClick={vi.fn()}
      canSwitchSchools={false}
      resolvedCurrentSchool={null}
      schools={null}
      {...props}
    />,
  );
}

function openSwitcher(user: ReturnType<typeof import("@testing-library/user-event").default.setup>) {
  return user.click(screen.getByRole("button", { name: "Switch school context" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.listMyAppNotifications.mockResolvedValue([]);
});

describe("Topbar — school-context switcher visibility", () => {
  it("shows the switcher only when Super Admin has actually entered a school's workspace", () => {
    authMock.useAuth.mockReturnValue({ user: superAdminUser(), accessToken: "token-1", logout: vi.fn() });
    renderTopbar({
      canSwitchSchools: true,
      resolvedCurrentSchool: { id: "school-a", name: "Xaafuun Secondary School", logoUrl: null },
      schools: [school({ id: "school-a", name: "Xaafuun Secondary School" })],
    });

    expect(screen.getByRole("button", { name: "Switch school context" })).toBeInTheDocument();
    expect(screen.getByText("Xaafuun Secondary School")).toBeInTheDocument();
  });

  it("hides the switcher entirely on organization-level pages, even for Super Admin — no current school to show or switch from", () => {
    authMock.useAuth.mockReturnValue({ user: superAdminUser(), accessToken: "token-1", logout: vi.fn() });
    renderTopbar({ canSwitchSchools: true, resolvedCurrentSchool: null, schools: [] });

    expect(screen.queryByRole("button", { name: "Switch school context" })).not.toBeInTheDocument();
  });

  it("never shows the switcher for a School Admin (no schools.view), even inside their own school's workspace", () => {
    authMock.useAuth.mockReturnValue({
      user: { id: "u2", email: "admin@school.example", permissions: ["academic.view"], roles: ["SCHOOL_ADMIN"], schools: [] },
      accessToken: "token-1",
      logout: vi.fn(),
    });
    renderTopbar({
      canSwitchSchools: false,
      resolvedCurrentSchool: { id: "school-a", name: "Xaafuun Secondary School", logoUrl: null },
    });

    expect(screen.queryByRole("button", { name: "Switch school context" })).not.toBeInTheDocument();
  });

  it("shows the role label paired with 'Current school' under the name", () => {
    authMock.useAuth.mockReturnValue({ user: superAdminUser(), accessToken: "token-1", logout: vi.fn() });
    renderTopbar({
      canSwitchSchools: true,
      resolvedCurrentSchool: { id: "school-a", name: "Xaafuun Secondary School", logoUrl: null },
      schools: [],
    });

    expect(screen.getByText("Super Admin · Current school")).toBeInTheDocument();
  });
});

describe("Topbar — school switcher dropdown", () => {
  const currentSchool = { id: "school-a", name: "Xaafuun Secondary School", logoUrl: null };
  const twoSchools = [
    school({ id: "school-a", name: "Xaafuun Secondary School", type: "SECONDARY", studentCount: 680, teacherCount: 48, staffCount: 24 }),
    school({ id: "school-b", name: "Masalla Primary School", type: "PRIMARY", studentCount: 420, teacherCount: 32, staffCount: 18 }),
  ];

  it("shows every authorized school (from the schools prop — never fetched by Topbar itself) with real counts and a type badge", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    authMock.useAuth.mockReturnValue({ user: superAdminUser(), accessToken: "token-1", logout: vi.fn() });
    renderTopbar({ canSwitchSchools: true, resolvedCurrentSchool: currentSchool, schools: twoSchools });
    await openSwitcher(user);

    expect(screen.getByText("680 students · 48 teachers · 24 staff")).toBeInTheDocument();
    expect(screen.getByText("Masalla Primary School")).toBeInTheDocument();
    expect(screen.getByText("Secondary")).toBeInTheDocument();
    expect(screen.getByText("Primary")).toBeInTheDocument();
  });

  it("visually marks only the current school as selected", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    authMock.useAuth.mockReturnValue({ user: superAdminUser(), accessToken: "token-1", logout: vi.fn() });
    renderTopbar({ canSwitchSchools: true, resolvedCurrentSchool: currentSchool, schools: twoSchools });
    await openSwitcher(user);

    const rows = screen.getAllByRole("menuitem");
    const xaafuunRow = rows.find((r) => r.textContent?.includes("Xaafuun"))!;
    const masallaRow = rows.find((r) => r.textContent?.includes("Masalla"))!;
    expect(xaafuunRow).toHaveAttribute("aria-current", "true");
    expect(masallaRow).not.toHaveAttribute("aria-current");
  });

  it("shows 'View All Schools' linking to the existing Schools page", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    authMock.useAuth.mockReturnValue({ user: superAdminUser(), accessToken: "token-1", logout: vi.fn() });
    renderTopbar({ canSwitchSchools: true, resolvedCurrentSchool: currentSchool, schools: twoSchools });
    await openSwitcher(user);

    const link = screen.getByRole("link", { name: /View All Schools/ });
    expect(link).toHaveAttribute("href", "/schools");
  });

  it("navigates to the chosen school's dashboard on click", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    authMock.useAuth.mockReturnValue({ user: superAdminUser(), accessToken: "token-1", logout: vi.fn() });
    renderTopbar({ canSwitchSchools: true, resolvedCurrentSchool: currentSchool, schools: twoSchools });
    await openSwitcher(user);
    await user.click(screen.getByText("Masalla Primary School"));

    expect(navMock.push).toHaveBeenCalledWith("/schools/school-b/dashboard");
  });

  it("closes when Escape is pressed", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    authMock.useAuth.mockReturnValue({ user: superAdminUser(), accessToken: "token-1", logout: vi.fn() });
    renderTopbar({ canSwitchSchools: true, resolvedCurrentSchool: currentSchool, schools: twoSchools });
    await openSwitcher(user);
    expect(screen.getByText("Masalla Primary School")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByText("Masalla Primary School")).not.toBeInTheDocument();
  });
});
