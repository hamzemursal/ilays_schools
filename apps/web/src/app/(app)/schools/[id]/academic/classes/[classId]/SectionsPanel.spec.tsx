import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ClassWithSections, Section, SectionTeacherAssignment } from "@/lib/api";
import { SectionsPanel } from "./page";

// The redesigned Section card is presentation-only: it must still surface
// exactly the real counts and links the old card did, just laid out
// differently — never inventing a number the API didn't return, and never
// dropping the ?year= that keeps a non-current year's Open Section link
// pointed at the right academic year (see the sibling page.spec.tsx's
// "Class not found" regression this same pattern already guards against).

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

function classFixture(overrides: Partial<ClassWithSections> = {}): ClassWithSections {
  return {
    id: "class-form3",
    name: "Form 3",
    level: 3,
    division: { id: "div-secondary", type: "SECONDARY" },
    sections: [],
    _count: { classSubjects: 0 },
    ...overrides,
  };
}

function sectionFixture(overrides: Partial<Section> = {}): Section {
  return { id: "section-a", name: "A", capacity: null, _count: { enrollments: 24 }, ...overrides };
}

function assignment(overrides: Partial<SectionTeacherAssignment> = {}): SectionTeacherAssignment {
  return {
    id: "assign-1",
    subjectId: "subj-math",
    subject: { id: "subj-math", name: "Mathematics", code: null },
    teacher: { id: "teacher-1", firstName: "Amran", lastName: "Hassan" },
    ...overrides,
  };
}

const BASE_PROPS = {
  search: "",
  onSearchChange: vi.fn(),
  cls: classFixture(),
  schoolName: "Saamalay Secondary",
  yearName: "2027",
  isCurrentYear: true,
  assignmentsBySection: {} as Record<string, SectionTeacherAssignment[]>,
  canManage: true,
  editingSectionId: null,
  sectionEditName: "",
  sectionEditCapacity: "",
  savingSectionId: null,
  onStartEdit: vi.fn(),
  onEditNameChange: vi.fn(),
  onEditCapacityChange: vi.fn(),
  onSaveEdit: vi.fn(),
  onCancelEdit: vi.fn(),
  onDelete: vi.fn(),
  sectionName: "",
  onSectionNameChange: vi.fn(),
  onAddSection: vi.fn(),
  sectionFormError: null,
};

function renderPanel(overrides: Partial<Parameters<typeof SectionsPanel>[0]> = {}) {
  return render(<SectionsPanel {...BASE_PROPS} sections={[sectionFixture()]} {...overrides} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SectionsPanel — real counts from API data", () => {
  it("shows the section's real enrollment count, never a fabricated one", () => {
    renderPanel({ sections: [sectionFixture({ _count: { enrollments: 24 } })] });
    expect(screen.getByText("24")).toBeInTheDocument();
  });

  it("shows students as 'enrolled/capacity' when a capacity is set", () => {
    renderPanel({ sections: [sectionFixture({ _count: { enrollments: 24 }, capacity: 30 })] });
    expect(screen.getByText("24/30")).toBeInTheDocument();
  });

  it("derives Subjects/Teachers counts from the real teacher-assignment rows, deduplicated", () => {
    renderPanel({
      assignmentsBySection: {
        "section-a": [
          assignment(),
          assignment({ id: "assign-2", subjectId: "subj-eng", subject: { id: "subj-eng", name: "English", code: null } }),
          // Same teacher assigned to a second subject — Teachers must count Amran once, Subjects must count twice.
          assignment({ id: "assign-3", subjectId: "subj-sci", subject: { id: "subj-sci", name: "Science", code: null } }),
        ],
      },
    });
    // 3 subjects, 1 teacher.
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("shows a loading ellipsis for Subjects/Teachers while assignments haven't loaded yet, never a fake 0", () => {
    renderPanel({ assignmentsBySection: {} });
    expect(screen.getAllByText("…").length).toBe(2);
  });
});

describe("SectionsPanel — Current Year / Previous Year", () => {
  it("marks the section Active for the current year", () => {
    renderPanel({ isCurrentYear: true });
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("marks the section Previous Year when viewing a non-current year", () => {
    renderPanel({ isCurrentYear: false, yearName: "2026" });
    expect(screen.getByText("Previous Year")).toBeInTheDocument();
  });
});

describe("SectionsPanel — Open Section preserves year/class scoping", () => {
  it("builds the Open Section link with the class slug, section slug, and ?year=", () => {
    renderPanel({ yearName: "2027", cls: classFixture({ level: 3 }) });
    const link = screen.getByRole("link", { name: /Open Section/ });
    expect(link).toHaveAttribute(
      "href",
      "/schools/saamalay-secondary/academic/classes/secondary-3/sections/a?year=2027",
    );
  });
});

describe("SectionsPanel — Edit / Delete", () => {
  it("hides Edit and the actions menu without canManage", () => {
    renderPanel({ canManage: false });
    expect(screen.queryByRole("button", { name: "Edit Section A" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More actions for Section A" })).not.toBeInTheDocument();
  });

  it("calls onStartEdit with the real section when Edit is clicked", async () => {
    const user = userEvent.setup();
    const onStartEdit = vi.fn();
    renderPanel({ onStartEdit });
    await user.click(screen.getByRole("button", { name: "Edit Section A" }));
    expect(onStartEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "section-a", name: "A" }));
  });

  it("switches to the edit form when editingSectionId matches this section", () => {
    renderPanel({ editingSectionId: "section-a", sectionEditName: "A" });
    expect(screen.getByPlaceholderText("Section name")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open Section/ })).not.toBeInTheDocument();
  });

  it("calls onDelete with the real section from the '...' actions menu", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    renderPanel({ onDelete });
    await user.click(screen.getByRole("button", { name: "More actions for Section A" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: "section-a", name: "A" }));
  });
});

describe("SectionsPanel — search", () => {
  it("shows the search box only once there is more than one section", () => {
    const { rerender } = renderPanel({ sections: [sectionFixture()] });
    expect(screen.queryByLabelText("Search sections")).not.toBeInTheDocument();
    rerender(
      <SectionsPanel
        {...BASE_PROPS}
        sections={[sectionFixture(), sectionFixture({ id: "section-b", name: "B" })]}
      />,
    );
    expect(screen.getByLabelText("Search sections")).toBeInTheDocument();
  });

  it("filters the visible section cards by name", () => {
    renderPanel({
      sections: [sectionFixture(), sectionFixture({ id: "section-b", name: "B" }), sectionFixture({ id: "section-c", name: "C" })],
      search: "b",
    });
    expect(screen.getByText("Section B")).toBeInTheDocument();
    expect(screen.queryByText("Section A")).not.toBeInTheDocument();
    expect(screen.queryByText("Section C")).not.toBeInTheDocument();
  });

  it("shows a 'no match' empty state when the search matches nothing, without ever hiding an unrelated section by mistake", () => {
    renderPanel({
      sections: [sectionFixture(), sectionFixture({ id: "section-b", name: "B" })],
      search: "zzz",
    });
    expect(screen.getByText("No sections match your search")).toBeInTheDocument();
  });
});

describe("SectionsPanel — Create Section", () => {
  it("shows the Create Section form only with canManage", () => {
    renderPanel({ canManage: false });
    expect(screen.queryByRole("button", { name: "Create Section" })).not.toBeInTheDocument();
  });

  it("submits the real onAddSection handler with the typed name", async () => {
    const user = userEvent.setup();
    const onAddSection = vi.fn((e: React.FormEvent) => e.preventDefault());
    const onSectionNameChange = vi.fn();
    renderPanel({ onAddSection, onSectionNameChange, sectionName: "D" });
    await user.click(screen.getByRole("button", { name: "Create Section" }));
    expect(onAddSection).toHaveBeenCalledTimes(1);
  });
});

describe("SectionsPanel — empty state", () => {
  it("shows an empty state with no sections at all", () => {
    renderPanel({ sections: [] });
    expect(screen.getByText("No sections yet")).toBeInTheDocument();
  });
});
