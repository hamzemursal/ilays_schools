import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Teacher, TeacherAssignmentRecord } from "@/lib/api";
import { TeachersTable } from "./TeachersTable";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../api", () => ({ teachersApi: { getPhotoUrl: vi.fn().mockRejectedValue(new Error("no photo")) } }));

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

describe("TeachersTable — Assignments column is scoped to this school", () => {
  it("counts only assignments at this school, not the teacher's total across every school they work at", () => {
    const crossSchoolTeacher = teacher({
      assignments: [
        assignment({ id: "a1" }),
        assignment({ id: "a2", subject: { id: "subject-science", name: "Science" }, section: { id: "section-6b", name: "6B", class: { id: "class-6", name: "Class 6" } } }),
        // A third assignment at a different school entirely — must not be counted here.
        assignment({
          id: "a3",
          schoolId: "school-b",
          school: { id: "school-b", name: "Ilays Secondary School", type: "SECONDARY" },
          subject: { id: "subject-physics", name: "Physics" },
        }),
      ],
    });

    render(<TeachersTable schoolId="school-a" accessToken="token-1" teachers={[crossSchoolTeacher]} />);

    expect(screen.getByText("2 class-subject")).toBeInTheDocument();
  });

  it("shows 'None' when every assignment this teacher holds belongs to a different school", () => {
    const otherSchoolOnlyTeacher = teacher({
      assignments: [assignment({ id: "a1", schoolId: "school-b", school: { id: "school-b", name: "Ilays Secondary School", type: "SECONDARY" } })],
    });

    render(<TeachersTable schoolId="school-a" accessToken="token-1" teachers={[otherSchoolOnlyTeacher]} />);

    expect(screen.getByText("None")).toBeInTheDocument();
  });
});
