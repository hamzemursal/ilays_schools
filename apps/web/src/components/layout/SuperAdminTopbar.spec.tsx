import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { School } from "@/lib/api";
import { SuperAdminTopbar, pageLabelFor } from "./SuperAdminTopbar";

const pathnameMock = vi.hoisted(() => ({ value: "/dashboard" }));
const pushMock = vi.hoisted(() => vi.fn());
const logoutMock = vi.hoisted(() => vi.fn());
const apiMock = vi.hoisted(() => ({ listMyAppNotifications: vi.fn(), markMyAppNotificationRead: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock }));
vi.mock("next/navigation", () => ({ usePathname: () => pathnameMock.value, useRouter: () => ({ push: pushMock }) }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: {
      id: "u1",
      email: "super@ilays.test",
      roles: ["SUPER_ADMIN"],
      permissions: ["schools.view", "audit.view", "students.view", "transfers.create", "results.view", "results.approve", "finance.central.view", "academic.view"],
      schools: [],
    },
    accessToken: "token-1",
    logout: logoutMock,
  }),
}));

function school(id: string, name: string, overrides: Partial<School> = {}): School {
  return {
    id,
    name,
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
    ...overrides,
  };
}

const SCHOOLS = [school("s1", "Ilays Primary School", { type: "PRIMARY", studentCount: 420, teacherCount: 32, staffCount: 18 }), school("s2", "Ilays Secondary School")];

function renderBar(props: Partial<React.ComponentProps<typeof SuperAdminTopbar>> = {}) {
  return render(<SuperAdminTopbar onMenuClick={vi.fn()} resolvedCurrentSchool={null} schools={SCHOOLS} {...props} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  pathnameMock.value = "/dashboard";
  apiMock.listMyAppNotifications.mockResolvedValue([]);
  logoutMock.mockResolvedValue(undefined);
});

describe("SuperAdminTopbar — organization-level header", () => {
  it("shows 'Organization / Dashboard' on the organization dashboard", () => {
    renderBar();
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });

    expect(within(crumbs).getByRole("link", { name: "Organization" })).toHaveAttribute("href", "/dashboard");
    expect(crumbs).toHaveTextContent("Organization");
    expect(crumbs).toHaveTextContent("Dashboard");
  });

  it("shows Organization / <school> / <page> inside a school, still anchored to the organization", () => {
    pathnameMock.value = "/schools/s2/students";
    renderBar({ resolvedCurrentSchool: { id: "s2", name: "Ilays Secondary School", logoUrl: null } });
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });

    expect(crumbs).toHaveTextContent("Organization");
    expect(crumbs).toHaveTextContent("Ilays Secondary School");
    expect(crumbs).toHaveTextContent("Students");
  });

  it("offers one search for schools and pages, with the Ctrl K shortcut", async () => {
    const user = userEvent.setup();
    renderBar();

    expect(screen.getByText("Search schools and pages…")).toBeInTheDocument();
    expect(screen.getByText("Ctrl K")).toBeInTheDocument();

    await user.keyboard("{Control>}k{/Control}");
    const input = await screen.findByPlaceholderText("Search schools and pages…");
    expect(input).toHaveFocus();
  });

  it("finds real schools and real pages, and navigates to the chosen one", async () => {
    const user = userEvent.setup();
    renderBar();
    await user.keyboard("{Control>}k{/Control}");

    await user.type(await screen.findByPlaceholderText("Search schools and pages…"), "secondary");
    await user.click(screen.getByRole("button", { name: "Ilays Secondary School" }));

    expect(pushMock).toHaveBeenCalledWith("/schools/s2/dashboard");
  });

  it("a page search reaches organization routes", async () => {
    const user = userEvent.setup();
    renderBar();
    await user.keyboard("{Control>}k{/Control}");

    await user.type(await screen.findByPlaceholderText("Search schools and pages…"), "audit");
    await user.click(screen.getByRole("button", { name: "Audit Log" }));

    expect(pushMock).toHaveBeenCalledWith("/audit-log");
  });

  it("Escape closes the search", async () => {
    const user = userEvent.setup();
    renderBar();
    await user.keyboard("{Control>}k{/Control}");
    await screen.findByPlaceholderText("Search schools and pages…");

    await user.keyboard("{Escape}");

    expect(screen.queryByPlaceholderText("Search schools and pages…")).not.toBeInTheDocument();
  });

  it("shows the unread notification count", async () => {
    apiMock.listMyAppNotifications.mockResolvedValue([
      { id: "n1", title: "Results submitted", body: "x", isRead: false, createdAt: new Date().toISOString(), actionUrl: null },
      { id: "n2", title: "Old", body: "y", isRead: true, createdAt: new Date().toISOString(), actionUrl: null },
    ]);
    renderBar();

    expect(await screen.findByText("1")).toBeInTheDocument();
  });

  it("the account menu keeps My Account and Sign out (same labels the app has always used)", async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByText("super@ilays.test")).toBeInTheDocument();
    expect(screen.getByText("SUPER_ADMIN")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My Account" })).toHaveAttribute("href", "/account");

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/portal");
  });
});

describe("Organization school selector", () => {
  const open = async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Switch school context" }));
    return user;
  };

  it("reads 'All Schools' on organization pages — the Super Admin is not 'inside' a school", () => {
    renderBar();

    expect(screen.getByRole("button", { name: "Switch school context" })).toHaveTextContent("All Schools");
  });

  it("lists All Schools first, then every authorized school with its real counts and type", async () => {
    renderBar();
    await open();
    const menu = screen.getByRole("menu", { name: "Switch school" });

    const items = within(menu).getAllByRole("menuitem");
    expect(items[0]).toHaveTextContent("All Schools");
    expect(items[1]).toHaveTextContent("Ilays Primary School");
    expect(items[1]).toHaveTextContent("420 students · 32 teachers · 18 staff");
    expect(items[1]).toHaveTextContent("Primary");
    expect(items[2]).toHaveTextContent("Ilays Secondary School");
    expect(items[2]).toHaveTextContent("680 students · 48 teachers · 24 staff");
  });

  it("marks All Schools as the current choice on organization pages", async () => {
    renderBar();
    await open();

    expect(screen.getByRole("menuitem", { name: /All Schools/ })).toHaveAttribute("aria-current", "true");
  });

  it("shows the selected school clearly, and marks only that school", async () => {
    pathnameMock.value = "/schools/s2/dashboard";
    renderBar({ resolvedCurrentSchool: { id: "s2", name: "Ilays Secondary School", logoUrl: null } });

    expect(screen.getByRole("button", { name: "Switch school context" })).toHaveTextContent("Ilays Secondary School");
    await open();
    expect(screen.getByRole("menuitem", { name: /Ilays Secondary School/ })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("menuitem", { name: /Ilays Primary School/ })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("menuitem", { name: /All Schools/ })).not.toHaveAttribute("aria-current");
  });

  it("choosing a school goes to that school's dashboard; choosing All Schools returns to the organization dashboard", async () => {
    pathnameMock.value = "/schools/s2/dashboard";
    renderBar({ resolvedCurrentSchool: { id: "s2", name: "Ilays Secondary School", logoUrl: null } });
    let user = await open();
    await user.click(screen.getByRole("menuitem", { name: /Ilays Primary School/ }));
    expect(pushMock).toHaveBeenLastCalledWith("/schools/s1/dashboard");

    user = await open();
    await user.click(screen.getByRole("menuitem", { name: /All Schools/ }));
    expect(pushMock).toHaveBeenLastCalledWith("/dashboard");
  });

  it("choosing the school you are already in does nothing", async () => {
    pathnameMock.value = "/schools/s2/dashboard";
    renderBar({ resolvedCurrentSchool: { id: "s2", name: "Ilays Secondary School", logoUrl: null } });
    const user = await open();

    await user.click(screen.getByRole("menuitem", { name: /Ilays Secondary School/ }));

    expect(pushMock).not.toHaveBeenCalled();
  });

  it("links to the existing Schools page, and shows a loading state while the list is fetched", async () => {
    renderBar({ schools: null });
    await open();

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage schools" })).toHaveAttribute("href", "/schools");
  });

  it("closes on Escape", async () => {
    renderBar();
    const user = await open();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu", { name: "Switch school" })).not.toBeInTheDocument();
  });
});

describe("pageLabelFor", () => {
  const items = [
    { label: "Dashboard", href: "/dashboard", icon: (() => null) as never },
    { label: "Schools", href: "/schools", icon: (() => null) as never },
    { label: "Students", href: "/schools/s1/students", icon: (() => null) as never },
  ];

  it("names the current page from the real navigation", () => {
    expect(pageLabelFor("/dashboard", items)).toBe("Dashboard");
    expect(pageLabelFor("/schools", items)).toBe("Schools");
    expect(pageLabelFor("/schools/s1/students/abc", items)).toBe("Students");
    expect(pageLabelFor("/account", items)).toBe("My Account");
    expect(pageLabelFor("/schools/s1", items)).toBe("School overview");
  });
});
