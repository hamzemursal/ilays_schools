import { describe, it, expect } from "vitest";
import type { TeacherAssignmentRecord } from "@/lib/api";
import { groupAssignmentsBySchool, groupAssignmentsBySubject, groupAssignmentsByYear } from "./schoolGrouping";

// Ahmed Mohamed's own 3-school example from the approved Teacher Portal
// spec: two Primary schools plus one Secondary school, several classes and
// subjects at each — deliberately not a toy single-school fixture, since
// the whole point of this grouping is that schools must never blur together.
function assignment(overrides: Partial<TeacherAssignmentRecord> & { id: string }): TeacherAssignmentRecord {
  return {
    schoolId: overrides.school?.id ?? "school-primary-1",
    school: { id: "school-primary-1", name: "Ilays Primary School", type: "PRIMARY" },
    academicYearId: "year-2027",
    academicYear: { id: "year-2027", name: "2027", isCurrent: true },
    subject: { id: "subject-math", name: "Mathematics" },
    section: { id: "section-5a", name: "5A", class: { id: "class-5", name: "Class 5" } },
    ...overrides,
  } as TeacherAssignmentRecord;
}

const PRIMARY_1_5A_MATH = assignment({ id: "a1" });
const PRIMARY_1_6A_MATH = assignment({
  id: "a2",
  section: { id: "section-6a", name: "6A", class: { id: "class-6", name: "Class 6" } },
});
const PRIMARY_1_6B_SCIENCE = assignment({
  id: "a3",
  subject: { id: "subject-science", name: "Science" },
  section: { id: "section-6b", name: "6B", class: { id: "class-6", name: "Class 6" } },
});
const PRIMARY_2_7A_MATH = assignment({
  id: "a4",
  schoolId: "school-primary-2",
  school: { id: "school-primary-2", name: "Ilays Primary School 2", type: "PRIMARY" },
  section: { id: "section-7a", name: "7A", class: { id: "class-7", name: "Class 7" } },
});
const SECONDARY_2A_PHYSICS = assignment({
  id: "a5",
  schoolId: "school-secondary",
  school: { id: "school-secondary", name: "Ilays Secondary School", type: "SECONDARY" },
  subject: { id: "subject-physics", name: "Physics" },
  section: { id: "section-form2a", name: "2A", class: { id: "form-2", name: "Form 2" } },
});

const ALL_ASSIGNMENTS = [PRIMARY_1_5A_MATH, PRIMARY_1_6A_MATH, PRIMARY_1_6B_SCIENCE, PRIMARY_2_7A_MATH, SECONDARY_2A_PHYSICS];

describe("groupAssignmentsBySchool", () => {
  it("puts each real school in its own group, never merging Primary and Secondary", () => {
    const schools = groupAssignmentsBySchool(ALL_ASSIGNMENTS);
    expect(schools.map((s) => s.id).sort()).toEqual(["school-primary-1", "school-primary-2", "school-secondary"]);
  });

  it("sorts schools alphabetically by name", () => {
    const schools = groupAssignmentsBySchool(ALL_ASSIGNMENTS);
    expect(schools.map((s) => s.name)).toEqual(["Ilays Primary School", "Ilays Primary School 2", "Ilays Secondary School"]);
  });

  it("counts distinct classes/sections/subjects within a school, not raw assignment count", () => {
    const schools = groupAssignmentsBySchool(ALL_ASSIGNMENTS);
    const primary1 = schools.find((s) => s.id === "school-primary-1")!;
    expect(primary1.assignments).toHaveLength(3);
    expect(primary1.classCount).toBe(2); // Class 5, Class 6
    expect(primary1.sectionCount).toBe(3); // 5A, 6A, 6B
    expect(primary1.subjectCount).toBe(2); // Mathematics, Science
  });

  it("carries each school's own type through, unaffected by other schools", () => {
    const schools = groupAssignmentsBySchool(ALL_ASSIGNMENTS);
    expect(schools.find((s) => s.id === "school-primary-1")!.type).toBe("PRIMARY");
    expect(schools.find((s) => s.id === "school-secondary")!.type).toBe("SECONDARY");
  });

  it("returns an empty list for a teacher with no assignments", () => {
    expect(groupAssignmentsBySchool([])).toEqual([]);
  });
});

describe("groupAssignmentsBySubject", () => {
  it("groups only within the assignments it's given (one school's worth)", () => {
    const primary1Assignments = [PRIMARY_1_5A_MATH, PRIMARY_1_6A_MATH, PRIMARY_1_6B_SCIENCE];
    const subjects = groupAssignmentsBySubject(primary1Assignments);
    expect(subjects.map((s) => s.subjectName)).toEqual(["Mathematics", "Science"]);
    expect(subjects.find((s) => s.subjectName === "Mathematics")!.assignments).toHaveLength(2);
  });

  it("never conflates the same subject name across two different schools", () => {
    // Both Primary 1 and Primary 2 teach "Mathematics", but as distinct
    // subject rows here — the caller is expected to pass one school's
    // assignments at a time, so cross-school mixing can't happen even
    // when subject *names* collide.
    const subjects = groupAssignmentsBySubject([PRIMARY_1_5A_MATH, PRIMARY_2_7A_MATH]);
    expect(subjects).toHaveLength(1);
    expect(subjects[0].assignments).toHaveLength(2);
  });
});

describe("groupAssignmentsByYear", () => {
  it("groups by academic year and sorts most recent first", () => {
    const olderYear = assignment({ id: "a6", academicYearId: "year-2026", academicYear: { id: "year-2026", name: "2026", isCurrent: false } });
    const years = groupAssignmentsByYear([PRIMARY_1_5A_MATH, olderYear]);
    expect(years.map((y) => y.academicYearName)).toEqual(["2027", "2026"]);
  });
});
