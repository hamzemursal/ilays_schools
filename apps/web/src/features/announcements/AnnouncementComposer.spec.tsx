import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnnouncementComposer } from "./AnnouncementComposer";
import { schoolNavItems } from "@/components/layout/nav-config";

const { ApiError } = vi.hoisted(() => {
  class ApiError extends Error {}
  return { ApiError };
});
vi.mock("@/lib/auth-context", () => ({ ApiError }));

const apiMock = vi.hoisted(() => ({
  listAcademicYears: vi.fn(),
  listClasses: vi.fn(),
  previewAnnouncement: vi.fn(),
  searchAnnouncementRecipients: vi.fn(),
  createAnnouncement: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock }));

const YEAR = { id: "y1", name: "2029-2030", isCurrent: true, startDate: "", endDate: "", terms: [] };
const FORM3 = {
  id: "c3",
  name: "Form 3",
  level: 3,
  division: {},
  _count: { classSubjects: 0 },
  sections: [
    { id: "sA", name: "A", capacity: null, _count: { enrollments: 0 } },
    { id: "sB", name: "B", capacity: null, _count: { enrollments: 0 } },
  ],
};

function renderComposer() {
  const onPosted = vi.fn();
  render(<AnnouncementComposer accessToken="t" schoolId="school-1" onPosted={onPosted} onCancel={vi.fn()} />);
  return { onPosted };
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.listAcademicYears.mockResolvedValue([YEAR]);
  apiMock.listClasses.mockResolvedValue([FORM3]);
  apiMock.previewAnnouncement.mockResolvedValue({ recipients: 12 });
  apiMock.createAnnouncement.mockResolvedValue({ id: "a1" });
});

describe("AnnouncementComposer — progressive audience targeting", () => {
  it("defaults to Everyone (current), whole school, and previews the reach", async () => {
    renderComposer();
    expect(await screen.findByText("Will reach approximately 12 people.")).toBeInTheDocument();
    expect(apiMock.previewAnnouncement).toHaveBeenCalledWith("t", "school-1", { audience: "ALL" });
    expect(screen.queryByLabelText("Class")).not.toBeInTheDocument();
  });

  it("shows Year, Class and Section only for a section scope, and posts that exact target", async () => {
    const user = userEvent.setup();
    const { onPosted } = renderComposer();
    await user.selectOptions(screen.getByLabelText("Audience"), "PARENTS");
    await user.selectOptions(screen.getByLabelText("Scope"), "SECTION");
    await screen.findByRole("option", { name: "Form 3" });
    await user.selectOptions(screen.getByLabelText("Class"), "c3");
    await user.selectOptions(screen.getByLabelText("Section"), "sB");
    await user.type(screen.getByLabelText(/Title/), "Trip");
    await user.type(screen.getByLabelText(/Message/), "Bring a hat");

    await waitFor(() =>
      expect(apiMock.previewAnnouncement).toHaveBeenLastCalledWith("t", "school-1", {
        audience: "PARENTS",
        academicYearId: "y1",
        classId: "c3",
        sectionId: "sB",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Post announcement" }));

    await waitFor(() =>
      expect(apiMock.createAnnouncement).toHaveBeenCalledWith("t", "school-1", {
        title: "Trip",
        body: "Bring a hat",
        audience: "PARENTS",
        academicYearId: "y1",
        classId: "c3",
        sectionId: "sB",
      }),
    );
    expect(onPosted).toHaveBeenCalled();
  });

  it("never offers a scope for school-wide audiences such as Alumni", async () => {
    const user = userEvent.setup();
    renderComposer();
    await user.selectOptions(screen.getByLabelText("Audience"), "ALUMNI");
    expect(screen.queryByLabelText("Scope")).not.toBeInTheDocument();
    await waitFor(() => expect(apiMock.previewAnnouncement).toHaveBeenLastCalledWith("t", "school-1", { audience: "ALUMNI" }));
  });

  it("Specific People: search, pick, and send only the chosen people", async () => {
    const user = userEvent.setup();
    apiMock.searchAnnouncementRecipients.mockResolvedValue([{ userId: "u-grad", name: "Ahlam Ali", kind: "Alumni" }]);
    renderComposer();
    await user.selectOptions(screen.getByLabelText("Audience"), "INDIVIDUAL");
    expect(screen.getByText("Choose at least one person.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Post announcement" })).toBeDisabled();

    await user.type(screen.getByLabelText("People"), "Ahl");
    await user.click(await screen.findByRole("option", { name: /Ahlam Ali/ }));

    expect(screen.getByRole("button", { name: "Remove Ahlam Ali" })).toBeInTheDocument();
    await waitFor(() =>
      expect(apiMock.previewAnnouncement).toHaveBeenLastCalledWith("t", "school-1", { audience: "INDIVIDUAL", recipientUserIds: ["u-grad"] }),
    );
  });
});

describe("Announcements nav — own inbox for teachers and staff", () => {
  const base = { schools: [], schoolIds: [] } as never;

  it("a teacher without the management permission gets the /announcements inbox", () => {
    const items = schoolNavItems({ ...(base as object), roles: ["TEACHER"], permissions: [] } as never, "school-1");
    expect(items.find((i) => i.label === "Announcements")?.href).toBe("/announcements");
  });

  it("an admin with announcements.view keeps the management page instead", () => {
    const items = schoolNavItems({ ...(base as object), roles: ["SCHOOL_ADMIN"], permissions: ["announcements.view"] } as never, "school-1");
    expect(items.filter((i) => i.label === "Announcements").map((i) => i.href)).toEqual(["/schools/school-1/announcements"]);
  });
});
