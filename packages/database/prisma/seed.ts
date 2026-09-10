import * as argon2 from "argon2";
import { PrismaClient } from "../generated/client";

const prisma = new PrismaClient();

// Base RBAC scaffolding + the one real organization record. This never seeds
// schools, teachers, students, or sections — those are created deliberately
// through the app, per the platform's non-negotiable rules.

const ROLES = [
  "SUPER_ADMIN",
  "ORGANIZATION_ADMIN",
  "SCHOOL_ADMIN",
  "TEACHER",
  "STUDENT",
  "PARENT",
  "FINANCE_STAFF",
  "EXAM_OFFICER",
  "HR_STAFF",
  "LIBRARY_STAFF",
  "ACCOUNTANT",
  // Organization-wide oversight roles (Workforce/HR/Finance architecture,
  // Phase 2) — each gets an explicit, curated UserSchool list rather than
  // the org-wide schoolIds:[] shortcut reserved for SUPER_ADMIN/
  // ORGANIZATION_ADMIN, so granting one of these never implies access to
  // every school.
  "CENTRAL_FINANCE_VIEWER",
  "CENTRAL_FINANCE_MANAGER",
  "CENTRAL_HR",
] as const;

const PERMISSIONS = [
  "schools.view",
  "schools.create",
  "schools.manage",
  "academic.view",
  "academic.manage",
  "students.view",
  "students.create",
  "students.update",
  "students.archive",
  "teachers.view",
  "teachers.create",
  "teachers.update",
  "guardians.view",
  "guardians.manage",
  "announcements.view",
  "announcements.manage",
  "enrollments.manage",
  "transfers.create",
  "transfers.approve",
  "promotions.execute",
  "attendance.mark",
  "attendance.view",
  "results.enter",
  "results.approve",
  "results.view",
  "fees.manage",
  "payments.record",
  "imports.create",
  "exports.create",
  "reports.view",
  "settings.manage",
  "audit.view",

  // Staff / HR foundation (Phase 2) — Staff is a sibling domain to Teacher,
  // never merged into it; departments are a configurable per-school lookup.
  "staff.view",
  "staff.create",
  "staff.update",
  "departments.manage",
  "hr.leave.view",
  "hr.leave.manage",
  "hr.leave.approve",
  "hr.attendance.mark",
  "hr.attendance.view",

  // Student Finance foundation (Phase 2) — additive alongside the existing
  // fees.manage/payments.record pair, which stays exactly as-is since the
  // live fee-structures/invoices endpoints already gate on those two keys.
  // These finer-grained keys are what the Draft/Verify/Approve/Reverse
  // workflow (ZAAD verification, adjustments, reversal) will require once
  // its services exist.
  "finance.ledger.view",
  "finance.adjustments.manage",
  "finance.payments.verify",
  "finance.payments.reverse",
  "finance.reports.view",
  "finance.dashboard.view",
  "finance.central.view",
  "finance.central.manage",
  "expenses.view",
  "expenses.create",
  "expenses.approve",

  // Payroll foundation (Phase 2) — separate keys per workflow stage so no
  // single role can go from Draft straight to Paid unchecked.
  "payroll.view",
  "payroll.prepare",
  "payroll.review",
  "payroll.approve",
  "payroll.pay",
] as const;

async function main() {
  await prisma.organization.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Ilays Schools",
    },
  });

  for (const name of ROLES) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }

  for (const key of PERMISSIONS) {
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key } });
  }

  // SUPER_ADMIN and ORGANIZATION_ADMIN are the only org-wide roles for now —
  // both get every permission. Every other role starts with none; granting
  // scoped permissions to TEACHER/SCHOOL_ADMIN/etc. is an admin decision made
  // through the app later, not something to hardcode here.
  const orgWideRoles = await prisma.role.findMany({
    where: { name: { in: ["SUPER_ADMIN", "ORGANIZATION_ADMIN"] } },
  });
  const allPermissions = await prisma.permission.findMany();
  for (const role of orgWideRoles) {
    await prisma.rolePermission.createMany({
      data: allPermissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }

  // SCHOOL_ADMIN manages their own school's academic structure — the first
  // permission this role actually gets, scoped by the resource layer (a
  // School Admin can only ever reach their own school regardless of this
  // permission, since the service filters by UserSchool, not by role name).
  const schoolAdmin = await prisma.role.findUniqueOrThrow({ where: { name: "SCHOOL_ADMIN" } });
  const schoolAdminPermissionKeys = [
    "academic.view",
    "academic.manage",
    "students.view",
    "students.create",
    "students.update",
    "students.archive",
    "teachers.view",
    "teachers.create",
    "teachers.update",
    "staff.view",
    "staff.create",
    "staff.update",
    "departments.manage",
    "hr.leave.view",
    "hr.leave.manage",
    "hr.leave.approve",
    "hr.attendance.mark",
    "hr.attendance.view",
    "guardians.view",
    "guardians.manage",
    "announcements.view",
    "announcements.manage",
    "enrollments.manage",
    "promotions.execute",
    "transfers.create",
    "transfers.approve",
    "attendance.mark",
    "attendance.view",
    "results.enter",
    "results.approve",
    "results.view",
    "fees.manage",
    "payments.record",
    "finance.ledger.view",
    "finance.adjustments.manage",
    "finance.payments.verify",
    "finance.payments.reverse",
    "finance.reports.view",
    "finance.dashboard.view",
    "expenses.view",
    "expenses.create",
    "expenses.approve",
    "payroll.view",
    "payroll.prepare",
    "payroll.review",
    "payroll.approve",
    "payroll.pay",
    "audit.view",
    "imports.create",
    "exports.create",
    "reports.view",
    "settings.manage",
  ];
  const schoolAdminPermissions = await prisma.permission.findMany({
    where: { key: { in: schoolAdminPermissionKeys } },
  });
  await prisma.rolePermission.createMany({
    data: schoolAdminPermissions.map((p) => ({ roleId: schoolAdmin.id, permissionId: p.id })),
    skipDuplicates: true,
  });

  // TEACHER gets exactly the day-to-day classroom actions — never
  // results.approve, which stays an admin-level check on the data teachers
  // enter (see ExamsService.approveResults).
  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { name: "TEACHER" } });
  const teacherPermissionKeys = ["attendance.mark", "attendance.view", "results.enter", "results.view"];
  const teacherPermissions = await prisma.permission.findMany({
    where: { key: { in: teacherPermissionKeys } },
  });
  await prisma.rolePermission.createMany({
    data: teacherPermissions.map((p) => ({ roleId: teacherRole.id, permissionId: p.id })),
    skipDuplicates: true,
  });

  // FINANCE_STAFF and ACCOUNTANT exist specifically for this — fee setup and
  // payment recording are their whole job, so both get the full pair.
  const financeRoles = await prisma.role.findMany({ where: { name: { in: ["FINANCE_STAFF", "ACCOUNTANT"] } } });
  const financePermissions = await prisma.permission.findMany({
    where: { key: { in: ["fees.manage", "payments.record"] } },
  });
  for (const role of financeRoles) {
    await prisma.rolePermission.createMany({
      data: financePermissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }

  // ACCOUNTANT ("School Accountant") is record-and-view only — it can see
  // the ledger and expenses and prepare/view payroll, but never verifies a
  // ZAAD payment, approves an adjustment, reverses a payment, or approves an
  // expense/payroll run. Those stronger actions are reserved for
  // FINANCE_STAFF ("School Finance Officer/Manager") below, per the
  // approved RBAC matrix's explicit split between the two roles.
  const accountantRole = await prisma.role.findUniqueOrThrow({ where: { name: "ACCOUNTANT" } });
  const accountantPermissionKeys = ["finance.ledger.view", "expenses.view", "expenses.create", "payroll.view"];
  const accountantPermissions = await prisma.permission.findMany({
    where: { key: { in: accountantPermissionKeys } },
  });
  await prisma.rolePermission.createMany({
    data: accountantPermissions.map((p) => ({ roleId: accountantRole.id, permissionId: p.id })),
    skipDuplicates: true,
  });

  // FINANCE_STAFF ("School Finance Officer/Manager") gets everything
  // ACCOUNTANT has plus the workflow actions that require a stronger role:
  // ZAAD verification, adjustments, reversal, expense/payroll approval and
  // payment, and the school's own finance dashboard/reports.
  const financeStaffRole = await prisma.role.findUniqueOrThrow({ where: { name: "FINANCE_STAFF" } });
  const financeStaffPermissionKeys = [
    ...accountantPermissionKeys,
    "finance.adjustments.manage",
    "finance.payments.verify",
    "finance.payments.reverse",
    "finance.reports.view",
    "finance.dashboard.view",
    "expenses.approve",
    "payroll.prepare",
    "payroll.review",
    "payroll.approve",
    "payroll.pay",
  ];
  const financeStaffPermissions = await prisma.permission.findMany({
    where: { key: { in: financeStaffPermissionKeys } },
  });
  await prisma.rolePermission.createMany({
    data: financeStaffPermissions.map((p) => ({ roleId: financeStaffRole.id, permissionId: p.id })),
    skipDuplicates: true,
  });

  // HR_STAFF ("HR Officer") — non-financial employment records for Teachers
  // and Staff: staff records, department assignment, leave, and workforce
  // attendance. Never a financial permission — payroll stays Finance/HR
  // Officer-approval only, HR_STAFF itself has no payroll.* key.
  const hrStaffRole = await prisma.role.findUniqueOrThrow({ where: { name: "HR_STAFF" } });
  const hrStaffPermissionKeys = [
    "staff.view",
    "staff.create",
    "staff.update",
    "departments.manage",
    "hr.leave.view",
    "hr.leave.manage",
    "hr.leave.approve",
    "hr.attendance.mark",
    "hr.attendance.view",
    "teachers.view",
    "reports.view",
  ];
  const hrStaffPermissions = await prisma.permission.findMany({
    where: { key: { in: hrStaffPermissionKeys } },
  });
  await prisma.rolePermission.createMany({
    data: hrStaffPermissions.map((p) => ({ roleId: hrStaffRole.id, permissionId: p.id })),
    skipDuplicates: true,
  });

  // CENTRAL_FINANCE_VIEWER — read-only, cross-school (whichever schools the
  // admin later assigns via UserSchool). VIEW ALL, never MANAGE ALL.
  const centralFinanceViewerRole = await prisma.role.findUniqueOrThrow({
    where: { name: "CENTRAL_FINANCE_VIEWER" },
  });
  const centralFinanceViewerPermissionKeys = [
    "schools.view",
    "finance.central.view",
    "finance.ledger.view",
    "finance.reports.view",
    "finance.dashboard.view",
  ];
  const centralFinanceViewerPermissions = await prisma.permission.findMany({
    where: { key: { in: centralFinanceViewerPermissionKeys } },
  });
  await prisma.rolePermission.createMany({
    data: centralFinanceViewerPermissions.map((p) => ({ roleId: centralFinanceViewerRole.id, permissionId: p.id })),
    skipDuplicates: true,
  });

  // CENTRAL_FINANCE_MANAGER — everything the viewer has, plus write/approval
  // authority across its assigned schools. Still never every school by
  // default — that remains a per-user UserSchool assignment, not implied by
  // this role.
  const centralFinanceManagerRole = await prisma.role.findUniqueOrThrow({
    where: { name: "CENTRAL_FINANCE_MANAGER" },
  });
  const centralFinanceManagerPermissionKeys = [
    ...centralFinanceViewerPermissionKeys,
    "finance.central.manage",
    "finance.adjustments.manage",
    "finance.payments.verify",
    "finance.payments.reverse",
    "expenses.view",
    "expenses.approve",
    "payroll.view",
    "payroll.approve",
    "payroll.pay",
  ];
  const centralFinanceManagerPermissions = await prisma.permission.findMany({
    where: { key: { in: centralFinanceManagerPermissionKeys } },
  });
  await prisma.rolePermission.createMany({
    data: centralFinanceManagerPermissions.map((p) => ({ roleId: centralFinanceManagerRole.id, permissionId: p.id })),
    skipDuplicates: true,
  });

  // CENTRAL_HR — the same organization-wide oversight pattern as Central
  // Finance, applied to HR/workforce data instead of money.
  const centralHrRole = await prisma.role.findUniqueOrThrow({ where: { name: "CENTRAL_HR" } });
  const centralHrPermissionKeys = [
    "schools.view",
    "staff.view",
    "staff.create",
    "staff.update",
    "departments.manage",
    "teachers.view",
    "hr.leave.view",
    "hr.leave.manage",
    "hr.leave.approve",
    "hr.attendance.view",
    "reports.view",
  ];
  const centralHrPermissions = await prisma.permission.findMany({
    where: { key: { in: centralHrPermissionKeys } },
  });
  await prisma.rolePermission.createMany({
    data: centralHrPermissions.map((p) => ({ roleId: centralHrRole.id, permissionId: p.id })),
    skipDuplicates: true,
  });

  // eslint-disable-next-line no-console
  console.log("Seed complete: organization, roles, permissions.");

  // ---------------------------------------------------------------------
  // Dev-only test fixtures — NOT part of the real school-creation flow.
  // These exist so local dev has a working login out of the box and so the
  // e2e suite (apps/e2e) has known, reproducible accounts/data to run
  // against, including in CI against a freshly migrated database. Real
  // school creation (SchoolsService.create) never auto-creates a school,
  // admin, academic structure, or student like this.
  // ---------------------------------------------------------------------
  if (process.env.NODE_ENV !== "production") {
    await seedDevAuthFixtures();
  }
}

// Every one of these must stay in sync with apps/e2e/fixtures/credentials.ts
// — duplicated rather than shared through a new workspace package, since
// it's a handful of constants and a cross-package dependency between
// @school-erp/database and the e2e app isn't worth it for that.
export const E2E_ADMIN_EMAIL = "admin@saamalay.test";
export const E2E_ADMIN_PASSWORD = "SuperSecret123!";
export const E2E_SUPER_ADMIN_EMAIL = "super@ilays.test";
export const E2E_SUPER_ADMIN_PASSWORD = "SuperSecret123!";
export const E2E_TEACHER_EMAIL = "teacher@saamalay.test";
export const E2E_TEACHER_PASSWORD = "TeacherPass123!";
export const E2E_PARENT_EMAIL = "amina.ali@example.test";
export const E2E_PARENT_PASSWORD = "ParentPass123!";

async function seedDevAuthFixtures() {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: "00000000-0000-0000-0000-000000000001" },
  });

  const school = await prisma.school.upsert({
    where: { organizationId_name: { organizationId: org.id, name: "Saamalay Primary School" } },
    update: {},
    create: {
      organizationId: org.id,
      name: "Saamalay Primary School",
      type: "PRIMARY",
    },
  });

  // Mirrors SchoolsService.create()'s division bootstrap — this fixture
  // predates that logic, so a fresh seed run has to catch it up too.
  const division = await prisma.division.upsert({
    where: { schoolId_type: { schoolId: school.id, type: "PRIMARY" } },
    update: {},
    create: { schoolId: school.id, type: "PRIMARY" },
  });

  // Minimal academic structure — just enough for the e2e suite to have
  // somewhere real to enroll a student and assign a teacher. Nothing here
  // is auto-created by any real app flow; SchoolsService.create() never
  // seeds this, matching the platform's own "no school ever gets
  // auto-populated fake teachers/students/sections" rule.
  // No unique constraint on (schoolId, name) exists for AcademicYear —
  // find-then-create rather than upsert.
  let academicYear = await prisma.academicYear.findFirst({ where: { schoolId: school.id, name: "2027" } });
  if (!academicYear) {
    academicYear = await prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2027",
        startDate: new Date("2027-01-01"),
        endDate: new Date("2027-12-31"),
        isCurrent: true,
      },
    });
  }

  const klass = await prisma.class.upsert({
    where: { divisionId_level: { divisionId: division.id, level: 1 } },
    update: {},
    create: { divisionId: division.id, name: "Class 1", level: 1 },
  });

  const section = await prisma.section.upsert({
    where: { classId_name: { classId: klass.id, name: "A" } },
    update: {},
    create: { classId: klass.id, name: "A", capacity: null },
  });

  const schoolAdminRole = await prisma.role.findUniqueOrThrow({ where: { name: "SCHOOL_ADMIN" } });
  const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { name: "SUPER_ADMIN" } });
  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { name: "TEACHER" } });
  const parentRole = await prisma.role.findUniqueOrThrow({ where: { name: "PARENT" } });

  await createActiveTestUser({
    email: E2E_ADMIN_EMAIL,
    password: E2E_ADMIN_PASSWORD,
    organizationId: org.id,
    roleId: schoolAdminRole.id,
    schoolId: school.id,
    label: "School Admin (scoped to Saamalay Primary School)",
  });

  await createActiveTestUser({
    email: E2E_SUPER_ADMIN_EMAIL,
    password: E2E_SUPER_ADMIN_PASSWORD,
    organizationId: org.id,
    roleId: superAdminRole.id,
    schoolId: null,
    label: "Super Admin (organization-wide)",
  });

  const teacherUser = await createActiveTestUser({
    email: E2E_TEACHER_EMAIL,
    password: E2E_TEACHER_PASSWORD,
    organizationId: org.id,
    roleId: teacherRole.id,
    schoolId: school.id,
    label: "Teacher (Saamalay Primary School)",
  });
  await prisma.teacher.upsert({
    where: { userId: teacherUser.id },
    update: {},
    create: {
      userId: teacherUser.id,
      schoolId: school.id,
      employeeNumber: "EMP-0001",
      firstName: "Amran",
      lastName: "Hassan",
    },
  });

  const parentUser = await createActiveTestUser({
    email: E2E_PARENT_EMAIL,
    password: E2E_PARENT_PASSWORD,
    organizationId: org.id,
    roleId: parentRole.id,
    schoolId: null,
    label: "Parent (linked to Hodan Ali)",
  });
  const guardian = await prisma.guardian.upsert({
    where: { userId: parentUser.id },
    update: {},
    create: { userId: parentUser.id, firstName: "Amina", lastName: "Ali", phone: "0611111111" },
  });

  // Matched by name+DOB, not legacyStudentNumber — this fixture predates
  // that field being set on manually-created dev data (e.g. a Hodan Ali
  // created by hand in an earlier session), and matching the same way
  // StudentsService.findDuplicateCandidates does avoids seeding a second,
  // colliding Student row for what's really the same fixture.
  let student = await prisma.student.findFirst({
    where: { organizationId: org.id, firstName: "Hodan", lastName: "Ali", dateOfBirth: new Date("2018-05-01") },
  });
  if (!student) {
    student = await prisma.student.create({
      data: {
        organizationId: org.id,
        firstName: "Hodan",
        lastName: "Ali",
        dateOfBirth: new Date("2018-05-01"),
        sex: "FEMALE",
        legacyStudentNumber: "E2E-HODAN-ALI",
      },
    });
  }

  const existingEnrollment = await prisma.studentEnrollment.findFirst({
    where: { studentId: student.id, schoolId: school.id, academicYearId: academicYear.id },
  });
  if (!existingEnrollment) {
    await prisma.studentEnrollment.create({
      data: {
        studentId: student.id,
        organizationId: org.id,
        schoolId: school.id,
        academicYearId: academicYear.id,
        classId: klass.id,
        sectionId: section.id,
        studentNumber: "STU-2027-00001",
        rollNumber: 1,
      },
    });
  }

  await prisma.studentGuardian.upsert({
    where: { studentId_guardianId: { studentId: student.id, guardianId: guardian.id } },
    update: {},
    create: { studentId: student.id, guardianId: guardian.id, relationship: "MOTHER", isPrimaryContact: true },
  });
}

async function createActiveTestUser(opts: {
  email: string;
  password: string;
  organizationId: string;
  roleId: string;
  schoolId: string | null;
  label: string;
}) {
  const passwordHash = await argon2.hash(opts.password, { type: argon2.argon2id });

  const user = await prisma.user.upsert({
    where: { email: opts.email },
    update: { passwordHash, status: "ACTIVE" },
    create: { email: opts.email, organizationId: opts.organizationId, passwordHash, status: "ACTIVE" },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: opts.roleId } },
    update: {},
    create: { userId: user.id, roleId: opts.roleId },
  });

  if (opts.schoolId) {
    await prisma.userSchool.upsert({
      where: { userId_schoolId: { userId: user.id, schoolId: opts.schoolId } },
      update: {},
      create: { userId: user.id, schoolId: opts.schoolId },
    });
  }

  // eslint-disable-next-line no-console
  console.log(`${opts.label}: ${opts.email} / ${opts.password}`);
  return user;
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
