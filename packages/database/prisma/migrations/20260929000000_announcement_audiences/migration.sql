-- Phase 2 announcement audiences. Purely additive: new enum values, nullable
-- scope columns, a nullable deliveredAt marker, and one-delivery-per-person
-- unique indexes. Existing announcements keep their audience (ALL / PARENTS /
-- TEACHERS) and deliveredAt NULL, so they are never re-sent.

-- Refuse to continue if existing data already holds a duplicate delivery the
-- new unique indexes would reject — surfaced for a human to review, never
-- silently deleted.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "notifications"
    WHERE "announcementId" IS NOT NULL AND "userId" IS NOT NULL
    GROUP BY "announcementId", "userId" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate (announcementId, userId) notifications exist — review them before applying this migration';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "notifications"
    WHERE "announcementId" IS NOT NULL AND "guardianId" IS NOT NULL
    GROUP BY "announcementId", "guardianId" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate (announcementId, guardianId) notifications exist — review them before applying this migration';
  END IF;
END $$;

-- AlterEnum


ALTER TYPE "AnnouncementAudience" ADD VALUE 'CURRENT_STUDENTS';
ALTER TYPE "AnnouncementAudience" ADD VALUE 'STAFF';
ALTER TYPE "AnnouncementAudience" ADD VALUE 'ALUMNI';
ALTER TYPE "AnnouncementAudience" ADD VALUE 'FORMER_PARENTS';
ALTER TYPE "AnnouncementAudience" ADD VALUE 'INDIVIDUAL';

-- AlterTable
ALTER TABLE "announcements" ADD COLUMN     "academicYearId" TEXT,
ADD COLUMN     "classId" TEXT,
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "sectionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "notifications_announcementId_userId_key" ON "notifications"("announcementId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_announcementId_guardianId_key" ON "notifications"("announcementId", "guardianId");

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

