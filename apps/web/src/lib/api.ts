const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

// Builds "?a=x&b=y" from only the defined entries, or "" if none are set —
// used for optional filter params like attendance history's from/to range.
function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined);
  if (entries.length === 0) return "";
  return `?${entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
}

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

// The export endpoints require an Authorization header, which a plain <a
// href> download link can't attach — so we fetch the file ourselves and
// trigger the save via a throwaway object URL.
async function downloadFile(path: string, accessToken: string, filename: string): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(data?.message ?? `Request failed with status ${res.status}`, res.status, data);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function uploadFile<T>(
  path: string,
  file: File,
  fieldName: string,
  accessToken: string,
  extraFields?: Record<string, string>,
): Promise<T> {
  const formData = new FormData();
  formData.append(fieldName, file);
  for (const [key, value] of Object.entries(extraFields ?? {})) formData.append(key, value);

  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
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
  teacherId: string | null;
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

export interface ClassSubjectRecord {
  classId: string;
  subjectId: string;
  subject: Subject;
}

export interface SectionTeacherAssignment {
  id: string;
  subjectId: string;
  subject: Subject;
  teacher: { id: string; firstName: string; lastName: string };
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

export type StudentStatus = "ACTIVE" | "COMPLETED" | "GRADUATED" | "TRANSFERRED" | "WITHDRAWN" | "ARCHIVED";
export type EnrollmentStatus = "ACTIVE" | "PROMOTED" | "TRANSFERRED_OUT" | "COMPLETED" | "GRADUATED" | "WITHDRAWN";

export interface GuardianRecord {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  relationship: GuardianRelationship;
  isPrimaryContact: boolean;
}

export interface GuardianSearchResult {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
}

export interface StudentEnrollmentRecord {
  id: string;
  studentNumber: string;
  rollNumber: number;
  status: EnrollmentStatus;
  startDate: string;
  endDate: string | null;
  school: { id: string; name: string };
  academicYear: { id: string; name: string };
  class: { id: string; name: string };
  section: { id: string; name: string };
}

export interface StudentDetail {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: Sex;
  legacyStudentNumber: string | null;
  currentStatus: StudentStatus;
  enrollments: StudentEnrollmentRecord[];
  guardians: GuardianRecord[];
}

export interface GuardianInput {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  relationship: GuardianRelationship;
  isPrimaryContact?: boolean;
}

export interface CreateStudentInput {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: Sex;
  legacyStudentNumber?: string;
  enrollment: { academicYearId: string; classId: string; sectionId: string; studentNumber?: string; rollNumber?: number };
  guardians?: GuardianInput[];
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

export interface FeeStructure {
  id: string;
  name: string;
  amount: string;
  classId: string | null;
  class: { id: string; name: string } | null;
  academicYear: { id: string; name: string };
}

export type InvoiceStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID";
export type PaymentMethod = "CASH" | "BANK_TRANSFER" | "MOBILE_MONEY" | "CARD" | "OTHER";

export interface Invoice {
  id: string;
  amount: number;
  status: InvoiceStatus;
  dueDate: string | null;
  paid: number;
  balance: number;
  feeStructure: { id: string; name: string };
}

export interface SchoolInvoice extends Invoice {
  studentId: string;
  firstName: string;
  lastName: string;
}

export interface Payment {
  id: string;
  amount: string;
  method: PaymentMethod;
  reference: string | null;
  paidAt: string;
}

export interface DashboardSummary {
  studentCount: number;
  teacherCount: number;
  classCount: number;
  attendanceTodayPercent: number | null;
  attendanceMarkedCount: number;
  outstandingFeesTotal: number;
  outstandingInvoiceCount: number;
}

export interface AuditLogEntry {
  id: string;
  actorEmail: string;
  action: string;
  resource: string;
  resourceId: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}

export type TeacherStatus = "ACTIVE" | "ON_LEAVE" | "INACTIVE";

export interface TeacherAssignmentRecord {
  id: string;
  academicYearId: string;
  subject: { id: string; name: string };
  section: { id: string; name: string; class: { id: string; name: string } };
  academicYear: { id: string; name: string };
}

export interface Teacher {
  id: string;
  userId: string | null;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  sex: Sex | null;
  dateOfBirth: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  qualification: string | null;
  specialization: string | null;
  employmentDate: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  status: TeacherStatus;
  assignments: TeacherAssignmentRecord[];
}

export interface CreateTeacherInput {
  firstName: string;
  lastName: string;
  employeeNumber?: string;
  phone?: string;
  email?: string;
  qualification?: string;
  assignments?: { academicYearId: string; sectionId: string; subjectId: string }[];
}

// Every field optional — School Admin can update as much or as little as
// they have on file. Excludes employeeNumber/school/assignments, which
// stay governed by their own dedicated flows.
export interface UpdateTeacherInput {
  firstName?: string;
  lastName?: string;
  sex?: Sex;
  dateOfBirth?: string;
  phone?: string;
  email?: string;
  address?: string;
  qualification?: string;
  specialization?: string;
  employmentDate?: string;
  status?: TeacherStatus;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}

// The strict subset a teacher may change about themselves — see
// UpdateMyTeacherProfileDto on the backend.
export interface UpdateMyTeacherProfileInput {
  phone?: string;
  email?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}

export interface TeacherDocument {
  id: string;
  label: string | null;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  url: string;
}

export interface AttendanceSummaryRow {
  enrollmentId: string;
  firstName: string;
  lastName: string;
  rollNumber: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
}

export interface AttendanceHistoryRow {
  id: string;
  date: string;
  status: AttendanceStatus;
  note: string | null;
  enrollment: { rollNumber: number; student: { firstName: string; lastName: string } };
}

export interface MyAssignmentStudent {
  enrollmentId: string;
  studentId: string;
  firstName: string;
  lastName: string;
  sex: Sex;
  dateOfBirth: string;
  studentStatus: StudentStatus;
  studentNumber: string;
  rollNumber: number;
  photoUrl: string | null;
  attendanceSummary: { present: number; absent: number; late: number; excused: number };
  guardians: GuardianRecord[];
}

export interface MyAssignmentStudents {
  assignment: MyAssignment;
  students: MyAssignmentStudent[];
}

export type PromotionOutcome = "PROMOTED" | "COMPLETED" | "GRADUATED";

export interface PromotionPreview {
  outcome: PromotionOutcome;
  currentClass: { id: string; name: string };
  nextClass: { id: string; name: string } | null;
  targetSections: { id: string; name: string; capacity: number; currentActive: number; available: number }[];
  students: { studentId: string; enrollmentId: string; firstName: string; lastName: string; rollNumber: number; studentNumber: string }[];
}

export interface PromotionBatchResult {
  id: string;
  outcome: PromotionOutcome;
  items: { id: string; studentId: string; outcome: PromotionOutcome }[];
}

export type TransferStatus = "REQUESTED" | "APPROVED" | "REJECTED" | "EXECUTED";

export interface Transfer {
  id: string;
  studentId: string;
  fromSchoolId: string;
  toSchoolId: string;
  status: TransferStatus;
  reason: string | null;
  createdAt: string;
  student: { firstName: string; lastName: string };
}

export type ImportBatchStatus = "PROCESSING" | "NEEDS_REVIEW" | "COMPLETED";
export type ImportRowStatus = "PENDING" | "CREATED" | "DUPLICATE_PENDING" | "ERROR" | "SKIPPED";

export interface ImportRow {
  id: string;
  rowNumber: number;
  rawData: Record<string, string>;
  status: ImportRowStatus;
  studentId: string | null;
  errorMessage: string | null;
  duplicateCandidates: { id: string; firstName: string; lastName: string; dateOfBirth: string }[] | null;
}

export interface ImportBatch {
  id: string;
  fileName: string;
  status: ImportBatchStatus;
  totalRows: number;
  createdCount: number;
  errorCount: number;
  pendingCount: number;
  skippedCount: number;
  createdAt: string;
  completedAt: string | null;
}

export interface ImportBatchDetail extends ImportBatch {
  rows: ImportRow[];
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
  listSchoolDirectory: (accessToken: string) =>
    request<{ id: string; name: string }[]>("/schools/directory", { accessToken }),
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
  listSections: (accessToken: string, schoolId: string, classId: string) =>
    request<Section[]>(`/schools/${schoolId}/classes/${classId}/sections`, { accessToken }),
  createClass: (accessToken: string, schoolId: string, body: { divisionId: string; name: string; level: number }) =>
    request<ClassWithSections>(`/schools/${schoolId}/classes`, { method: "POST", body, accessToken }),
  createSection: (
    accessToken: string,
    schoolId: string,
    classId: string,
    body: { name: string; capacity: number },
  ) => request<Section>(`/schools/${schoolId}/classes/${classId}/sections`, { method: "POST", body, accessToken }),
  listClassSubjects: (accessToken: string, schoolId: string, classId: string) =>
    request<ClassSubjectRecord[]>(`/schools/${schoolId}/classes/${classId}/subjects`, { accessToken }),
  assignSubjectToClass: (accessToken: string, schoolId: string, classId: string, subjectId: string) =>
    request<ClassSubjectRecord>(`/schools/${schoolId}/classes/${classId}/subjects`, {
      method: "POST",
      body: { subjectId },
      accessToken,
    }),
  unassignSubjectFromClass: (accessToken: string, schoolId: string, classId: string, subjectId: string) =>
    request<{ success: boolean }>(`/schools/${schoolId}/classes/${classId}/subjects/${subjectId}`, {
      method: "DELETE",
      accessToken,
    }),
  listSectionTeacherAssignments: (
    accessToken: string,
    schoolId: string,
    classId: string,
    sectionId: string,
    academicYearId: string,
  ) =>
    request<SectionTeacherAssignment[]>(
      `/schools/${schoolId}/classes/${classId}/sections/${sectionId}/teacher-assignments?academicYearId=${academicYearId}`,
      { accessToken },
    ),

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
  getStudent: (accessToken: string, studentId: string) =>
    request<StudentDetail>(`/students/${studentId}`, { accessToken }),
  addGuardian: (accessToken: string, studentId: string, body: GuardianInput) =>
    request<GuardianRecord>(`/students/${studentId}/guardians`, { method: "POST", body, accessToken }),
  searchGuardians: (accessToken: string, schoolId: string, search: string) =>
    request<GuardianSearchResult[]>(
      `/schools/${schoolId}/guardians?search=${encodeURIComponent(search)}`,
      { accessToken },
    ),

  listTeachers: (accessToken: string, schoolId: string) =>
    request<Teacher[]>(`/schools/${schoolId}/teachers`, { accessToken }),
  createTeacher: (accessToken: string, schoolId: string, body: CreateTeacherInput) =>
    request<Teacher>(`/schools/${schoolId}/teachers`, { method: "POST", body, accessToken }),
  getTeacher: (accessToken: string, schoolId: string, teacherId: string) =>
    request<Teacher>(`/schools/${schoolId}/teachers/${teacherId}`, { accessToken }),
  updateTeacher: (accessToken: string, schoolId: string, teacherId: string, body: UpdateTeacherInput) =>
    request<Teacher>(`/schools/${schoolId}/teachers/${teacherId}`, { method: "PATCH", body, accessToken }),
  uploadTeacherDocument: (accessToken: string, schoolId: string, teacherId: string, file: File, label?: string) =>
    uploadFile<TeacherDocument>(`/schools/${schoolId}/teachers/${teacherId}/documents`, file, "file", accessToken, {
      ...(label ? { label } : {}),
    }),
  listTeacherDocuments: (accessToken: string, schoolId: string, teacherId: string) =>
    request<TeacherDocument[]>(`/schools/${schoolId}/teachers/${teacherId}/documents`, { accessToken }),
  addTeacherAssignment: (
    accessToken: string,
    schoolId: string,
    teacherId: string,
    body: { academicYearId: string; sectionId: string; subjectId: string },
  ) =>
    request<TeacherAssignmentRecord>(`/schools/${schoolId}/teachers/${teacherId}/assignments`, {
      method: "POST",
      body,
      accessToken,
    }),
  removeTeacherAssignment: (accessToken: string, schoolId: string, teacherId: string, assignmentId: string) =>
    request<{ success: boolean }>(`/schools/${schoolId}/teachers/${teacherId}/assignments/${assignmentId}`, {
      method: "DELETE",
      accessToken,
    }),
  inviteTeacherLogin: (accessToken: string, schoolId: string, teacherId: string, email?: string) =>
    request<{ email: string; acceptUrl: string }>(`/schools/${schoolId}/teachers/${teacherId}/invite-login`, {
      method: "POST",
      body: { email },
      accessToken,
    }),
  uploadTeacherPhoto: (accessToken: string, schoolId: string, teacherId: string, file: File) =>
    uploadFile<{ id: string }>(`/schools/${schoolId}/teachers/${teacherId}/photo`, file, "photo", accessToken),
  getTeacherPhotoUrl: (accessToken: string, schoolId: string, teacherId: string) =>
    request<{ url: string; uploadedAt: string }>(`/schools/${schoolId}/teachers/${teacherId}/photo`, { accessToken }),

  previewPromotion: (
    accessToken: string,
    schoolId: string,
    sectionId: string,
    fromAcademicYearId: string,
  ) =>
    request<PromotionPreview>(
      `/schools/${schoolId}/sections/${sectionId}/promotion/preview?fromAcademicYearId=${fromAcademicYearId}`,
      { accessToken },
    ),
  confirmPromotion: (
    accessToken: string,
    schoolId: string,
    sectionId: string,
    body: { fromAcademicYearId: string; toAcademicYearId: string; targetSectionId?: string },
  ) =>
    request<PromotionBatchResult>(`/schools/${schoolId}/sections/${sectionId}/promotion/confirm`, {
      method: "POST",
      body,
      accessToken,
    }),

  requestTransfer: (accessToken: string, studentId: string, body: { toSchoolId: string; reason?: string }) =>
    request<Transfer>(`/students/${studentId}/transfers`, { method: "POST", body, accessToken }),
  listTransfers: (accessToken: string, schoolId: string) =>
    request<Transfer[]>(`/schools/${schoolId}/transfers`, { accessToken }),
  approveTransfer: (
    accessToken: string,
    transferId: string,
    body: { academicYearId: string; classId: string; sectionId: string; studentNumber?: string; rollNumber?: number },
  ) => request<Transfer>(`/transfers/${transferId}/approve`, { method: "POST", body, accessToken }),
  rejectTransfer: (accessToken: string, transferId: string) =>
    request<Transfer>(`/transfers/${transferId}/reject`, { method: "POST", accessToken }),

  myAssignments: (accessToken: string) => request<MyAssignment[]>("/teachers/me/assignments", { accessToken }),
  myAssignmentStudents: (accessToken: string, assignmentId: string) =>
    request<MyAssignmentStudents>(`/teachers/me/assignments/${assignmentId}/students`, { accessToken }),

  getMyTeacherProfile: (accessToken: string) => request<Teacher | null>("/teachers/me", { accessToken }),
  updateMyTeacherProfile: (accessToken: string, body: UpdateMyTeacherProfileInput) =>
    request<Teacher>("/teachers/me", { method: "PATCH", body, accessToken }),
  uploadMyPhoto: (accessToken: string, file: File) =>
    uploadFile<{ id: string }>("/teachers/me/photo", file, "photo", accessToken),
  getMyPhotoUrl: (accessToken: string) =>
    request<{ url: string; uploadedAt: string }>("/teachers/me/photo", { accessToken }),
  uploadMyDocument: (accessToken: string, file: File, label?: string) =>
    uploadFile<TeacherDocument>("/teachers/me/documents", file, "file", accessToken, {
      ...(label ? { label } : {}),
    }),
  listMyDocuments: (accessToken: string) => request<TeacherDocument[]>("/teachers/me/documents", { accessToken }),

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
  getAttendanceHistory: (accessToken: string, schoolId: string, sectionId: string, from?: string, to?: string) =>
    request<AttendanceHistoryRow[]>(
      `/schools/${schoolId}/sections/${sectionId}/attendance/history${qs({ from, to })}`,
      { accessToken },
    ),
  getAttendanceSummary: (accessToken: string, schoolId: string, sectionId: string, from?: string, to?: string) =>
    request<AttendanceSummaryRow[]>(
      `/schools/${schoolId}/sections/${sectionId}/attendance/summary${qs({ from, to })}`,
      { accessToken },
    ),

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

  listFeeStructures: (accessToken: string, schoolId: string) =>
    request<FeeStructure[]>(`/schools/${schoolId}/fee-structures`, { accessToken }),
  createFeeStructure: (
    accessToken: string,
    schoolId: string,
    body: { academicYearId: string; classId?: string; name: string; amount: number },
  ) => request<FeeStructure>(`/schools/${schoolId}/fee-structures`, { method: "POST", body, accessToken }),
  generateInvoices: (accessToken: string, schoolId: string, feeStructureId: string) =>
    request<{ createdCount: number; eligibleEnrollments: number }>(
      `/schools/${schoolId}/fee-structures/${feeStructureId}/generate-invoices`,
      { method: "POST", accessToken },
    ),

  listSchoolInvoices: (accessToken: string, schoolId: string, status?: InvoiceStatus) =>
    request<SchoolInvoice[]>(`/schools/${schoolId}/invoices${status ? `?status=${status}` : ""}`, { accessToken }),
  listStudentInvoices: (accessToken: string, studentId: string) =>
    request<Invoice[]>(`/students/${studentId}/invoices`, { accessToken }),
  recordPayment: (
    accessToken: string,
    invoiceId: string,
    body: { amount: number; method?: PaymentMethod; reference?: string },
  ) => request<Payment>(`/invoices/${invoiceId}/payments`, { method: "POST", body, accessToken }),
  listPayments: (accessToken: string, invoiceId: string) =>
    request<Payment[]>(`/invoices/${invoiceId}/payments`, { accessToken }),

  getDashboardSummary: (accessToken: string, schoolId: string) =>
    request<DashboardSummary>(`/schools/${schoolId}/dashboard-summary`, { accessToken }),

  listAuditLogs: (accessToken: string, schoolId: string, action?: string) =>
    request<AuditLogEntry[]>(
      `/schools/${schoolId}/audit-logs${action ? `?action=${encodeURIComponent(action)}` : ""}`,
      { accessToken },
    ),

  uploadStudentPhoto: (accessToken: string, studentId: string, file: File) =>
    uploadFile<{ id: string }>(`/students/${studentId}/photo`, file, "photo", accessToken),
  getStudentPhotoUrl: (accessToken: string, studentId: string) =>
    request<{ url: string; uploadedAt: string }>(`/students/${studentId}/photo`, { accessToken }),

  uploadStudentsImport: (accessToken: string, schoolId: string, file: File) =>
    uploadFile<ImportBatchDetail>(`/schools/${schoolId}/imports/students`, file, "file", accessToken),
  listImportBatches: (accessToken: string, schoolId: string) =>
    request<ImportBatch[]>(`/schools/${schoolId}/imports/students`, { accessToken }),
  getImportBatch: (accessToken: string, schoolId: string, batchId: string) =>
    request<ImportBatchDetail>(`/schools/${schoolId}/imports/students/${batchId}`, { accessToken }),
  resolveImportRow: (
    accessToken: string,
    schoolId: string,
    batchId: string,
    rowId: string,
    action: "confirm" | "skip",
  ) =>
    request<ImportBatchDetail>(`/schools/${schoolId}/imports/students/${batchId}/rows/${rowId}/resolve`, {
      method: "POST",
      body: { action },
      accessToken,
    }),

  exportStudents: (accessToken: string, schoolId: string) =>
    downloadFile(`/schools/${schoolId}/exports/students`, accessToken, "students.csv"),
  exportTeachers: (accessToken: string, schoolId: string) =>
    downloadFile(`/schools/${schoolId}/exports/teachers`, accessToken, "teachers.csv"),
  exportInvoices: (accessToken: string, schoolId: string) =>
    downloadFile(`/schools/${schoolId}/exports/invoices`, accessToken, "invoices.csv"),
};
