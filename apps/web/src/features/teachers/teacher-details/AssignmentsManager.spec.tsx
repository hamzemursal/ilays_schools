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
    academicYear: { id: "year-1", name: "2027" },
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

function renderManager(assignments: TeacherAssignmentRecord[]) {
  return render(
    <ToastProvider>
      <AssignmentsManager
        accessToken="token-1"
        schoolId="school-a"
        teacher={teacher({ assignments })}
        canManage={false}
        onChange={vi.fn()}
      />
    </ToastProvider>,
  );
}

// Ahmed teaches at "school-a" (the school this page is for) AND at
// "school-b" (a different school entirely) — this is exactly the shape a
// cross-school-assigned teacher has after AssignExistingTeacherForm links
// them here. The whole point of AssignmentsManager's own scoping is that
// school-b's class must never appear on school-a's admin page.
const SCHOOL_A_ASSIGNMENT = assignment({ id: "a1" });
const SCHOOL_B_ASSIGNMENT = assignment({
  id: "a2",
  schoolId: "school-b",
  school: { id: "school-b", name: "Ilays Secondary School", type: "SECONDARY" },
  subject: { id: "subject-physics", name: "Physics" },
  section: { id: "section-form2a", name: "2A", class: { id: "form-2", name: "Form 2" } },
});

describe("AssignmentsManager — school isolation", () => {
  it("shows only this school's assignments, never a class/subject belonging to another school", () => {
    renderManager([SCHOOL_A_ASSIGNMENT, SCHOOL_B_ASSIGNMENT]);

    expect(screen.getByText("Class 5 · 5A — Mathematics")).toBeInTheDocument();
    expect(screen.queryByText("Form 2 · 2A — Physics")).not.toBeInTheDocument();
  });

  it("notes that the teacher also works at other schools, without naming or detailing them", () => {
    renderManager([SCHOOL_A_ASSIGNMENT, SCHOOL_B_ASSIGNMENT]);

    expect(screen.getByText(/Also teaches at 1 other school\./)).toBeInTheDocument();
    expect(screen.queryByText(/Ilays Secondary School/)).not.toBeInTheDocument();
  });

  it("says nothing about other schools when this teacher only works here", () => {
    renderManager([SCHOOL_A_ASSIGNMENT]);

    expect(screen.queryByText(/other school/)).not.toBeInTheDocument();
  });

  it("shows the 'no assignments at this school' empty state when every assignment belongs to another school", () => {
    renderManager([SCHOOL_B_ASSIGNMENT]);

    expect(screen.getByText("No assignments at this school yet")).toBeInTheDocument();
    expect(screen.queryByText("Form 2 · 2A — Physics")).not.toBeInTheDocument();
  });
});
