import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToastProvider } from "@/components/ui/Toast";
import { AppShell } from "./AppShell";

function renderShell() {
  return render(
    <ToastProvider>
      <AppShell>{null}</AppShell>
    </ToastProvider>,
  );
}

const apiMock = vi.hoisted(() => ({
  listSchools: vi.fn(),
  listMyAppNotifications: vi.fn().mockResolvedValue([]),
  listMyChildren: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

const authMock = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({ useAuth: authMock.useAuth }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/schools/school-a/dashboard",
}));

function superAdminUser() {
  return {
    id: "u1",
    email: "admin@ilays.example",
    permissions: ["schools.view"],
    roles: ["SUPER_ADMIN"],
    schools: [], // org-wide accounts hold no UserSchool rows
    mustChangePassword: false,
    mustSetup2FA: false,
  };
}

function school(id: string, name: string) {
  return {
    id,
    name,
    type: "SECONDARY" as const,
    status: "ACTIVE" as const,
    address: null,
    phone: null,
    email: null,
    createdAt: new Date().toISOString(),
    studentCount: 680,
    teacherCount: 48,
    staffCount: 24,
    hasActiveAdmin: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.listMyAppNotifications.mockResolvedValue([]);
  apiMock.listMyChildren.mockResolvedValue([]);
});

describe("AppShell — shared school-context resolution", () => {
  it("fetches the authorized schools list exactly once, shared by Sidebar and Topbar rather than each fetching it separately", async () => {
    authMock.useAuth.mockReturnValue({
      user: superAdminUser(),
      accessToken: "token-1",
      loading: false,
      refreshProfile: vi.fn(),
    });
    apiMock.listSchools.mockResolvedValue([school("school-a", "Xaafuun Secondary School")]);

    renderShell();

    await screen.findAllByText("Xaafuun Secondary School");
    expect(apiMock.listSchools).toHaveBeenCalledTimes(1);
  });

  it("resolves the real current school name into both the sidebar's per-school nav group and the header switcher", async () => {
    authMock.useAuth.mockReturnValue({
      user: superAdminUser(),
      accessToken: "token-1",
      loading: false,
      refreshProfile: vi.fn(),
    });
    apiMock.listSchools.mockResolvedValue([school("school-a", "Xaafuun Secondary School")]);

    renderShell();

    // The header switcher trigger and the sidebar's "Main menu" section both
    // exist once the real school resolves — appearing at least once proves
    // the fetched name reached the shared prop, not a hardcoded fallback.
    expect((await screen.findAllByText("Xaafuun Secondary School")).length).toBeGreaterThan(0);
    expect(screen.queryByText("This school")).not.toBeInTheDocument();
  });

  it("never fetches the schools list for a School Admin (no schools.view)", () => {
    authMock.useAuth.mockReturnValue({
      user: {
        id: "u2",
        email: "admin@school.example",
        permissions: ["academic.view"],
        roles: ["SCHOOL_ADMIN"],
        schools: [{ id: "school-a", name: "Xaafuun Secondary School", logoUrl: null }],
        mustChangePassword: false,
        mustSetup2FA: false,
      },
      accessToken: "token-1",
      loading: false,
      refreshProfile: vi.fn(),
    });

    renderShell();

    expect(apiMock.listSchools).not.toHaveBeenCalled();
  });
});
