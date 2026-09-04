const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

// Builds "?a=x&b=y" from only the defined entries, or "" if none are set —
// used for optional filter params like attendance history's from/to range.
function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined);
  if (entries.length === 0) return "";
  return `?${entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
}

// Same idea as qs() but for AuditLogFilters specifically, whose page/pageSize
// are numbers rather than strings.
function auditLogQs(filters: object): string {
  return qs(
    Object.fromEntries(
      Object.entries(filters)
        .filter((e): e is [string, string | number] => e[1] !== undefined)
        .map(([k, v]) => [k, String(v)]),
    ),
  );
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

// The access token is short-lived (15m) by design. Rather than every page
// having to catch its own "Invalid or expired access token" 401 and figure
// out what to do, AuthProvider registers a single handler here on mount: on
// any 401 from an authenticated call, refresh the session once and retry the
// exact same request with the new token. If the refresh itself fails (the
// refresh cookie is gone/expired too), the handler returns null, we don't
// retry, and AuthProvider has already cleared the session so the app's
// existing "no user -> redirect to /login" effect takes over — a real
// re-auth prompt instead of a stuck error screen.
type UnauthorizedHandler = () => Promise<string | null>;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; accessToken?: string | null } = {},
): Promise<T> {
  const doFetch = (token?: string | null) =>
    fetch(`${API_URL}${path}`, {
      method: options.method ?? "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

  let res = await doFetch(options.accessToken);

  if (res.status === 401 && options.accessToken && unauthorizedHandler) {
    const freshToken = await unauthorizedHandler();
    if (freshToken) res = await doFetch(freshToken);
  }

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
  const doFetch = (token: string) =>
    fetch(`${API_URL}${path}`, {
      credentials: "include",
      headers: { Authorization: `Bearer ${token}` },
    });

  let res = await doFetch(accessToken);
  if (res.status === 401 && unauthorizedHandler) {
    const freshToken = await unauthorizedHandler();
    if (freshToken) res = await doFetch(freshToken);
  }

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

  const doFetch = (token: string) =>
    fetch(`${API_URL}${path}`, {
      method: "POST",
      credentials: "include",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

  let res = await doFetch(accessToken);
  if (res.status === 401 && unauthorizedHandler) {
    const freshToken = await unauthorizedHandler();
    if (freshToken) res = await doFetch(freshToken);
  }

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
  schools: { id: string; name: string; logoUrl: string | null }[];
  teacherId: string | null;
  guardianId: string | null;
  studentId: string | null;
  mustChangePassword: boolean;
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
  studentCount: number;
  teacherCount: number;
  hasActiveAdmin: boolean;
}

export interface SchoolDeletionImpact {
  school: { id: string; name: string; hasActiveAdmin: boolean };
  counts: {
    enrollments: number;
    teachers: number;
    academicYears: number;
    classes: number;
    sections: number;
    subjects: number;
    exams: number;
    examSubjects: number;
    results: number;
    attendanceRecords: number;
    feeStructures: number;
    invoices: number;
    payments: number;
    transfers: number;
    promotionBatches: number;
    promotionItems: number;
    announcements: number;
  };
  hasAnyData: boolean;
}

export interface SystemSummaryAlert {
  severity: "warning" | "info";
  message: string;
  schoolId: string;
}

export interface SystemSummaryActivity {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  schoolId: string | null;
  createdAt: string;
  actorEmail: string;
}

export interface SystemSummary {
  totals: {
    schools: number;
    primarySchools: number;
    secondarySchools: number;
    activeSchools: number;
    inactiveSchools: number;
    students: number;
    maleStudents: number;
    femaleStudents: number;
    teachers: number;
    guardians: number;
    staff: number;
  };
  schools: School[];
  recentActivity: SystemSummaryActivity[];
  alerts: SystemSummaryAlert[];
}

export type DivisionType = "PRIMARY" | "SECONDARY";

export interface Division {
  id: string;
  type: DivisionType;
}

// capacity: null means unlimited — no maximum enrollment enforced.
export interface Section {
  id: string;
  name: string;
  capacity: number | null;
  _count: { enrollments: number };
}

export interface ClassWithSections {
  id: string;
  name: string;
  level: number;
  division: Division;
  sections: { id: string; name: string; capacity: number | null; _count: { enrollments: number } }[];
  _count: { classSubjects: number };
}

export interface ClassBulkTransferImpact {
  className: string;
  sectionName: string | null;
  academicYearName: string;
  studentCount: number;
}

export interface AcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export interface AcademicYearDeletionImpact {
  academicYear: { id: string; name: string; isCurrent: boolean };
  counts: {
    enrollments: number;
    teacherAssignments: number;
    exams: number;
    examSubjects: number;
    results: number;
    attendanceRecords: number;
    feeStructures: number;
    invoices: number;
    payments: number;
    transfers: number;
    promotionItems: number;
  };
  hasAnyData: boolean;
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
  legacyStudentNumber: string | null;
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

export type ParentStatus = "ACTIVE" | "ARCHIVED";
export type PortalAccountStatus = "PENDING_SETUP" | "ACTIVE" | "SUSPENDED";
export type StudentGuardianStatus = "ACTIVE" | "INACTIVE";

export interface ParentChildSummary {
  studentId: string;
  firstName: string;
  lastName: string;
  relationship: GuardianRelationship;
  isPrimaryContact: boolean;
  status: StudentGuardianStatus;
  enrollment: { className: string; sectionName: string; academicYearName: string } | null;
}

export interface ParentListItem {
  id: string;
  guardianCode: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  status: ParentStatus;
  hasPortalAccount: boolean;
  portalAccountStatus: PortalAccountStatus | null;
  children: ParentChildSummary[];
}

export interface ParentDetail {
  id: string;
  guardianCode: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  status: ParentStatus;
  user: { id: string; email: string; status: PortalAccountStatus } | null;
  students: {
    studentId: string;
    relationship: GuardianRelationship;
    isPrimaryContact: boolean;
    status: StudentGuardianStatus;
    student: {
      firstName: string;
      lastName: string;
      enrollments: {
        status: EnrollmentStatus;
        startDate: string;
        school: { id: string; name: string };
        class: { id: string; name: string };
        section: { id: string; name: string };
        academicYear: { id: string; name: string };
      }[];
    };
  }[];
}

export interface CreateParentInput {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  address?: string;
  confirmDespiteDuplicates?: boolean;
}

export interface UpdateParentInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  address?: string;
  status?: ParentStatus;
}

export interface LinkChildInput {
  studentId: string;
  relationship: GuardianRelationship;
  isPrimaryContact?: boolean;
}

// ---------------------------------------------------------------------------
// Parent Portal — a parent viewing their own linked children, read-only.
// ---------------------------------------------------------------------------

export interface MyChild {
  studentId: string;
  firstName: string;
  lastName: string;
  sex: Sex;
  dateOfBirth: string;
  currentStatus: StudentStatus;
  relationship: GuardianRelationship;
  isPrimaryContact: boolean;
  enrollment: {
    schoolName: string;
    className: string;
    sectionName: string;
    academicYearName: string;
    studentNumber: string;
    rollNumber: number;
  } | null;
}

export interface MyChildProfile {
  id: string;
  firstName: string;
  lastName: string;
  sex: Sex;
  dateOfBirth: string;
  legacyStudentNumber: string | null;
  currentStatus: StudentStatus;
  enrollments: StudentEnrollmentRecord[];
}

export interface MyChildAcademicYear {
  id: string;
  name: string;
  isCurrent: boolean;
  hasAttendance: boolean;
}

export interface MyChildSubject {
  subjectId: string;
  name: string;
  code: string | null;
  teacher: { firstName: string; lastName: string } | null;
}

export interface MyChildAttendanceRecord {
  id: string;
  date: string;
  status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
  note: string | null;
  className: string;
  sectionName: string;
  // Only populated by the Student Portal's own endpoint (see
  // StudentPortalService.myAttendance) — the Guardian Portal's equivalent
  // doesn't resolve this, so treat it as absent there, not as null data.
  markedByName?: string | null;
}

export interface MyChildAttendance {
  summary: { total: number; present: number; absent: number; late: number; excused: number; percentage: number | null };
  records: MyChildAttendanceRecord[];
}

export interface MyChildResult {
  id: string;
  examName: string;
  examType: string;
  subjectName: string;
  marksObtained: number;
  maxMarks: number;
  percentage: number;
  examDate: string | null;
}

export interface MyChildInvoice {
  id: string;
  feeName: string;
  amount: number;
  paid: number;
  balance: number;
  status: InvoiceStatus;
  dueDate: string | null;
  payments: { id: string; amount: number; method: PaymentMethod; paidAt: string; reference: string | null }[];
}

export interface MyStudentProfile {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: Sex;
  currentStatus: StudentStatus;
  loginId: string;
  enrollment: {
    status: EnrollmentStatus;
    schoolName: string;
    academicYearId: string;
    academicYearName: string;
    className: string;
    sectionName: string;
    rollNumber: number;
  };
}

export type AnnouncementAudience = "ALL" | "PARENTS" | "TEACHERS";

export interface Announcement {
  id: string;
  schoolId: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  createdAt: string;
  school?: { name: string };
}

export interface MyGuardianProfile {
  id: string;
  guardianCode: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  status: ParentStatus;
  user: { id: string; email: string; status: PortalAccountStatus } | null;
}

export interface NotificationItem {
  id: string;
  guardianId: string;
  announcementId: string | null;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
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

// A lighter shape than the full Transfer type (used by the Transfers list
// pages) — just enough to explain, on the student's own profile, what
// happened and why. Kept separate rather than reusing Transfer because this
// route never computes fromSchoolName/requestedByEmail/etc., and toEnrollment
// stays null until the destination school accepts.
export interface StudentTransferSnapshot {
  school: { id: string; name: string };
  class: { name: string };
  section: { name: string };
  academicYear: { name: string };
}

export interface StudentTransferRecord {
  id: string;
  status: TransferStatus;
  reason: string | null;
  transferDate: string | null;
  createdAt: string;
  fromEnrollment: StudentTransferSnapshot;
  toEnrollment: StudentTransferSnapshot | null;
}

export interface StudentDetail {
  id: string;
  organizationId: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: Sex;
  legacyStudentNumber: string | null;
  currentStatus: StudentStatus;
  enrollments: StudentEnrollmentRecord[];
  guardians: GuardianRecord[];
  transfers: StudentTransferRecord[];
}

export interface GuardianInput {
  existingGuardianId?: string;
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

export interface UpdateStudentInput {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  sex?: Sex;
  legacyStudentNumber?: string;
  // Present only when the student's current active enrollment is being
  // corrected in place — see StudentsService.updateActiveEnrollment.
  enrollment?: {
    academicYearId: string;
    classId: string;
    sectionId: string;
    rollNumber: number;
  };
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
  // True only when this status came from a saved-but-not-submitted draft —
  // there's no finalized attendance for this student/day yet.
  isDraft: boolean;
  photoUrl: string | null;
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

export interface DashboardSetup {
  academicYear: boolean;
  classes: boolean;
  sections: boolean;
  subjects: boolean;
  teacherAssignments: boolean;
  studentEnrollment: boolean;
  progressPercent: number;
}

export interface DashboardSummary {
  academicYear: { id: string; name: string } | null;
  academicYears: { id: string; name: string; isCurrent: boolean }[];
  counts: { students: number; teachers: number; classes: number; sections: number; subjects: number };
  enrollment: { total: number; male: number; female: number };
  teachers: { active: number; inactive: number };
  attendanceToday: { marked: number; present: number; absent: number; late: number; excused: number; percent: number | null };
  outstandingFeesTotal: number;
  outstandingInvoiceCount: number;
  setup: DashboardSetup;
}

export interface EnrollmentReportRow {
  classId: string;
  className: string;
  sections: { sectionId: string; sectionName: string; enrolled: number }[];
  totalEnrolled: number;
}

export interface AttendanceReportRow {
  sectionId: string;
  sectionName: string;
  className: string;
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
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

export type AuditStatus = "SUCCESS" | "FAILED" | "DENIED";
export type AuditSeverity = "INFO" | "WARNING" | "CRITICAL";

// The professional audit surface's row shape — richer than AuditLogEntry
// above (which the original per-school page still uses unchanged). Every
// field here already exists on the same underlying AuditLog table; this
// just reads more of it.
export interface AuditEvent {
  id: string;
  organizationId: string | null;
  schoolId: string | null;
  actorUserId: string | null;
  actorNameSnapshot: string | null;
  actorEmailSnapshot: string | null;
  actorRoleSnapshot: string | null;
  action: string;
  module: string | null;
  resource: string;
  resourceId: string | null;
  resourceNameSnapshot: string | null;
  status: AuditStatus;
  severity: AuditSeverity;
  before: unknown;
  after: unknown;
  reason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: string;
}

export interface AuditLogFilters {
  schoolId?: string;
  actorUserId?: string;
  module?: string;
  action?: string;
  status?: AuditStatus;
  severity?: AuditSeverity;
  resourceType?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
  sortDir?: "asc" | "desc";
}

export interface AuditEventListResponse {
  data: AuditEvent[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  summary: { total: number; successful: number; failed: number; critical: number };
}

export type TeacherStatus = "ACTIVE" | "ON_LEAVE" | "INACTIVE";

export interface TeacherAssignmentRecord {
  id: string;
  schoolId: string;
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
  targetSections: { id: string; name: string; capacity: number | null; currentActive: number; available: number | null }[];
  students: { studentId: string; enrollmentId: string; firstName: string; lastName: string; rollNumber: number; studentNumber: string }[];
}

export interface PromotionBatchResult {
  id: string;
  outcome: PromotionOutcome;
  items: { id: string; studentId: string; outcome: PromotionOutcome }[];
}

export type TransferStatus = "REQUESTED" | "APPROVED" | "REJECTED" | "EXECUTED" | "CANCELLED";

export interface TransferEnrollmentSnapshot {
  studentNumber: string;
  class: { name: string };
  section: { name: string };
  academicYear: { name: string };
}

export interface Transfer {
  id: string;
  studentId: string;
  fromSchoolId: string;
  fromSchoolName: string;
  toSchoolId: string;
  toSchoolName: string;
  status: TransferStatus;
  reason: string | null;
  rejectionReason: string | null;
  transferDate: string | null;
  createdAt: string;
  student: { id: string; firstName: string; lastName: string; sex: Sex; dateOfBirth: string };
  fromEnrollment: TransferEnrollmentSnapshot;
  toEnrollment: TransferEnrollmentSnapshot | null;
  requestedByEmail: string;
  approvedByEmail: string | null;
}

export interface BulkTransferEligibleStudent {
  studentId: string;
  enrollmentId: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  rollNumber: number;
  fromClass: string;
  fromSection: string;
}

export interface BulkTransferIneligibleStudent {
  studentId: string;
  reason: string;
}

export interface BulkTransferPreview {
  eligible: BulkTransferEligibleStudent[];
  ineligible: BulkTransferIneligibleStudent[];
}

export interface BulkTransferResult {
  fromSchoolId: string;
  toSchoolId: string;
  toClassId: string;
  toAcademicYearId: string;
  results: {
    studentId: string;
    transferId: string;
    fromEnrollmentId: string;
    toEnrollmentId: string;
    sectionId: string;
    studentNumber: string;
    rollNumber: number;
  }[];
}

export type TransferDirection = "incoming" | "outgoing";

export interface TransferListFilters {
  schoolId?: string;
  direction?: TransferDirection;
  originSchoolId?: string;
  destinationSchoolId?: string;
  status?: TransferStatus;
  academicYearId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface TransferListResponse {
  data: Transfer[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface TransferDirectionSummary {
  pending: number;
  rejected: number;
  completed: number;
  cancelled: number;
}

export interface TransferSummary {
  incoming: TransferDirectionSummary;
  outgoing: TransferDirectionSummary;
}

// Student Lifecycle — every field here is derived by the backend from
// Student.currentStatus + StudentEnrollment.status + PromotionItem; there is
// no separate lifecycle status stored anywhere (see StudentLifecycleService).
export interface LifecyclePrimarySummary {
  totalCompleted: number;
  awaitingForm1: number;
  readyForForm1: number;
  enrolledInForm1: number;
  transferredOut: number;
  withdrawn: number;
}

export interface LifecycleSecondarySummary {
  totalGraduated: number;
  graduationPending: number;
  graduated: number;
  alumni: number;
  transferredOut: number;
}

export interface LifecycleSummary {
  primary: LifecyclePrimarySummary;
  secondary: LifecycleSecondarySummary;
}

export interface LifecycleEnrollmentRow {
  enrollmentId: string;
  studentId: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  rollNumber: number;
  school: { id: string; name: string };
  class: { id: string; name: string };
  section: { id: string; name: string };
  academicYear: { id: string; name: string };
  enrollmentStatus: EnrollmentStatus;
  lifecycleStatus: StudentStatus;
  startDate: string;
  endDate: string | null;
  enrolledInForm1: boolean;
  transfer: { status: TransferStatus; toSchoolId: string } | null;
}

export interface LifecycleListResponse {
  data: LifecycleEnrollmentRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface LifecycleListFilters {
  schoolId?: string;
  academicYearId?: string;
  // Cross-school alternative to academicYearId, used whenever no single
  // school is selected — see StudentLifecycleService.academicYearWhere.
  academicYearName?: string;
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

// One entry per distinct AcademicYear.name across the actor's accessible
// schools — real DB data, never hardcoded. isCurrentAnywhere is true if any
// matching row across those schools is the school's current year.
export interface LifecycleAcademicYearName {
  name: string;
  isCurrentAnywhere: boolean;
}

export interface Form1TransitionPreview {
  toClass: { id: string; name: string };
  eligible: {
    enrollmentId: string;
    studentId: string;
    firstName: string;
    lastName: string;
    studentNumber: string;
    rollNumber: number;
  }[];
  ineligible: { enrollmentId: string; reason: string }[];
  targetSections: { id: string; name: string; capacity: number | null; currentActive: number; available: number | null }[];
}

export interface Form1TransitionResult {
  id: string;
  schoolId: string;
  fromAcademicYearId: string;
  toAcademicYearId: string;
  status: string;
  confirmedAt: string;
  results: {
    studentId: string;
    studentNumber: string;
    fromEnrollmentId: string;
    toEnrollmentId: string;
    sectionId: string;
    rollNumber: number;
  }[];
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
  getSystemSummary: (accessToken: string) => request<SystemSummary>("/schools/system-summary", { accessToken }),
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
  getSchoolDeletionImpact: (accessToken: string, schoolId: string) =>
    request<SchoolDeletionImpact>(`/schools/${schoolId}/deletion-impact`, { accessToken }),
  removeSchool: (accessToken: string, schoolId: string) =>
    request<{ success: boolean }>(`/schools/${schoolId}`, { method: "DELETE", accessToken }),

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
  getAcademicYearDeletionImpact: (accessToken: string, schoolId: string, id: string) =>
    request<AcademicYearDeletionImpact>(`/schools/${schoolId}/academic-years/${id}/deletion-impact`, { accessToken }),
  deleteAcademicYear: (accessToken: string, schoolId: string, id: string) =>
    request<{ success: boolean }>(`/schools/${schoolId}/academic-years/${id}`, { method: "DELETE", accessToken }),

  listClasses: (accessToken: string, schoolId: string, academicYearId?: string) =>
    request<ClassWithSections[]>(`/schools/${schoolId}/classes${qs({ academicYearId })}`, { accessToken }),
  listSections: (accessToken: string, schoolId: string, classId: string, academicYearId?: string) =>
    request<Section[]>(`/schools/${schoolId}/classes/${classId}/sections${qs({ academicYearId })}`, { accessToken }),
  createClass: (
    accessToken: string,
    schoolId: string,
    body: {
      divisionId: string;
      name: string;
      level: number;
      sections?: { name: string; capacity?: number | null }[];
      subjectIds?: string[];
    },
  ) => request<ClassWithSections>(`/schools/${schoolId}/classes`, { method: "POST", body, accessToken }),
  updateClass: (
    accessToken: string,
    schoolId: string,
    classId: string,
    body: { divisionId?: string; name?: string; level?: number },
  ) =>
    request<ClassWithSections>(`/schools/${schoolId}/classes/${classId}`, {
      method: "PATCH",
      body,
      accessToken,
    }),
  removeClass: (accessToken: string, schoolId: string, classId: string) =>
    request<{ success: boolean }>(`/schools/${schoolId}/classes/${classId}`, { method: "DELETE", accessToken }),
  createSection: (
    accessToken: string,
    schoolId: string,
    classId: string,
    body: { name: string; capacity?: number | null },
  ) => request<Section>(`/schools/${schoolId}/classes/${classId}/sections`, { method: "POST", body, accessToken }),
  updateSection: (
    accessToken: string,
    schoolId: string,
    classId: string,
    sectionId: string,
    body: { name?: string; capacity?: number | null },
  ) =>
    request<Section>(`/schools/${schoolId}/classes/${classId}/sections/${sectionId}`, {
      method: "PATCH",
      body,
      accessToken,
    }),
  removeSection: (accessToken: string, schoolId: string, classId: string, sectionId: string) =>
    request<{ success: boolean }>(`/schools/${schoolId}/classes/${classId}/sections/${sectionId}`, {
      method: "DELETE",
      accessToken,
    }),
  getClassBulkTransferImpact: (
    accessToken: string,
    schoolId: string,
    classId: string,
    academicYearId: string,
    fromSectionId?: string,
  ) =>
    request<ClassBulkTransferImpact>(
      `/schools/${schoolId}/classes/${classId}/bulk-transfer-impact${qs({ academicYearId, fromSectionId })}`,
      { accessToken },
    ),
  bulkTransferClass: (
    accessToken: string,
    schoolId: string,
    classId: string,
    body: {
      academicYearId: string;
      fromSectionId?: string;
      enrollmentIds?: string[];
      toClassId: string;
      toSectionId: string;
    },
  ) =>
    request<{ success: boolean; movedCount: number }>(`/schools/${schoolId}/classes/${classId}/bulk-transfer`, {
      method: "POST",
      body,
      accessToken,
    }),
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
  updateSubject: (accessToken: string, schoolId: string, subjectId: string, body: { name?: string; code?: string }) =>
    request<Subject>(`/schools/${schoolId}/subjects/${subjectId}`, { method: "PATCH", body, accessToken }),
  removeSubject: (accessToken: string, schoolId: string, subjectId: string) =>
    request<{ success: boolean }>(`/schools/${schoolId}/subjects/${subjectId}`, { method: "DELETE", accessToken }),

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
  updateStudent: (accessToken: string, studentId: string, body: UpdateStudentInput) =>
    request<StudentDetail>(`/students/${studentId}`, { method: "PATCH", body, accessToken }),
  archiveStudent: (accessToken: string, studentId: string) =>
    request<StudentDetail>(`/students/${studentId}/archive`, { method: "POST", accessToken }),
  deleteStudent: (accessToken: string, studentId: string) =>
    request<{ success: boolean }>(`/students/${studentId}`, { method: "DELETE", accessToken }),
  addGuardian: (accessToken: string, studentId: string, body: GuardianInput) =>
    request<GuardianRecord>(`/students/${studentId}/guardians`, { method: "POST", body, accessToken }),
  createStudentPortalAccount: (accessToken: string, studentId: string) =>
    request<{ loginId: string; temporaryPassword: string }>(`/students/${studentId}/portal-account`, {
      method: "POST",
      accessToken,
    }),
  searchGuardians: (accessToken: string, schoolId: string, search: string) =>
    request<GuardianSearchResult[]>(
      `/schools/${schoolId}/guardians?search=${encodeURIComponent(search)}`,
      { accessToken },
    ),

  listParents: (accessToken: string, schoolId: string) =>
    request<ParentListItem[]>(`/schools/${schoolId}/guardians`, { accessToken }),
  getParent: (accessToken: string, schoolId: string, guardianId: string) =>
    request<ParentDetail>(`/schools/${schoolId}/guardians/${guardianId}`, { accessToken }),
  createParent: (accessToken: string, schoolId: string, body: CreateParentInput) =>
    request<ParentListItem>(`/schools/${schoolId}/guardians`, { method: "POST", body, accessToken }),
  updateParent: (accessToken: string, schoolId: string, guardianId: string, body: UpdateParentInput) =>
    request<ParentListItem>(`/schools/${schoolId}/guardians/${guardianId}`, { method: "PATCH", body, accessToken }),
  deleteParent: (accessToken: string, schoolId: string, guardianId: string) =>
    request<{ success: boolean }>(`/schools/${schoolId}/guardians/${guardianId}`, { method: "DELETE", accessToken }),
  addParentChild: (accessToken: string, schoolId: string, guardianId: string, body: LinkChildInput) =>
    request<{ studentId: string; guardianId: string }>(`/schools/${schoolId}/guardians/${guardianId}/children`, {
      method: "POST",
      body,
      accessToken,
    }),
  removeParentChild: (accessToken: string, schoolId: string, guardianId: string, studentId: string) =>
    request<{ studentId: string; guardianId: string }>(
      `/schools/${schoolId}/guardians/${guardianId}/children/${studentId}`,
      { method: "DELETE", accessToken },
    ),
  createParentPortalAccount: (accessToken: string, schoolId: string, guardianId: string, email?: string) =>
    request<{ email: string; acceptUrl: string }>(`/schools/${schoolId}/guardians/${guardianId}/portal-account`, {
      method: "POST",
      body: { email },
      accessToken,
    }),

  listAnnouncements: (accessToken: string, schoolId: string) =>
    request<Announcement[]>(`/schools/${schoolId}/announcements`, { accessToken }),
  createAnnouncement: (
    accessToken: string,
    schoolId: string,
    body: { title: string; body: string; audience?: AnnouncementAudience },
  ) => request<Announcement>(`/schools/${schoolId}/announcements`, { method: "POST", body, accessToken }),

  // Parent Portal — self-service, scoped to the authenticated parent's own
  // linked children (see GuardianPortalController on the backend).
  getMyParentProfile: (accessToken: string) =>
    request<MyGuardianProfile | null>(`/guardians/me`, { accessToken }),
  listMyChildren: (accessToken: string) => request<MyChild[]>(`/guardians/me/children`, { accessToken }),
  getMyChild: (accessToken: string, studentId: string) =>
    request<MyChildProfile>(`/guardians/me/children/${studentId}`, { accessToken }),
  getMyChildAcademicYears: (accessToken: string, studentId: string) =>
    request<MyChildAcademicYear[]>(`/guardians/me/children/${studentId}/academic-years`, { accessToken }),
  getMyChildSubjects: (accessToken: string, studentId: string, academicYearId?: string) =>
    request<MyChildSubject[]>(`/guardians/me/children/${studentId}/subjects${qs({ academicYearId })}`, { accessToken }),
  getMyChildAttendance: (accessToken: string, studentId: string, academicYearId?: string) =>
    request<MyChildAttendance>(`/guardians/me/children/${studentId}/attendance${qs({ academicYearId })}`, {
      accessToken,
    }),
  getMyChildResults: (accessToken: string, studentId: string) =>
    request<MyChildResult[]>(`/guardians/me/children/${studentId}/exams`, { accessToken }),
  getMyChildInvoices: (accessToken: string, studentId: string) =>
    request<MyChildInvoice[]>(`/guardians/me/children/${studentId}/fees`, { accessToken }),
  getMyChildPhotoUrl: (accessToken: string, studentId: string) =>
    request<{ url: string; uploadedAt: string }>(`/guardians/me/children/${studentId}/photo`, { accessToken }),
  listMyAnnouncements: (accessToken: string) => request<Announcement[]>(`/guardians/me/announcements`, { accessToken }),
  listMyNotifications: (accessToken: string) =>
    request<NotificationItem[]>(`/guardians/me/notifications`, { accessToken }),
  markNotificationRead: (accessToken: string, notificationId: string) =>
    request<NotificationItem>(`/guardians/me/notifications/${notificationId}/read`, {
      method: "PATCH",
      accessToken,
    }),

  // Student Portal — self-service, scoped to the authenticated student's own
  // linked Student record (see StudentPortalService on the backend). None of
  // these take a studentId: there is nothing for a student to tamper with.
  getMyStudentProfile: (accessToken: string) => request<MyStudentProfile>(`/students/me`, { accessToken }),
  getMyStudentAcademicYears: (accessToken: string) =>
    request<MyChildAcademicYear[]>(`/students/me/academic-years`, { accessToken }),
  getMyStudentSubjects: (accessToken: string, academicYearId?: string) =>
    request<MyChildSubject[]>(`/students/me/subjects${qs({ academicYearId })}`, { accessToken }),
  getMyStudentAttendance: (accessToken: string, academicYearId?: string) =>
    request<MyChildAttendance>(`/students/me/attendance${qs({ academicYearId })}`, { accessToken }),
  getMyStudentResults: (accessToken: string) => request<MyChildResult[]>(`/students/me/results`, { accessToken }),
  getMyStudentInvoices: (accessToken: string) => request<MyChildInvoice[]>(`/students/me/invoices`, { accessToken }),
  getMyStudentAnnouncements: (accessToken: string) =>
    request<Announcement[]>(`/students/me/announcements`, { accessToken }),

  changeMyPassword: (accessToken: string, currentPassword: string, newPassword: string) =>
    request<{ success: boolean }>(`/auth/change-password`, {
      method: "POST",
      body: { currentPassword, newPassword },
      accessToken,
    }),

  listTeachers: (accessToken: string, schoolId: string) =>
    request<Teacher[]>(`/schools/${schoolId}/teachers`, { accessToken }),
  createTeacher: (accessToken: string, schoolId: string, body: CreateTeacherInput) =>
    request<Teacher>(`/schools/${schoolId}/teachers`, { method: "POST", body, accessToken }),
  getTeacher: (accessToken: string, schoolId: string, teacherId: string) =>
    request<Teacher>(`/schools/${schoolId}/teachers/${teacherId}`, { accessToken }),
  updateTeacher: (accessToken: string, schoolId: string, teacherId: string, body: UpdateTeacherInput) =>
    request<Teacher>(`/schools/${schoolId}/teachers/${teacherId}`, { method: "PATCH", body, accessToken }),
  deleteTeacher: (accessToken: string, schoolId: string, teacherId: string) =>
    request<{ success: boolean }>(`/schools/${schoolId}/teachers/${teacherId}`, { method: "DELETE", accessToken }),
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

  uploadSchoolLogo: (accessToken: string, schoolId: string, file: File) =>
    uploadFile<{ id: string }>(`/schools/${schoolId}/logo`, file, "logo", accessToken),
  removeSchoolLogo: (accessToken: string, schoolId: string) =>
    request<{ success: boolean }>(`/schools/${schoolId}/logo`, { method: "DELETE", accessToken }),

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
  // schoolId present -> that school's incoming/outgoing view; omitted ->
  // org-wide (Super/Org Admin; a School Admin without one is auto-scoped
  // to their own school(s) server-side) — see TransfersService.list.
  listTransfers: (accessToken: string, filters: TransferListFilters) =>
    request<TransferListResponse>(
      filters.schoolId
        ? `/schools/${filters.schoolId}/transfers${auditLogQs({ ...filters, schoolId: undefined })}`
        : `/transfers${auditLogQs(filters)}`,
      { accessToken },
    ),
  getTransferSummary: (accessToken: string, schoolId?: string) =>
    request<TransferSummary>(`/transfers/summary${qs({ schoolId })}`, { accessToken }),
  approveTransfer: (
    accessToken: string,
    transferId: string,
    body: { academicYearId: string; classId: string; sectionId: string; studentNumber?: string; rollNumber?: number },
  ) => request<Transfer>(`/transfers/${transferId}/approve`, { method: "POST", body, accessToken }),
  rejectTransfer: (accessToken: string, transferId: string, body: { reason: string }) =>
    request<Transfer>(`/transfers/${transferId}/reject`, { method: "POST", body, accessToken }),
  cancelTransfer: (accessToken: string, transferId: string) =>
    request<Transfer>(`/transfers/${transferId}/cancel`, { method: "POST", accessToken }),

  // Bulk (one-admin, one-step) transfer — only succeeds when the actor has
  // access to both schoolId (origin, from the path) and body.toSchoolId
  // (destination) — see TransfersService.previewBulkTransfer/confirmBulkTransfer.
  previewBulkTransfer: (accessToken: string, schoolId: string, body: { toSchoolId: string; studentIds: string[] }) =>
    request<BulkTransferPreview>(`/schools/${schoolId}/students/bulk-transfer/preview`, { method: "POST", body, accessToken }),
  confirmBulkTransfer: (
    accessToken: string,
    schoolId: string,
    body: {
      toSchoolId: string;
      toAcademicYearId: string;
      toClassId: string;
      reason?: string;
      assignments: { studentId: string; sectionId: string }[];
    },
  ) => request<BulkTransferResult>(`/schools/${schoolId}/students/bulk-transfer/confirm`, { method: "POST", body, accessToken }),

  // Student Lifecycle — schoolId omitted means "every school the actor can
  // see" (the backend itself scopes a School Admin to their own school; see
  // StudentLifecycleService.resolveSchoolIds), same convention as the
  // Audit Log's org-wide vs per-school pages.
  getLifecycleSummary: (
    accessToken: string,
    filters: { schoolId?: string; academicYearId?: string; academicYearName?: string },
  ) => request<LifecycleSummary>(`/student-lifecycle/summary${auditLogQs(filters)}`, { accessToken }),
  listLifecycleAcademicYearNames: (accessToken: string, schoolId?: string) =>
    request<LifecycleAcademicYearName[]>(`/student-lifecycle/academic-years${qs({ schoolId })}`, { accessToken }),
  listPrimaryCompleted: (accessToken: string, filters: LifecycleListFilters) =>
    request<LifecycleListResponse>(`/student-lifecycle/primary-completed${auditLogQs(filters)}`, { accessToken }),
  listAwaitingEnrollment: (accessToken: string, filters: LifecycleListFilters) =>
    request<LifecycleListResponse>(`/student-lifecycle/awaiting-enrollment${auditLogQs(filters)}`, { accessToken }),
  listSecondaryGraduated: (accessToken: string, filters: LifecycleListFilters) =>
    request<LifecycleListResponse>(`/student-lifecycle/secondary-graduated${auditLogQs(filters)}`, { accessToken }),
  listAlumni: (accessToken: string, filters: LifecycleListFilters) =>
    request<LifecycleListResponse>(`/student-lifecycle/alumni${auditLogQs(filters)}`, { accessToken }),
  previewForm1Transition: (
    accessToken: string,
    schoolId: string,
    body: { toClassId: string; toAcademicYearId: string; enrollmentIds: string[] },
  ) =>
    request<Form1TransitionPreview>(`/schools/${schoolId}/student-lifecycle/form-1-transition/preview`, {
      method: "POST",
      body,
      accessToken,
    }),
  confirmForm1Transition: (
    accessToken: string,
    schoolId: string,
    body: { toClassId: string; toAcademicYearId: string; assignments: { enrollmentId: string; sectionId: string }[] },
  ) =>
    request<Form1TransitionResult>(`/schools/${schoolId}/student-lifecycle/form-1-transition/confirm`, {
      method: "POST",
      body,
      accessToken,
    }),
  getTransfer: (accessToken: string, transferId: string) =>
    request<Transfer>(`/transfers/${transferId}`, { accessToken }),

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
  saveAttendanceDraft: (
    accessToken: string,
    schoolId: string,
    sectionId: string,
    date: string,
    entries: { enrollmentId: string; status: AttendanceStatus }[],
  ) =>
    request<AttendanceRow[]>(`/schools/${schoolId}/sections/${sectionId}/attendance/draft`, {
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

  getDashboardSummary: (accessToken: string, schoolId: string, academicYearId?: string) =>
    request<DashboardSummary>(`/schools/${schoolId}/dashboard-summary${qs({ academicYearId })}`, { accessToken }),

  getEnrollmentReport: (accessToken: string, schoolId: string, academicYearId: string) =>
    request<EnrollmentReportRow[]>(`/schools/${schoolId}/reports/enrollment${qs({ academicYearId })}`, { accessToken }),
  getAttendanceReport: (accessToken: string, schoolId: string, academicYearId: string, from?: string, to?: string) =>
    request<AttendanceReportRow[]>(`/schools/${schoolId}/reports/attendance${qs({ academicYearId, from, to })}`, {
      accessToken,
    }),

  listAuditLogs: (accessToken: string, schoolId: string, action?: string) =>
    request<AuditLogEntry[]>(
      `/schools/${schoolId}/audit-logs${action ? `?action=${encodeURIComponent(action)}` : ""}`,
      { accessToken },
    ),

  listAuditEvents: (accessToken: string, filters: AuditLogFilters) =>
    request<AuditEventListResponse>(`/audit-logs${auditLogQs(filters)}`, { accessToken }),
  exportAuditEvents: (accessToken: string, filters: AuditLogFilters) =>
    downloadFile(`/audit-logs/export${auditLogQs(filters)}`, accessToken, "audit-log.csv"),

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
