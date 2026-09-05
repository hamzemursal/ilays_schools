-- CreateEnum
CREATE TYPE "ExamPaperStatus" AS ENUM ('DRAFT', 'SUBMITTED');

-- AlterTable
ALTER TABLE "result_submissions" ADD COLUMN "paperStatus" "ExamPaperStatus",
ADD COLUMN "paperSubmittedByUserId" TEXT,
ADD COLUMN "paperSubmittedAt" TIMESTAMP(3);
