import { randomBytes, createHash } from "node:crypto";
import { PrismaClient } from "../generated/client";

const prisma = new PrismaClient();
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:3010";

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
    "audit.view",
    "imports.create",
    "exports.create",
    "reports.view",
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

  // eslint-disable-next-line no-console
  console.log("Seed complete: organization, roles, permissions.");

  // ---------------------------------------------------------------------
  // Dev-only test fixtures — NOT part of the real school-creation flow.
  // These exist purely so Phase 1 auth (login/invite/accept) can be
  // exercised end-to-end in a browser. Production school creation never
  // auto-creates a school, admin, or invitation like this.
  // ---------------------------------------------------------------------
  if (process.env.NODE_ENV !== "production") {
    await seedDevAuthFixtures();
  }
}

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
  await prisma.division.upsert({
    where: { schoolId_type: { schoolId: school.id, type: "PRIMARY" } },
    update: {},
    create: { schoolId: school.id, type: "PRIMARY" },
  });

  const schoolAdminRole = await prisma.role.findUniqueOrThrow({ where: { name: "SCHOOL_ADMIN" } });
  const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { name: "SUPER_ADMIN" } });

  await createDevInvitation({
    email: "admin@saamalay.test",
    organizationId: org.id,
    roleId: schoolAdminRole.id,
    schoolId: school.id,
    label: "School Admin (scoped to Saamalay Primary School)",
  });

  await createDevInvitation({
    email: "super@ilays.test",
    organizationId: org.id,
    roleId: superAdminRole.id,
    schoolId: null,
    label: "Super Admin (organization-wide)",
  });
}

async function createDevInvitation(opts: {
  email: string;
  organizationId: string;
  roleId: string;
  schoolId: string | null;
  label: string;
}) {
  const existingUser = await prisma.user.findUnique({ where: { email: opts.email } });
  if (existingUser?.status === "ACTIVE") {
    // eslint-disable-next-line no-console
    console.log(`Skipped: ${opts.email} already active.`);
    return;
  }

  const user = await prisma.user.upsert({
    where: { email: opts.email },
    update: {},
    create: { email: opts.email, organizationId: opts.organizationId, status: "PENDING_SETUP" },
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

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  await prisma.invitation.create({
    data: {
      organizationId: opts.organizationId,
      schoolId: opts.schoolId,
      roleId: opts.roleId,
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  // eslint-disable-next-line no-console
  console.log(`\n${opts.label}`);
  // eslint-disable-next-line no-console
  console.log(`  Email:  ${opts.email}`);
  // eslint-disable-next-line no-console
  console.log(`  Accept: ${WEB_ORIGIN}/accept-invite?token=${rawToken}`);
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
