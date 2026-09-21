import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { School, SystemSummary } from "@/lib/api";
import { OrganizationControlCenter, humanizeAction, relativeTime } from "./OrganizationControlCenter";

const apiMock = vi.hoisted(() => ({ getSystemSummary: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock }));
const { ApiError } = vi.hoisted(() => {
  class ApiError extends Error {}
  return { ApiError };
});
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ accessToken: "token-1" }), ApiError }));
const pushMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

function school(id: string, name: string, overrides: Partial<School> = {}): School {
  return {
    id,
    name,
    type: "PRIMARY",
    status: "ACTIVE",
    address: null,
    phone: null,
    email: null,
    createdAt: new Date().toISOString(),
    studentCount: 100,
    teacherCount: 10,
    staffCount: 5,
    hasActiveAdmin: true,
    ...overrides,
  };
}

function summary(overrides: Partial<SystemSummary> = {}): SystemSummary {
  return {
    totals: {
      schools: 3,
      primarySchools: 1,
      secondarySchools: 2,
      activeSchools: 2,
      inactiveSchools: 1,
      students: 1234,
      maleStudents: 600,
      femaleStudents: 634,
      teachers: 87,
      guardians: 401,
      staff: 19,
    },
    schools: [
      school("s1", "Ilays Primary School", { type: "PRIMARY", studentCount: 420, teacherCount: 32, staffCount: 18 }),
      school("s2", "Ilays Secondary School", { type: "SECONDARY", studentCount: 680, teacherCount: 48, staffCount: 24 }),
      school("s3", "Ilays Model School", { type: "PRIMARY", status: "INACTIVE", studentCount: 134, teacherCount: 7, staffCount: 0 }),
    ],
    recentActivity: [
      { id: "a1", action: "RESULTS_PUBLISHED", resource: "ExamSubject", resourceId: "x", schoolId: "s2", createdAt: new Date(Date.now() - 2 * 3600_000).toISOString(), actorEmail: "admin@secondary.test" },
      { id: "a2", action: "school.create", resource: "School", resourceId: "s3", schoolId: null, createdAt: new Date(Date.now() - 3 * 86400_000).toISOString(), actorEmail: "super@ilays.test" },
    ],
    alerts: [{ severity: "warning", message: "Ilays Model School has no active admin", schoolId: "s3" }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.getSystemSummary.mockResolvedValue(summary());
});

describe("OrganizationControlCenter — hero", () => {
  it("is an Organization Control Center, not a 'welcome back' page", async () => {
    render(<OrganizationControlCenter />);

    expect(await screen.findByText("Organization overview")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Super Admin Command Center" })).toBeInTheDocument();
    expect(screen.getByText("Manage and monitor all Ilays Schools from one place.")).toBeInTheDocument();
    expect(screen.getByText("Multi-school management")).toBeInTheDocument();
    expect(screen.getByText("Centralized control")).toBeInTheDocument();
    expect(screen.getByText("Security & governance")).toBeInTheDocument();
    expect(screen.queryByText(/welcome back/i)).not.toBeInTheDocument();
  });

  it("links to the existing Schools page", async () => {
    render(<OrganizationControlCenter />);

    expect(await screen.findByRole("link", { name: "View Schools" })).toHaveAttribute("href", "/schools");
  });
});

describe("OrganizationControlCenter — summary cards use the real backend data only", () => {
  it("shows the four organization totals exactly as the backend returned them", async () => {
    render(<OrganizationControlCenter />);
    const cards = await screen.findByRole("region", { name: "Organization summary" });

    const value = (label: string) => within(cards).getByText(label).closest("div.rounded-xl")!.querySelector("p.text-2xl")!.textContent;
    expect(value("Total schools")).toBe("3");
    expect(value("Total students")).toBe("1234");
    expect(value("Total teachers")).toBe("87");
    expect(value("Total staff")).toBe("19");
  });

  it("hints are real breakdowns of the same data — never trends, growth or percentages", async () => {
    render(<OrganizationControlCenter />);
    const cards = await screen.findByRole("region", { name: "Organization summary" });

    expect(within(cards).getByText("2 active · 1 inactive")).toBeInTheDocument();
    expect(within(cards).getByText("600 male · 634 female")).toBeInTheDocument();
    expect(cards.textContent).not.toMatch(/this month|%|\+\d|growth|trend/i);
  });

  it("shows nothing invented if the totals are zero", async () => {
    apiMock.getSystemSummary.mockResolvedValue(
      summary({
        totals: { schools: 0, primarySchools: 0, secondarySchools: 0, activeSchools: 0, inactiveSchools: 0, students: 0, maleStudents: 0, femaleStudents: 0, teachers: 0, guardians: 0, staff: 0 },
        schools: [],
        recentActivity: [],
        alerts: [],
      }),
    );
    render(<OrganizationControlCenter />);
    const cards = await screen.findByRole("region", { name: "Organization summary" });

    for (const label of ["Total schools", "Total students", "Total teachers", "Total staff"]) {
      expect(within(cards).getByText(label).closest("div.rounded-xl")!.querySelector("p.text-2xl")!.textContent).toBe("0");
    }
    expect(screen.getByText("No schools yet")).toBeInTheDocument();
    expect(screen.getByText("No activity yet")).toBeInTheDocument();
  });
});

describe("OrganizationControlCenter — Schools Overview (real schools)", () => {
  it("lists every real school with type, students, teachers, staff and status", async () => {
    render(<OrganizationControlCenter />);
    await screen.findByText("Schools Overview");

    const row = screen.getByText("Ilays Primary School").closest("tr")!;
    expect(within(row).getByText("Primary")).toBeInTheDocument();
    expect(within(row).getByText("420")).toBeInTheDocument();
    expect(within(row).getByText("32")).toBeInTheDocument();
    expect(within(row).getByText("18")).toBeInTheDocument();
    expect(within(row).getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Ilays Model School").closest("tr")).toHaveTextContent("Inactive");
    expect(screen.getByText("All schools in your organization.")).toBeInTheDocument();
  });

  it("has column headers School / Type / Students / Teachers / Staff / Status / Actions", async () => {
    render(<OrganizationControlCenter />);
    await screen.findByText("Schools Overview");

    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent?.trim());
    expect(headers).toEqual(["School", "Type", "Students", "Teachers", "Staff", "Status", "Actions"]);
  });

  it("searches by name", async () => {
    const user = userEvent.setup();
    render(<OrganizationControlCenter />);
    await screen.findByText("Schools Overview");

    await user.type(screen.getByPlaceholderText("Search schools by name…"), "secondary");

    expect(screen.getByText("Ilays Secondary School")).toBeInTheDocument();
    expect(screen.queryByText("Ilays Primary School")).not.toBeInTheDocument();
  });

  it("filters by type", async () => {
    const user = userEvent.setup();
    render(<OrganizationControlCenter />);
    await screen.findByText("Schools Overview");

    await user.selectOptions(screen.getByLabelText("Filter by school type"), "SECONDARY");

    expect(screen.getByText("Ilays Secondary School")).toBeInTheDocument();
    expect(screen.queryByText("Ilays Primary School")).not.toBeInTheDocument();
    expect(screen.queryByText("Ilays Model School")).not.toBeInTheDocument();
  });

  it("filters by status, and the two filters combine", async () => {
    const user = userEvent.setup();
    render(<OrganizationControlCenter />);
    await screen.findByText("Schools Overview");

    await user.selectOptions(screen.getByLabelText("Filter by status"), "INACTIVE");
    expect(screen.getByText("Ilays Model School")).toBeInTheDocument();
    expect(screen.queryByText("Ilays Primary School")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Filter by school type"), "SECONDARY");
    expect(screen.getByText("No schools match these filters")).toBeInTheDocument();
  });

  it("opens the existing school page from a row or its View School action", async () => {
    const user = userEvent.setup();
    render(<OrganizationControlCenter />);
    await screen.findByText("Schools Overview");

    const row = screen.getByText("Ilays Secondary School").closest("tr")!;
    expect(within(row).getByRole("link", { name: "View School" })).toHaveAttribute("href", "/schools/s2");
    await user.click(screen.getByText("Ilays Secondary School"));
    expect(pushMock).toHaveBeenCalledWith("/schools/s2");
  });
});

describe("OrganizationControlCenter — Recent Activity / Audit (real audit entries)", () => {
  it("shows the real audit entries, readable, with the school and the actor", async () => {
    render(<OrganizationControlCenter />);
    const card = (await screen.findByText("Recent Activity / Audit")).closest("div.rounded-xl") as HTMLElement;

    expect(within(card).getByText("Results published")).toBeInTheDocument();
    expect(within(card).getByText(/Ilays Secondary School · by admin@secondary\.test/)).toBeInTheDocument();
    expect(within(card).getByText("School create")).toBeInTheDocument();
    expect(within(card).getByText("by super@ilays.test")).toBeInTheDocument();
    expect(within(card).getByText("2 hours ago")).toBeInTheDocument();
    expect(within(card).getByText("3 days ago")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "View All" })).toHaveAttribute("href", "/audit-log");
  });

  it("invents nothing when the audit trail is empty", async () => {
    apiMock.getSystemSummary.mockResolvedValue(summary({ recentActivity: [] }));
    render(<OrganizationControlCenter />);

    expect(await screen.findByText("No activity yet")).toBeInTheDocument();
    expect(screen.queryByText(/Teacher assigned|Academic year opened|Student promoted|Transfer completed/)).not.toBeInTheDocument();
  });
});

describe("OrganizationControlCenter — alerts and errors", () => {
  it("shows the real setup alerts and links to the school", async () => {
    render(<OrganizationControlCenter />);

    expect(await screen.findByRole("link", { name: "Ilays Model School has no active admin" })).toHaveAttribute("href", "/schools/s3");
  });

  it("shows the API's error and no numbers when the summary fails", async () => {
    apiMock.getSystemSummary.mockRejectedValue(new ApiError("Failed to load system summary"));
    render(<OrganizationControlCenter />);

    expect(await screen.findByText("Failed to load system summary")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Organization summary" })).not.toBeInTheDocument();
    // The hero itself does not depend on data.
    expect(screen.getByRole("heading", { level: 1, name: "Super Admin Command Center" })).toBeInTheDocument();
  });
});

describe("helpers", () => {
  it("humanizeAction makes the audit action readable without changing what it says", () => {
    expect(humanizeAction("RESULTS_PUBLISHED")).toBe("Results published");
    expect(humanizeAction("school.create")).toBe("School create");
    expect(humanizeAction("STUDENT_PORTAL_PASSWORD_RESET")).toBe("Student portal password reset");
    expect(humanizeAction("TOTP_ENABLED")).toBe("TOTP enabled");
  });

  it("relativeTime", () => {
    const now = new Date("2027-05-10T12:00:00Z");
    expect(relativeTime("2027-05-10T11:59:50Z", now)).toBe("just now");
    expect(relativeTime("2027-05-10T11:30:00Z", now)).toBe("30 min ago");
    expect(relativeTime("2027-05-10T11:00:00Z", now)).toBe("1 hour ago");
    expect(relativeTime("2027-05-09T12:00:00Z", now)).toBe("1 day ago");
  });
});
