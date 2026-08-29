const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; accessToken?: string | null } = {},
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(", ") : data?.message;
    throw new ApiError(message ?? `Request failed with status ${res.status}`, res.status, data);
  }
  return data as T;
}

export interface Profile {
  id: string;
  email: string;
  organizationId: string | null;
  roles: string[];
  permissions: string[];
  schoolIds: string[];
  schools: { id: string; name: string }[];
}

export type SchoolType = "PRIMARY" | "SECONDARY" | "PRIMARY_AND_SECONDARY";

export interface School {
  id: string;
  name: string;
  type: SchoolType;
  status: "ACTIVE" | "INACTIVE";
  address: string | null;
  phone: string | null;
  email: string | null;
  createdAt: string;
}

export type DivisionType = "PRIMARY" | "SECONDARY";

export interface Division {
  id: string;
  type: DivisionType;
}

export interface Section {
  id: string;
  name: string;
  capacity: number;
  _count: { enrollments: number };
}

export interface ClassWithSections {
  id: string;
  name: string;
  level: number;
  division: Division;
  sections: { id: string; name: string; capacity: number }[];
}

export interface AcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export interface Subject {
  id: string;
  name: string;
  code: string | null;
}

export type Sex = "MALE" | "FEMALE";
export type GuardianRelationship = "FATHER" | "MOTHER" | "GUARDIAN" | "OTHER";

export interface StudentListItem {
  enrollmentId: string;
  studentId: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  rollNumber: number;
  className: string;
  sectionName: string;
}

export interface DuplicateCandidate {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
}

export interface CreateStudentInput {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: Sex;
  enrollment: { academicYearId: string; classId: string; sectionId: string };
  guardians?: {
    firstName: string;
    lastName: string;
    phone?: string;
    email?: string;
    relationship: GuardianRelationship;
    isPrimaryContact?: boolean;
  }[];
  confirmDespiteDuplicates?: boolean;
}

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

export interface MyAssignment {
  id: string;
  schoolId: string;
  section: { id: string; name: string; class: { id: string; name: string } };
  subject: { id: string; name: string };
  academicYear: { id: string; name: string };
}

export interface AttendanceRow {
  enrollmentId: string;
  studentId: string;
  firstName: string;
  lastName: string;
  rollNumber: number;
  status: AttendanceStatus | null;
  note: string | null;
}

export type ExamType = "QUIZ" | "MIDTERM" | "FINAL" | "ASSIGNMENT" | "OTHER";

export interface Exam {
  id: string;
  name: string;
  type: ExamType;
  academicYearId: string;
  examSubjects: {
    id: string;
    classId: string;
    subjectId: string;
    maxMarks: number;
    class: { id: string; name: string };
    subject: { id: string; name: string };
  }[];
}

export interface ResultRow {
  enrollmentId: string;
  firstName: string;
  lastName: string;
  rollNumber: number;
  marksObtained: string | null;
  status: "ENTERED" | "APPROVED" | null;
}

export interface ResultsForSection {
  maxMarks: number;
  students: ResultRow[];
}

export const api = {
  login: (email: string, password: string) =>
    request<{ accessToken: string }>("/auth/login", { method: "POST", body: { email, password } }),
  refresh: () => request<{ accessToken: string }>("/auth/refresh", { method: "POST" }),
  logout: () => request<{ success: boolean }>("/auth/logout", { method: "POST" }),
  acceptInvite: (token: string, password: string) =>
    request<{ accessToken: string }>("/auth/accept-invite", { method: "POST", body: { token, password } }),
  me: (accessToken: string) => request<Profile>("/auth/me", { accessToken }),

  listSchools: (accessToken: string) => request<School[]>("/schools", { accessToken }),
  getSchool: (accessToken: string, id: string) => request<School>(`/schools/${id}`, { accessToken }),
  createSchool: (
    accessToken: string,
    body: { name: string; type: SchoolType; address?: string; phone?: string; email?: string },
  ) => request<School>("/schools", { method: "POST", body, accessToken }),
  inviteSchoolAdmin: (accessToken: string, schoolId: string, email: string) =>
    request<{ email: string; acceptUrl: string }>(`/schools/${schoolId}/invite-admin`, {
      method: "POST",
      body: { email },
      accessToken,
    }),

  listDivisions: (accessToken: string, schoolId: string) =>
    request<Division[]>(`/schools/${schoolId}/divisions`, { accessToken }),

  listAcademicYears: (accessToken: string, schoolId: string) =>
    request<AcademicYear[]>(`/schools/${schoolId}/academic-years`, { accessToken }),
  createAcademicYear: (
    accessToken: string,
    schoolId: string,
    body: { name: string; startDate: string; endDate: string; isCurrent?: boolean },
  ) => request<AcademicYear>(`/schools/${schoolId}/academic-years`, { method: "POST", body, accessToken }),
  setCurrentAcademicYear: (accessToken: string, schoolId: string, id: string) =>
    request<AcademicYear>(`/schools/${schoolId}/academic-years/${id}`, {
      method: "PATCH",
      body: { isCurrent: true },
      accessToken,
    }),

  listClasses: (accessToken: string, schoolId: string) =>
    request<ClassWithSections[]>(`/schools/${schoolId}/classes`, { accessToken }),
  createClass: (accessToken: string, schoolId: string, body: { divisionId: string; name: string; level: number }) =>
    request<ClassWithSections>(`/schools/${schoolId}/classes`, { method: "POST", body, accessToken }),
  createSection: (
    accessToken: string,
    schoolId: string,
    classId: string,
    body: { name: string; capacity: number },
  ) => request<Section>(`/schools/${schoolId}/classes/${classId}/sections`, { method: "POST", body, accessToken }),

  listSubjects: (accessToken: string, schoolId: string) =>
    request<Subject[]>(`/schools/${schoolId}/subjects`, { accessToken }),
  createSubject: (accessToken: string, schoolId: string, body: { name: string; code?: string }) =>
    request<Subject>(`/schools/${schoolId}/subjects`, { method: "POST", body, accessToken }),

  listStudents: (accessToken: string, schoolId: string) =>
    request<StudentListItem[]>(`/schools/${schoolId}/students`, { accessToken }),
  createStudent: (accessToken: string, schoolId: string, body: CreateStudentInput) =>
    request<{ student: { id: string }; enrollment: unknown }>(`/schools/${schoolId}/students`, {
      method: "POST",
      body,
      accessToken,
    }),

  myAssignments: (accessToken: string) => request<MyAssignment[]>("/teachers/me/assignments", { accessToken }),

  getAttendance: (accessToken: string, schoolId: string, sectionId: string, date: string) =>
    request<AttendanceRow[]>(`/schools/${schoolId}/sections/${sectionId}/attendance?date=${date}`, { accessToken }),
  markAttendance: (
    accessToken: string,
    schoolId: string,
    sectionId: string,
    date: string,
    entries: { enrollmentId: string; status: AttendanceStatus }[],
  ) =>
    request<AttendanceRow[]>(`/schools/${schoolId}/sections/${sectionId}/attendance`, {
      method: "POST",
      body: { date, entries },
      accessToken,
    }),

  listExams: (accessToken: string, schoolId: string) => request<Exam[]>(`/schools/${schoolId}/exams`, { accessToken }),
  createExam: (accessToken: string, schoolId: string, body: { academicYearId: string; name: string; type: ExamType }) =>
    request<Exam>(`/schools/${schoolId}/exams`, { method: "POST", body, accessToken }),
  createExamSubject: (
    accessToken: string,
    schoolId: string,
    examId: string,
    body: { classId: string; subjectId: string; maxMarks?: number },
  ) =>
    request<Exam["examSubjects"][number]>(`/schools/${schoolId}/exams/${examId}/subjects`, {
      method: "POST",
      body,
      accessToken,
    }),
  getResults: (accessToken: string, schoolId: string, examSubjectId: string, sectionId: string) =>
    request<ResultsForSection>(
      `/schools/${schoolId}/exams/x/subjects/${examSubjectId}/sections/${sectionId}/results`,
      { accessToken },
    ),
  enterMarks: (
    accessToken: string,
    schoolId: string,
    examSubjectId: string,
    sectionId: string,
    entries: { enrollmentId: string; marksObtained: number }[],
  ) =>
    request<ResultsForSection>(
      `/schools/${schoolId}/exams/x/subjects/${examSubjectId}/sections/${sectionId}/results`,
      { method: "POST", body: { entries }, accessToken },
    ),
};
