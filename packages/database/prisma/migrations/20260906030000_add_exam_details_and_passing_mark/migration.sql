-- AlterTable
ALTER TABLE "exams" ADD COLUMN "startDate" DATE,
ADD COLUMN "endDate" DATE,
ADD COLUMN "description" TEXT;

-- AlterTable
ALTER TABLE "exam_subjects" ADD COLUMN "passingMark" INTEGER;
