import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TeacherAssignmentRecord } from "@/lib/api";
import type { TeachingSchool } from "../schoolGrouping";
import { SchoolClassesAndSubjects } from "./SchoolClassesAndSubjects";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

function assignment(overrides: Partial<TeacherAssignmentRecord> & { id: string }): TeacherAssignmentRecord {
  return {
    schoolId: "school-a",
    school: { id: "school-a", name: "Ilays Primary School", type: "PRIMARY" },
    academicYearId: "year-1",
    academicYear: { id: "year-1", name: "2027", isCurrent: true },
    subject: { id: "subject-math", name: "Mathematics" },
    section: { id: "section-5a", name: "5A", class: { id: "class-5", name: "Class 5" } },
    ...overrides,
  } as TeacherAssignmentRecord;
}

function school(assignments: TeacherAssignmentRecord[]): TeachingSchool {
  return {
    id: "school-a",
    name: "Ilays Primary School",
    type: "PRIMARY",
    assignments,
    classCount: new Set(assignments.map((a) => a.section.class.id)).size,
    sectionCount: new Set(assignments.map((a) => a.section.id)).size,
    subjectCount: new Set(assignments.map((a) => a.subject.id)).size,
  };
}

beforeEach(() => {
  pushMock.mockClear();
});

describe("SchoolClassesAndSubjects — this school's data only", () => {
  it("groups classes by academic year and subjects by subject, scoped to this school's own assignments", () => {
    const a1 = assignment({ id: "a1" });
    render(<SchoolClassesAndSubjects school={school([a1])} schoolId="school-a" canMarkAttendance={false} />);

    expect(screen.getAllByText("2027").length).toBeGreaterThan(0);
    // The one assignment renders once under "My classes" (by year) and once
    // under "My subjects" (by subject).
    expect(screen.getAllByText("Class 5 · 5A")).toHaveLength(2);
    expect(screen.getAllByText("Mathematics").length).toBeGreaterThan(0);
  });

  it("shows 'Mark attendance' only when the caller says the teacher currently can", () => {
    const a1 = assignment({ id: "a1" });
    const { rerender } = render(<SchoolClassesAndSubjects school={school([a1])} schoolId="school-a" canMarkAttendance={false} />);
    expect(screen.queryByRole("link", { name: "Mark attendance" })).not.toBeInTheDocument();

    rerender(<SchoolClassesAndSubjects school={school([a1])} schoolId="school-a" canMarkAttendance />);
    expect(screen.getByRole("link", { name: "Mark attendance" })).toBeInTheDocument();
  });

  it("navigates to this school's assignment workspace when a class card is clicked", async () => {
    const user = userEvent.setup();
    const a1 = assignment({ id: "a1" });
    render(<SchoolClassesAndSubjects school={school([a1])} schoolId="school-a" canMarkAttendance={false} />);

    await user.click(screen.getAllByText("Class 5 · 5A")[0]);

    expect(pushMock).toHaveBeenCalledWith("/my-classes/school-a/a1");
  });
});
