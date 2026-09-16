import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { School } from "@/lib/api";
import { ToastProvider } from "@/components/ui/Toast";
import { Topbar } from "./Topbar";

function renderTopbar() {
  return render(
    <ToastProvider>
      <Topbar onMenuClick={vi.fn()} />
    </ToastProvider>,
  );
}

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

function openSwitcher(user: ReturnType<typeof import("@testing-library/user-event").default.setup>) {
  return user.click(screen.getByRole("button", { name: "Switch school context" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.listMyAppNotifications.mockResolvedValue([]);
  navMock.pathname = "/dashboard";
});

describe("Topbar school context — Super Admin (organization-wide reach)", () => {
  it("fetches the real school list on mount, not lazily on open — so the current school's real name can resolve immediately", () => {
    authMock.useAuth.mockReturnValue({ user: superAdminUser(), accessToken: "token-1", logout: vi.fn(), refreshProfile: vi.fn() });
    apiMock.listSchools.mockResolvedValue([]);
    renderTopbar();

    expect(apiMock.listSchools).toHaveBeenCalledWith("token-1");
  });

  it("replaces the generic placeholder with the real current school's name once the list loads", async () => {
    navMock.pathname = "/schools/school-a/dashboard";
    authMock.useAuth.mockReturnValue({ user: superAdminUser(), accessToken: "token-1", logout: vi.fn(), refreshProfile: vi.fn() });
    apiMock.listSchools.mockResolvedValue([school({ id: "school-a", name: "Xaafuun Secondary School" })]);
    renderTopbar();

    expect(await screen.findByText("Xaafuun Secondary School")).toBeInTheDocument();
    expect(screen.queryByText("This school")).not.toBeInTheDocument();
  });

  it("shows the role label paired with CURRENT SCHOOL under the school name", async () => {
    authMock.useAuth.mockReturnValue({ user: superAdminUser(), accessToken: "token-1", logout: vi.fn(), refreshProfile: vi.fn() });
    apiMock.listSchools.mockResolvedValue([]);
    renderTopbar();

    expect(await screen.findByText("Super Admin · Current school")).toBeInTheDocument();
  });
});

describe("Topbar school switcher — Super Admin dropdown", () => {
  it("shows every authorized school with real student/teacher/staff counts and a type badge", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    authMock.useAuth.mockReturnValue({ user: superAdminUser(), accessToken: "token-1", logout: vi.fn(), refreshProfile: vi.fn() });
    apiMock.listSchools.mockResolvedValue([
      school({ id: "school-a", name: "Xaafuun Secondary School", type: "SECONDARY", studentCount: 680, teacherCount: 48, staffCount: 24 }),
      school({ id: "school-b", name: "Masalla Primary School", type: "PRIMARY", studentCount: 420, teacherCount: 32, staffCount: 18 }),
    ]);
    renderTopbar();
    await openSwitcher(user);

    expect(await screen.findByText("Xaafuun Secondary School")).toBeInTheDocument();
    expect(screen.getByText("680 students · 48 teachers · 24 staff")).toBeInTheDocument();
    expect(screen.getByText("Masalla Primary School")).toBeInTheDocument();
    expect(screen.getByText("Secondary")).toBeInTheDocument();
    expect(screen.getByText("Primary")).toBeInTheDocument();
  });

  it("visually marks the current school as selected, with a checkmark, and no other row", async () => {
    navMock.pathname = "/schools/school-a/dashboard";
    const user = (await import("@testing-library/user-event")).default.setup();
    authMock.useAuth.mockReturnValue({ user: superAdminUser(), accessToken: "token-1", logout: vi.fn(), refreshProfile: vi.fn() });
    apiMock.listSchools.mockResolvedValue([
      school({ id: "school-a", name: "Xaafuun Secondary School" }),
      school({ id: "school-b", name: "Masalla Primary School" }),
    ]);
    renderTopbar();
    await openSwitcher(user);

    const rows = await screen.findAllByRole("menuitem");
    const xaafuunRow = rows.find((r) => r.textContent?.includes("Xaafuun"))!;
    const masallaRow = rows.find((r) => r.textContent?.includes("Masalla"))!;
    expect(xaafuunRow).toHaveAttribute("aria-current", "true");
    expect(masallaRow).not.toHaveAttribute("aria-current");
  });

  it("shows 'View All Schools' linking to the existing Schools page, at the top of the dropdown", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    authMock.useAuth.mockReturnValue({ user: superAdminUser(), accessToken: "token-1", logout: vi.fn(), refreshProfile: vi.fn() });
    apiMock.listSchools.mockResolvedValue([school({ id: "school-a", name: "Xaafuun Secondary School" })]);
    renderTopbar();
    await openSwitcher(user);

    const link = await screen.findByRole("link", { name: /View All Schools/ });
    expect(link).toHaveAttribute("href", "/schools");
  });

  it("navigates to the chosen school's dashboard on click", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    authMock.useAuth.mockReturnValue({ user: superAdminUser(), accessToken: "token-1", logout: vi.fn(), refreshProfile: vi.fn() });
    apiMock.listSchools.mockResolvedValue([school({ id: "school-a", name: "Xaafuun Secondary School" })]);
    renderTopbar();
    await openSwitcher(user);
    await user.click(await screen.findByText("Xaafuun Secondary School"));

    expect(navMock.push).toHaveBeenCalledWith("/schools/school-a/dashboard");
  });

  it("closes when Escape is pressed", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    authMock.useAuth.mockReturnValue({ user: superAdminUser(), accessToken: "token-1", logout: vi.fn(), refreshProfile: vi.fn() });
    apiMock.listSchools.mockResolvedValue([school({ id: "school-a", name: "Xaafuun Secondary School" })]);
    renderTopbar();
    await openSwitcher(user);
    await screen.findByText("Xaafuun Secondary School");

    await user.keyboard("{Escape}");

    expect(screen.queryByText("Xaafuun Secondary School")).not.toBeInTheDocument();
  });
});

describe("Topbar school switcher — School Admin (no schools.view)", () => {
  it("never shows a switcher trigger, and never fetches the schools list — a School Admin has nothing authorized to switch to", () => {
    authMock.useAuth.mockReturnValue({
      user: { id: "u2", email: "admin@school.example", permissions: ["academic.view"], roles: ["SCHOOL_ADMIN"], schools: [] },
      accessToken: "token-1",
      logout: vi.fn(),
      refreshProfile: vi.fn(),
    });
    renderTopbar();

    expect(screen.queryByRole("button", { name: "Switch school context" })).not.toBeInTheDocument();
    expect(screen.queryByText("View All Schools")).not.toBeInTheDocument();
    expect(apiMock.listSchools).not.toHaveBeenCalled();
  });
});
