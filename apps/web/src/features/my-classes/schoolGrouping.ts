import type { SchoolType, TeacherAssignmentRecord } from "@/lib/api";

export interface TeachingSchool {
  id: string;
  name: string;
  type: SchoolType;
  assignments: TeacherAssignmentRecord[];
  classCount: number;
  sectionCount: number;
  subjectCount: number;
}

// Every assignment already carries its own real school (see
// TeacherAssignmentRecord.school) — a teacher's assignments are grouped by
// that, never assumed to all belong to one "home" school. Primary and
// Secondary schools are never merged into one group just because they
// happen to share an organization; each real School row is its own group.
export function groupAssignmentsBySchool(assignments: TeacherAssignmentRecord[]): TeachingSchool[] {
  const bySchool = new Map<string, TeacherAssignmentRecord[]>();
  for (const a of assignments) {
    const list = bySchool.get(a.school.id) ?? [];
    list.push(a);
    bySchool.set(a.school.id, list);
  }

  return Array.from(bySchool.entries())
    .map(([schoolId, list]) => ({
      id: schoolId,
      name: list[0].school.name,
      type: list[0].school.type,
      assignments: list,
      classCount: new Set(list.map((a) => a.section.class.id)).size,
      sectionCount: new Set(list.map((a) => a.section.id)).size,
      subjectCount: new Set(list.map((a) => a.subject.id)).size,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface SubjectGroup {
  subjectId: string;
  subjectName: string;
  assignments: TeacherAssignmentRecord[];
}

// Subject-first grouping for "My Subjects" — always scoped to ONE school's
// assignments (the caller passes only that school's list), so this never
// mixes "Mathematics at School A" with "Mathematics at School B" under one
// heading, even though they're the same subject name.
export function groupAssignmentsBySubject(assignments: TeacherAssignmentRecord[]): SubjectGroup[] {
  const bySubject = new Map<string, TeacherAssignmentRecord[]>();
  for (const a of assignments) {
    const list = bySubject.get(a.subject.id) ?? [];
    list.push(a);
    bySubject.set(a.subject.id, list);
  }

  return Array.from(bySubject.entries())
    .map(([subjectId, list]) => ({ subjectId, subjectName: list[0].subject.name, assignments: list }))
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName));
}

export interface YearGroup {
  academicYearId: string;
  academicYearName: string;
  assignments: TeacherAssignmentRecord[];
}

// Year-first grouping for "My Classes" — same one-school-at-a-time scoping
// as groupAssignmentsBySubject.
export function groupAssignmentsByYear(assignments: TeacherAssignmentRecord[]): YearGroup[] {
  const byYear = new Map<string, TeacherAssignmentRecord[]>();
  for (const a of assignments) {
    const list = byYear.get(a.academicYearId) ?? [];
    list.push(a);
    byYear.set(a.academicYearId, list);
  }

  return Array.from(byYear.entries())
    .map(([academicYearId, list]) => ({ academicYearId, academicYearName: list[0].academicYear.name, assignments: list }))
    .sort((a, b) => b.academicYearName.localeCompare(a.academicYearName));
}
