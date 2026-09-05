-- AlterEnum
ALTER TYPE "MediaOwnerType" ADD VALUE 'RESULT_SUBMISSION';

-- CreateEnum
CREATE TYPE "ResultSubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'NEEDS_CORRECTION', 'APPROVED', 'PUBLISHED');

-- CreateTable
CREATE TABLE "result_submissions" (
    "id" TEXT NOT NULL,
    "examSubjectId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "status" "ResultSubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "submittedByUserId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "returnedByUserId" TEXT,
    "returnedAt" TIMESTAMP(3),
    "returnReason" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "publishedByUserId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "result_submissions_examSubjectId_sectionId_key" ON "result_submissions"("examSubjectId", "sectionId");

-- CreateIndex
CREATE INDEX "result_submissions_sectionId_status_idx" ON "result_submissions"("sectionId", "status");

-- AddForeignKey
ALTER TABLE "result_submissions" ADD CONSTRAINT "result_submissions_examSubjectId_fkey" FOREIGN KEY ("examSubjectId") REFERENCES "exam_subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_submissions" ADD CONSTRAINT "result_submissions_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "results" ADD COLUMN "resultSubmissionId" TEXT;

-- Backfill: one ResultSubmission row per (examSubjectId, sectionId) pair that
-- already has Result rows under the old two-state Result.status column
-- (kept in place below — this migration is deliberately additive only, no
-- columns are dropped). A group where every existing result was already
-- 'APPROVED' is treated as already published, so today's Student/Parent
-- Portal visibility (which currently reads Result.status = 'APPROVED')
-- carries over unchanged once those portals switch to reading
-- ResultSubmission.status = 'PUBLISHED' — nobody's already-visible result
-- disappears on deploy day. The real historical approver/timestamp is
-- preserved as the approval record; publish is deliberately left unset
-- rather than inventing a publish event that never actually happened. A
-- group with any still-'ENTERED' result becomes DRAFT, since no real
-- submission was ever requested for it under the old workflow. On a
-- fresh/empty results table this inserts and updates zero rows, which is
-- exactly correct.
INSERT INTO "result_submissions" (
    "id", "examSubjectId", "sectionId", "status",
    "approvedByUserId", "approvedAt", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid(),
    g."examSubjectId",
    g."sectionId",
    CASE WHEN g."allApproved" THEN 'PUBLISHED' ELSE 'DRAFT' END::"ResultSubmissionStatus",
    CASE WHEN g."allApproved" THEN g."lastApprover" ELSE NULL END,
    CASE WHEN g."allApproved" THEN g."lastUpdated" ELSE NULL END,
    g."firstCreated",
    g."lastUpdated"
FROM (
    SELECT
        r."examSubjectId" AS "examSubjectId",
        se."sectionId" AS "sectionId",
        bool_and(r."status" = 'APPROVED') AS "allApproved",
        (array_agg(r."approvedByUserId" ORDER BY r."updatedAt" DESC))[1] AS "lastApprover",
        max(r."updatedAt") AS "lastUpdated",
        min(r."createdAt") AS "firstCreated"
    FROM "results" r
    JOIN "student_enrollments" se ON se."id" = r."enrollmentId"
    GROUP BY r."examSubjectId", se."sectionId"
) g;

UPDATE "results" r
SET "resultSubmissionId" = rs."id"
FROM "result_submissions" rs, "student_enrollments" se
WHERE se."id" = r."enrollmentId"
    AND rs."examSubjectId" = r."examSubjectId"
    AND rs."sectionId" = se."sectionId";

-- AlterTable
ALTER TABLE "results" ALTER COLUMN "resultSubmissionId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_resultSubmissionId_fkey" FOREIGN KEY ("resultSubmissionId") REFERENCES "result_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
