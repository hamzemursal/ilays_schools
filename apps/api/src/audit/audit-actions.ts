// Named constants for the action strings AuditService.record() callers pass,
// so every call site spells the same event the same way. `action` itself
// stays a plain string on record() (not a strict union) so this list can
// grow without a schema/type change — these are a readability aid, not an
// enforced enum. Legacy rows created before this file existed keep their
// old "school.create"-style action strings forever; nothing here rewrites
// history.
export const AuditAction = {
  LOGIN: "LOGIN",
  LOGIN_FAILED: "LOGIN_FAILED",
  LOGOUT: "LOGOUT",
  PASSWORD_CHANGED: "PASSWORD_CHANGED",

  STUDENT_CREATED: "STUDENT_CREATED",
  STUDENT_UPDATED: "STUDENT_UPDATED",
  STUDENT_ARCHIVED: "STUDENT_ARCHIVED",
  STUDENT_DELETED: "STUDENT_DELETED",
  STUDENT_IMPORTED: "STUDENT_IMPORTED",
  STUDENT_PORTAL_ACCOUNT_CREATED: "STUDENT_PORTAL_ACCOUNT_CREATED",
  STUDENT_TRANSFERRED: "STUDENT_TRANSFERRED",

  TEACHER_CREATED: "TEACHER_CREATED",
  TEACHER_UPDATED: "TEACHER_UPDATED",
  TEACHER_DELETED: "TEACHER_DELETED",
  TEACHER_LOGIN_INVITED: "TEACHER_LOGIN_INVITED",

  PARENT_DELETED: "PARENT_DELETED",
  PARENT_LOGIN_INVITED: "PARENT_LOGIN_INVITED",

  ATTENDANCE_MARKED: "ATTENDANCE_MARKED",
  ATTENDANCE_DRAFT_SAVED: "ATTENDANCE_DRAFT_SAVED",

  RESULTS_ENTERED: "RESULTS_ENTERED",
  RESULTS_APPROVED: "RESULTS_APPROVED",

  INVOICES_GENERATED: "INVOICES_GENERATED",
  PAYMENT_RECORDED: "PAYMENT_RECORDED",

  TRANSFER_REQUESTED: "TRANSFER_REQUESTED",
  TRANSFER_APPROVED: "TRANSFER_APPROVED",
  TRANSFER_REJECTED: "TRANSFER_REJECTED",
  TRANSFER_CANCELLED: "TRANSFER_CANCELLED",

  PROMOTION_CONFIRMED: "PROMOTION_CONFIRMED",

  ACADEMIC_YEAR_DELETED: "ACADEMIC_YEAR_DELETED",
  CLASS_BULK_TRANSFERRED: "CLASS_BULK_TRANSFERRED",

  SCHOOL_CREATED: "SCHOOL_CREATED",
  SCHOOL_DELETED: "SCHOOL_DELETED",
  SCHOOL_ADMIN_INVITED: "SCHOOL_ADMIN_INVITED",
  SCHOOL_LOGO_CHANGED: "SCHOOL_LOGO_CHANGED",
  SCHOOL_LOGO_REMOVED: "SCHOOL_LOGO_REMOVED",
} as const;

// Named "...Name" to avoid any confusion with the NestJS AuditModule class
// in ./audit.module.ts — this is just a set of string constants.
export const AuditModuleName = {
  AUTHENTICATION: "Authentication",
  STUDENTS: "Students",
  TEACHERS: "Teachers",
  PARENTS: "Parents",
  ATTENDANCE: "Attendance",
  RESULTS: "Results",
  FINANCE: "Finance",
  TRANSFERS: "Transfers",
  PROMOTIONS: "Promotions",
  ACADEMIC: "Academic",
  SCHOOL: "School",
} as const;
