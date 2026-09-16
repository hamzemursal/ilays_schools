import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Teacher, TeacherAssignmentRecord } from "@/lib/api";
import { ToastProvider } from "@/components/ui/Toast";
import { AssignmentsManager } from "./AssignmentsManager";

vi.mock("@/lib/api", () => ({ api: { listAcademicYears: vi.fn(), listClasses: vi.fn(), listClassSubjects: vi.fn() } }));
vi.mock("../api", () => ({ teachersApi: { list: vi.fn().mockResolvedValue([]) } }));

function assignment(overrides: Partial<TeacherAssignmentRecord> & { id: string }): TeacherAssignmentRecord {
  return {
    schoolId: "school-a",
    school: { id: "school-a", name: "Ilays Primary School", type: "PRIMARY" },
    academicYearId: "year-1",
    academicYear: { id: "year-1", name: "2025-2026", isCurrent: true },
    subject: { id: "subject-math", name: "Mathematics" },
    section: { id: "section-5a", name: "5A", class: { id: "class-5", name: "Class 5" } },
    ...overrides,
  } as TeacherAssignmentRecord;
}

function teacher(overrides: Partial<Teacher> = {}): Teacher {
  return {
    id: "teacher-1",
    userId: "user-1",
    teacherCode: "TCH-00001",
    employeeNumber: "EMP-00001",
    firstName: "Ahmed",
    lastName: "Mohamed",
    sex: null,
    dateOfBirth: null,
    phone: null,
    email: null,
    address: null,
    qualification: null,
    specialization: null,
    employmentDate: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    status: "ACTIVE",
    assignments: [],
    ...overrides,
  };
}

function renderManager(
  assignments: TeacherAssignmentRecord[],
  opts: { canSeeAllSchools?: boolean; schoolId?: string } = {},
) {
  return render(
    <ToastProvider>
      <AssignmentsManager
        accessToken="token-1"
        schoolId={opts.schoolId ?? "school-a"}
        teacher={teacher({ assignments })}
        canManage={false}
        canSeeAllSchools={opts.canSeeAllSchools ?? false}
        onChange={vi.fn()}
      />
    </ToastProvider>,
  );
}

// Ahmed teaches at "school-a" (the school this page is for) AND at
// "school-b" (a different school entirely) — this is exactly the shape a
// cross-school-assigned teacher has after AssignExistingTeacherForm links
// them here. The whole point of AssignmentsManager's own scoping is that
// school-b's class must never appear on school-a's admin page for a viewer
// who isn't allowed to see across schools.
const SCHOOL_A_ASSIGNMENT = assignment({ id: "a1" });
const SCHOOL_A_ASSIGNMENT_2 = assignment({
  id: "a1b",
  subject: { id: "subject-english", name: "English" },
  section: { id: "section-5b", name: "5B", class: { id: "class-5", name: "Class 5" } },
});
const SCHOOL_B_ASSIGNMENT = assignment({
  id: "a2",
  schoolId: "school-b",
  school: { id: "school-b", name: "Ilays Secondary School", type: "SECONDARY" },
  subject: { id: "subject-physics", name: "Physics" },
  section: { id: "section-form2a", name: "2A", class: { id: "form-2", name: "Form 2" } },
});

describe("AssignmentsManager — non-Super-Admin viewers (school isolation)", () => {
  it("shows only this school's assignments, never a class/subject belonging to another school", () => {
    renderManager([SCHOOL_A_ASSIGNMENT, SCHOOL_B_ASSIGNMENT]);

    expect(screen.getByText("Class 5")).toBeInTheDocument();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.queryByText("Form 2")).not.toBeInTheDocument();
    expect(screen.queryByText("Physics")).not.toBeInTheDocument();
  });

  it("shows a 'My school' header naming only this school — never a school count, another school's name, or 'also teaches elsewhere'", () => {
    render(
      <ToastProvider>
        <AssignmentsManager
          accessToken="token-1"
          schoolId="school-a"
          teacher={teacher({ assignments: [SCHOOL_A_ASSIGNMENT, SCHOOL_B_ASSIGNMENT] })}
          canManage={false}
          canSeeAllSchools={false}
          schoolName="Ilays Primary School"
          onChange={vi.fn()}
        />
      </ToastProvider>,
    );

    expect(screen.getByText("My school")).toBeInTheDocument();
    expect(screen.getByText("Ilays Primary School")).toBeInTheDocument();
    expect(screen.queryByText(/other school/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Assigned to \d+ schools?/)).not.toBeInTheDocument();
    expect(screen.queryByText("Ilays Secondary School")).not.toBeInTheDocument();
  });

  it("falls back to a generic label, never another school's name, when schoolName isn't provided", () => {
    renderManager([SCHOOL_A_ASSIGNMENT, SCHOOL_B_ASSIGNMENT]);

    expect(screen.getByText("This school")).toBeInTheDocument();
    expect(screen.queryByText("Ilays Secondary School")).not.toBeInTheDocument();
  });

  it("shows the 'no assignments at this school' empty state when every assignment belongs to another school", () => {
    renderManager([SCHOOL_B_ASSIGNMENT]);

    expect(screen.getByText("No assignments at this school yet")).toBeInTheDocument();
    expect(screen.queryByText("Form 2")).not.toBeInTheDocument();
  });

  it("never shows the 'Assigned schools' switcher, even for a teacher assigned to more than one school", () => {
    renderManager([SCHOOL_A_ASSIGNMENT, SCHOOL_B_ASSIGNMENT]);

    expect(screen.queryByText("Assigned schools")).not.toBeInTheDocument();
  });

  it("shows no organization-wide class/section/subject totals — only this school's own counts, if any are shown at all", () => {
    renderManager([SCHOOL_A_ASSIGNMENT, SCHOOL_A_ASSIGNMENT_2, SCHOOL_B_ASSIGNMENT]);

    // Class 5 has 2 sections at school-a; nothing here should ever total in
    // school-b's Form 2 on top of that.
    expect(screen.getByText("2 sections")).toBeInTheDocument();
    expect(screen.queryByText("3 sections")).not.toBeInTheDocument();
  });
});

describe("AssignmentsManager — Class / Section / Subject hierarchy", () => {
  it("nests subjects under their own section, and sections under their own class — never one flattened string", () => {
    renderManager([SCHOOL_A_ASSIGNMENT, SCHOOL_A_ASSIGNMENT_2]);

    expect(screen.getByText("Class 5")).toBeInTheDocument();
    expect(screen.getByText("Section 5A")).toBeInTheDocument();
    expect(screen.getByText("Section 5B")).toBeInTheDocument();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("English")).toBeInTheDocument();
    // The old single-line format must be gone entirely.
    expect(screen.queryByText(/Class 5 · 5A/)).not.toBeInTheDocument();
  });

  it("shows real class/section/subject counts, not raw assignment totals", () => {
    renderManager([SCHOOL_A_ASSIGNMENT, SCHOOL_A_ASSIGNMENT_2]);

    expect(screen.getByText("2 sections")).toBeInTheDocument();
    expect(screen.getAllByText("1 subject").length).toBe(2);
  });

  it("collapses a class's sections when its header is clicked, and expands it again on a second click", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    renderManager([SCHOOL_A_ASSIGNMENT]);

    expect(screen.getByText("Section 5A")).toBeInTheDocument();
    await user.click(screen.getByText("Class 5"));
    expect(screen.queryByText("Section 5A")).not.toBeInTheDocument();

    await user.click(screen.getByText("Class 5"));
    expect(screen.getByText("Section 5A")).toBeInTheDocument();
  });
});

describe("AssignmentsManager — Academic Year history", () => {
  const CURRENT_YEAR = assignment({ id: "cur", academicYearId: "year-2026", academicYear: { id: "year-2026", name: "2025-2026", isCurrent: true } });
  const PAST_YEAR = assignment({
    id: "past",
    academicYearId: "year-2025",
    academicYear: { id: "year-2025", name: "2024-2025", isCurrent: false },
    subject: { id: "subject-biology", name: "Biology" },
    section: { id: "section-old", name: "OldA", class: { id: "class-old", name: "Class Old" } },
  });

  it("shows a tab per academic year the teacher has ever been assigned at this school", () => {
    renderManager([CURRENT_YEAR, PAST_YEAR]);

    expect(screen.getByText("2025-2026")).toBeInTheDocument();
    expect(screen.getByText("2024-2025")).toBeInTheDocument();
  });

  it("marks the current academic year, and defaults to showing it", () => {
    renderManager([CURRENT_YEAR, PAST_YEAR]);

    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByText("Class 5")).toBeInTheDocument();
    expect(screen.queryByText("Class Old")).not.toBeInTheDocument();
  });

  it("switching to a previous year shows that year's own historical assignments, not the current year's", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    renderManager([CURRENT_YEAR, PAST_YEAR]);

    await user.click(screen.getByText("2024-2025"));

    expect(screen.getByText("Class Old")).toBeInTheDocument();
    expect(screen.getByText("Biology")).toBeInTheDocument();
    expect(screen.queryByText("Class 5")).not.toBeInTheDocument();
  });
});

describe("AssignmentsManager — Super Admin, multiple schools", () => {
  it("shows the 'Assigned schools' switcher with real per-school counts", () => {
    renderManager([SCHOOL_A_ASSIGNMENT, SCHOOL_B_ASSIGNMENT], { canSeeAllSchools: true });

    expect(screen.getByText("Assigned schools")).toBeInTheDocument();
    expect(screen.getByText("Ilays Primary School")).toBeInTheDocument();
    expect(screen.getByText("Ilays Secondary School")).toBeInTheDocument();
  });

  it("defaults to this page's own school, marked Selected, showing only that school's classes", () => {
    renderManager([SCHOOL_A_ASSIGNMENT, SCHOOL_B_ASSIGNMENT], { canSeeAllSchools: true, schoolId: "school-a" });

    expect(screen.getByText("Selected")).toBeInTheDocument();
    expect(screen.getByText("Class 5")).toBeInTheDocument();
    expect(screen.queryByText("Form 2")).not.toBeInTheDocument();
  });

  it("switching to another school shows only that school's classes, never mixed with the first", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    renderManager([SCHOOL_A_ASSIGNMENT, SCHOOL_B_ASSIGNMENT], { canSeeAllSchools: true, schoolId: "school-a" });

    await user.click(screen.getByText("Ilays Secondary School"));

    expect(screen.getByText("Form 2")).toBeInTheDocument();
    expect(screen.getByText("Physics")).toBeInTheDocument();
    expect(screen.queryByText("Class 5")).not.toBeInTheDocument();
    expect(screen.queryByText("Mathematics")).not.toBeInTheDocument();
  });

  it("shows the singular '1 school' worth of card, with no switcher, for a teacher assigned to only one school", () => {
    renderManager([SCHOOL_A_ASSIGNMENT], { canSeeAllSchools: true });

    expect(screen.getByText("Assigned schools")).toBeInTheDocument();
    expect(screen.getAllByText("Ilays Primary School").length).toBeGreaterThan(0);
    expect(screen.queryByText("Ilays Secondary School")).not.toBeInTheDocument();
  });

  it("shows a real organization-wide summary — schools/classes/sections/subjects deduped across every school, not per-school totals added up", () => {
    renderManager([SCHOOL_A_ASSIGNMENT, SCHOOL_A_ASSIGNMENT_2, SCHOOL_B_ASSIGNMENT], { canSeeAllSchools: true });

    expect(screen.getByText("Assigned to 2 schools")).toBeInTheDocument();
    expect(screen.getByText("3 class-subject assignments")).toBeInTheDocument();
    // Mathematics, English, Physics — 3 distinct subjects across both schools.
    expect(screen.getByText("3 subjects")).toBeInTheDocument();
    // Class 5 (school-a) and Form 2 (school-b) — 2 distinct classes.
    expect(screen.getByText("2 classes")).toBeInTheDocument();
    // 5A, 5B, 2A — 3 distinct sections.
    expect(screen.getByText("3 sections")).toBeInTheDocument();
  });
});

describe("AssignmentsManager — empty state", () => {
  it("shows an empty state, not a switcher or hierarchy, for a teacher with no assignments anywhere", () => {
    renderManager([], { canSeeAllSchools: true });

    expect(screen.getByText("No assignments at this school yet")).toBeInTheDocument();
    expect(screen.queryByText("Assigned schools")).not.toBeInTheDocument();
  });
});
