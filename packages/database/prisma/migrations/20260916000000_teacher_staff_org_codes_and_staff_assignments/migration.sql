-- AlterTable: permanent, organization-wide identity codes alongside the
-- existing per-school employeeNumber/staffNumber (left untouched — this is
-- purely additive, no existing column changes meaning or format).
ALTER TABLE "teachers" ADD COLUMN "teacherCode" TEXT;
ALTER TABLE "staff" ADD COLUMN "staffCode" TEXT;

-- CreateEnum
CREATE TYPE "StaffAssignmentStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "staff_assignments" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "departmentId" TEXT,
    "role" TEXT,
    "status" "StaffAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_assignments_staffId_schoolId_key" ON "staff_assignments"("staffId", "schoolId");

-- CreateIndex
CREATE INDEX "staff_assignments_staffId_idx" ON "staff_assignments"("staffId");

-- CreateIndex
CREATE INDEX "staff_assignments_schoolId_idx" ON "staff_assignments"("schoolId");

-- AddForeignKey
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill teacherCode for every teacher that already existed before this
-- column did, ordered by createdAt so codes land in creation order. Every
-- teacher created from here on gets one immediately at creation time (see
-- TeachersService.create) — this UPDATE only ever runs once, on deploy.
WITH numbered AS (
    SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS rn
    FROM "teachers"
)
UPDATE "teachers" t
SET "teacherCode" = 'TCH-' || LPAD(numbered.rn::text, 5, '0')
FROM numbered
WHERE numbered."id" = t."id";

-- Backfill staffCode, same rule.
WITH numbered AS (
    SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS rn
    FROM "staff"
)
UPDATE "staff" s
SET "staffCode" = 'STF-' || LPAD(numbered.rn::text, 5, '0')
FROM numbered
WHERE numbered."id" = s."id";

-- CreateIndex
CREATE UNIQUE INDEX "teachers_teacherCode_key" ON "teachers"("teacherCode");

-- CreateIndex
CREATE UNIQUE INDEX "staff_staffCode_key" ON "staff"("staffCode");

-- Backfill: give every staff member that already existed an initial
-- assignment at their current home school, so staff_assignments reflects
-- the one real school relationship that already existed before this table
-- did — nobody silently loses their (only) school the moment this ships.
-- A staff member already marked INACTIVE keeps that reflected on the new
-- assignment row too, rather than resetting everyone to ACTIVE.
INSERT INTO "staff_assignments" ("id", "staffId", "schoolId", "departmentId", "role", "status", "createdAt", "updatedAt")
SELECT
    gen_random_uuid(),
    s."id",
    s."schoolId",
    s."departmentId",
    s."jobTitle",
    CASE WHEN s."status" = 'INACTIVE' THEN 'INACTIVE' ELSE 'ACTIVE' END::"StaffAssignmentStatus",
    s."createdAt",
    s."updatedAt"
FROM "staff" s;
