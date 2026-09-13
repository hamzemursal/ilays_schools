-- AddEnum
CREATE TYPE "AttendanceSession" AS ENUM ('MORNING', 'AFTERNOON');

-- AlterTable
-- DEFAULT 'MORNING' backfills every existing row atomically as part of the
-- ADD COLUMN itself — no existing attendance data is rewritten, deleted, or
-- left with an ambiguous/missing session; each pre-existing record simply
-- becomes "the Morning Session record for that day", preserving its
-- original meaning as the one attendance mark that existed for that day.
ALTER TABLE "attendance_records" ADD COLUMN "session" "AttendanceSession" NOT NULL DEFAULT 'MORNING';
ALTER TABLE "attendance_drafts" ADD COLUMN "session" "AttendanceSession" NOT NULL DEFAULT 'MORNING';

-- DropIndex
DROP INDEX "attendance_records_enrollmentId_date_key";
DROP INDEX "attendance_drafts_enrollmentId_date_key";

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_enrollmentId_date_session_key" ON "attendance_records"("enrollmentId", "date", "session");
CREATE UNIQUE INDEX "attendance_drafts_enrollmentId_date_session_key" ON "attendance_drafts"("enrollmentId", "date", "session");
