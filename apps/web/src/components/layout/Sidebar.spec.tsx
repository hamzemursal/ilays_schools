import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Profile } from "@/lib/api";
import { ToastProvider } from "@/components/ui/Toast";
import { Sidebar } from "./Sidebar";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "u1",
    email: "user@example.com",
    organizationId: "org-1",
    roles: [],
    permissions: [],
    schoolIds: [],
    schools: [],
    teacherId: null,
    guardianId: null,
    studentId: null,
    mustChangePassword: false,
    mustSetup2FA: false,
    ...overrides,
  };
}

function renderSidebar(props: Partial<React.ComponentProps<typeof Sidebar>> & { user: Profile }) {
  return render(
    <ToastProvider>
      <Sidebar accessToken="token-1" canSwitchSchools={false} resolvedCurrentSchool={null} onBrandingChanged={vi.fn()} {...props} />
    </ToastProvider>,
  );
}

describe("Sidebar branding — Super Admin (organization-wide reach)", () => {
  it("always shows the Ilays Schools organization identity, never a selected school's name", () => {
    renderSidebar({
      user: profile({ permissions: ["schools.view"], roles: ["SUPER_ADMIN"] }),
      canSwitchSchools: true,
      resolvedCurrentSchool: { id: "school-a", name: "Xaafuun Secondary School", logoUrl: null },
    });

    expect(screen.getByText("Ilays Schools")).toBeInTheDocument();
    expect(screen.queryByText("Xaafuun Secondary School")).not.toBeInTheDocument();
  });

  it("shows a role badge identifying the account as Super Admin", () => {
    renderSidebar({ user: profile({ permissions: ["schools.view"], roles: ["SUPER_ADMIN"] }), canSwitchSchools: true });

    expect(screen.getByText("Super Admin")).toBeInTheDocument();
  });

  it("labels the org-wide nav group as Main menu when there is no school in context", () => {
    renderSidebar({ user: profile({ permissions: ["schools.view"], roles: ["SUPER_ADMIN"] }), canSwitchSchools: true });

    expect(screen.getByText("Main menu")).toBeInTheDocument();
  });
});

describe("Sidebar branding — School Admin (single school)", () => {
  it("shows the real school's own name at the top, not the generic Ilays Schools mark", () => {
    renderSidebar({
      user: profile({ permissions: ["academic.view"], roles: ["SCHOOL_ADMIN"] }),
      canSwitchSchools: false,
      resolvedCurrentSchool: { id: "school-a", name: "Xaafuun Secondary School", logoUrl: null },
    });

    expect(screen.getByText("Xaafuun Secondary School")).toBeInTheDocument();
    expect(screen.queryByText("Super Admin")).not.toBeInTheDocument();
  });

  it("labels the school's own nav group as Main menu", () => {
    renderSidebar({
      user: profile({ permissions: ["academic.view", "teachers.view"], roles: ["SCHOOL_ADMIN"] }),
      canSwitchSchools: false,
      resolvedCurrentSchool: { id: "school-a", name: "Xaafuun Secondary School", logoUrl: null },
    });

    expect(screen.getByText("Main menu")).toBeInTheDocument();
  });
});

describe("Sidebar branding — no school in context (e.g. Parent/Student outside a school route)", () => {
  it("falls back to the generic Ilays Schools mark, without a role badge", () => {
    renderSidebar({ user: profile({ roles: ["PARENT"] }), canSwitchSchools: false, resolvedCurrentSchool: null });

    expect(screen.getByText("Ilays Schools")).toBeInTheDocument();
    expect(screen.queryByText("Super Admin")).not.toBeInTheDocument();
  });
});
