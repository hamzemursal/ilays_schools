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
] as const;

const PERMISSIONS = [
  "students.view",
  "students.create",
  "students.update",
  "students.archive",
  "teachers.view",
  "teachers.create",
  "teachers.update",
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

  const superAdmin = await prisma.role.findUniqueOrThrow({ where: { name: "SUPER_ADMIN" } });
  const allPermissions = await prisma.permission.findMany();
  await prisma.rolePermission.createMany({
    data: allPermissions.map((p) => ({ roleId: superAdmin.id, permissionId: p.id })),
    skipDuplicates: true,
  });

  // eslint-disable-next-line no-console
  console.log("Seed complete: organization, roles, permissions.");
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
