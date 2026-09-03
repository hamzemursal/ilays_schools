// Mirrors apps/api/src/audit/audit-actions.ts — kept as a plain list here
// (not fetched from the API) because these are fixed, known category
// values, exactly like STATUSES/SEVERITIES below; there's no "which actions
// exist" endpoint to fetch it from, and there doesn't need to be one.
export const AUDIT_MODULES = [
  "Authentication",
  "Students",
  "Teachers",
  "Parents",
  "Attendance",
  "Results",
  "Finance",
  "Transfers",
  "Promotions",
  "Academic",
  "School",
] as const;

export const AUDIT_ACTIONS = [
  "LOGIN",
  "LOGIN_FAILED",
  "LOGOUT",
  "PASSWORD_CHANGED",
  "STUDENT_CREATED",
  "STUDENT_UPDATED",
  "STUDENT_ARCHIVED",
  "STUDENT_DELETED",
  "STUDENT_IMPORTED",
  "STUDENT_PORTAL_ACCOUNT_CREATED",
  "STUDENT_TRANSFERRED",
  "TEACHER_CREATED",
  "TEACHER_UPDATED",
  "TEACHER_DELETED",
  "TEACHER_LOGIN_INVITED",
  "PARENT_DELETED",
  "PARENT_LOGIN_INVITED",
  "ATTENDANCE_MARKED",
  "ATTENDANCE_DRAFT_SAVED",
  "RESULTS_ENTERED",
  "RESULTS_APPROVED",
  "INVOICES_GENERATED",
  "PAYMENT_RECORDED",
  "TRANSFER_REQUESTED",
  "TRANSFER_APPROVED",
  "TRANSFER_REJECTED",
  "TRANSFER_CANCELLED",
  "PROMOTION_CONFIRMED",
  "ACADEMIC_YEAR_DELETED",
  "CLASS_BULK_TRANSFERRED",
  "SCHOOL_CREATED",
  "SCHOOL_DELETED",
  "SCHOOL_ADMIN_INVITED",
  "SCHOOL_LOGO_CHANGED",
  "SCHOOL_LOGO_REMOVED",
] as const;

export const AUDIT_STATUSES = ["SUCCESS", "FAILED", "DENIED"] as const;
export const AUDIT_SEVERITIES = ["INFO", "WARNING", "CRITICAL"] as const;

export const AUDIT_RESOURCE_TYPES = [
  "User",
  "Student",
  "StudentEnrollment",
  "Teacher",
  "Guardian",
  "Section",
  "Class",
  "AcademicYear",
  "Transfer",
  "PromotionBatch",
  "ExamSubject",
  "FeeStructure",
  "Invoice",
  "School",
  "ImportBatch",
] as const;

export type DateRangePreset = "today" | "yesterday" | "last7" | "last30" | "thisMonth";

export function resolveDateRangePreset(preset: DateRangePreset): { dateFrom: string; dateTo: string } {
  const toIso = (d: Date) => d.toISOString().slice(0, 10);
  const today = new Date();

  switch (preset) {
    case "today":
      return { dateFrom: toIso(today), dateTo: toIso(today) };
    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { dateFrom: toIso(y), dateTo: toIso(y) };
    }
    case "last7": {
      const from = new Date(today);
      from.setDate(from.getDate() - 6);
      return { dateFrom: toIso(from), dateTo: toIso(today) };
    }
    case "last30": {
      const from = new Date(today);
      from.setDate(from.getDate() - 29);
      return { dateFrom: toIso(from), dateTo: toIso(today) };
    }
    case "thisMonth": {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      return { dateFrom: toIso(from), dateTo: toIso(today) };
    }
  }
}
