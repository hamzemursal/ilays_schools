import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Profile } from "@/lib/api";
import { SuperAdminSidebar } from "./SuperAdminSidebar";

const pathnameMock = vi.hoisted(() => ({ value: "/dashboard" }));
const pushMock = vi.hoisted(() => vi.fn());
const logoutMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ usePathname: () => pathnameMock.value, useRouter: () => ({ push: pushMock }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ logout: logoutMock }) }));

const SUPER: Profile = {
  id: "u1",
  email: "super@ilays.test",
  roles: ["SUPER_ADMIN"],
  permissions: ["schools.view", "audit.view", "students.view", "transfers.create", "results.view", "results.approve", "finance.central.view", "academic.view", "teachers.view"],
  schools: [],
  mustChangePassword: false,
  mustSetup2FA: false,
} as unknown as Profile;

beforeEach(() => {
  vi.clearAllMocks();
  pathnameMock.value = "/dashboard";
  logoutMock.mockResolvedValue(undefined);
});

describe("SuperAdminSidebar", () => {
  it("shows the organization identity: Ilays Schools, SUPER ADMIN, Organization Control Center", () => {
    render(<SuperAdminSidebar user={SUPER} resolvedCurrentSchool={null} />);

    expect(screen.getByText("Ilays Schools")).toBeInTheDocument();
    expect(screen.getByText("Super Admin", { selector: "span.uppercase" })).toBeInTheDocument();
    expect(screen.getByText("Organization Control Center")).toBeInTheDocument();
  });

  it("never uses a selected school's name or logo as the identity", () => {
    render(<SuperAdminSidebar user={SUPER} resolvedCurrentSchool={{ id: "s1", name: "Xaafuun Secondary School", logoUrl: "https://cdn.example/logo.png" }} />);

    expect(screen.getByText("Ilays Schools")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    // The school appears only as a clearly-labelled "selected school" section.
    expect(screen.getByText("Selected school · Xaafuun Secondary School")).toBeInTheDocument();
    expect(screen.getByText("Organization Control Center")).toBeInTheDocument();
  });

  it("renders the grouped navigation with real links", () => {
    render(<SuperAdminSidebar user={SUPER} resolvedCurrentSchool={null} />);
    const nav = screen.getByRole("navigation", { name: "Organization navigation" });

    for (const group of ["Overview", "Organization", "Academic", "Operations", "Governance"]) {
      expect(within(nav).getByText(group)).toBeInTheDocument();
    }
    const href = (name: string) => within(nav).getByRole("link", { name }).getAttribute("href");
    expect(href("Dashboard")).toBe("/dashboard");
    expect(href("Schools")).toBe("/schools");
    expect(href("Exams & Results")).toBe("/results-review");
    expect(href("Student Lifecycle")).toBe("/student-lifecycle");
    expect(href("Transfers")).toBe("/transfers");
    expect(href("Central Finance")).toBe("/finance");
    expect(href("Audit Log")).toBe("/audit-log");
  });

  it("marks exactly the current page active (aria-current) — Indigo, not a blue-tinted light item", () => {
    pathnameMock.value = "/audit-log";
    render(<SuperAdminSidebar user={SUPER} resolvedCurrentSchool={null} />);
    const nav = screen.getByRole("navigation", { name: "Organization navigation" });

    const active = within(nav).getAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page");
    expect(active.map((l) => l.textContent)).toEqual(["Audit Log"]);
    expect(active[0].className).toMatch(/bg-accent/);
    expect(active[0].className).toMatch(/text-white/);
  });

  it("Schools is not highlighted while working inside one school", () => {
    pathnameMock.value = "/schools/s1/students";
    render(<SuperAdminSidebar user={SUPER} resolvedCurrentSchool={{ id: "s1", name: "Xaafuun Secondary School", logoUrl: null }} />);
    const nav = screen.getByRole("navigation", { name: "Organization navigation" });

    expect(within(nav).getByRole("link", { name: "Schools" })).not.toHaveAttribute("aria-current");
    expect(within(nav).getByRole("link", { name: "Students" })).toHaveAttribute("aria-current", "page");
  });

  it("shows the account area (Super Admin / Organization Administrator) with My Account and Log out", async () => {
    const user = userEvent.setup();
    render(<SuperAdminSidebar user={SUPER} resolvedCurrentSchool={null} />);

    expect(screen.getByText("Organization Administrator")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Super Admin\s*Organization Administrator/ })).toHaveAttribute("href", "/account");

    await user.click(screen.getByRole("button", { name: "Log out" }));

    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/portal");
  });

  it("closes the mobile drawer when a link is chosen", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<SuperAdminSidebar user={SUPER} resolvedCurrentSchool={null} onNavigate={onNavigate} />);

    await user.click(screen.getByRole("link", { name: "Transfers" }));

    expect(onNavigate).toHaveBeenCalled();
  });
});
