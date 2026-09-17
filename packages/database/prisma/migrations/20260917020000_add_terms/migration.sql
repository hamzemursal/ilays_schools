-- CreateTable
CREATE TABLE "terms" (
    "id" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "terms_academicYearId_name_key" ON "terms"("academicYearId", "name");

-- AddForeignKey
ALTER TABLE "terms" ADD CONSTRAINT "terms_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: nullable so existing exams (created before Term existed) keep
-- working unassigned — never backfilled, since guessing which historical
-- exam belongs to which term would fabricate data that was never recorded.
ALTER TABLE "exams" ADD COLUMN "termId" TEXT;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_termId_fkey" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every AcademicYear created before this migration still needs its
-- own Term 1 (50%) and Term 2 (50%) — the app's invariant is "every academic
-- year has exactly these two terms", and AcademicYearsService only creates
-- them going forward for brand-new years. Without this, every school's
-- already-existing current year would have zero terms after this deploys,
-- silently breaking exam creation and promotion for a year already in use.
-- This creates ONLY the two Term rows themselves at the default weighting —
-- it does not touch a single Exam row or guess which term any historical
-- exam belongs to (that stays NULL, exactly as above).
INSERT INTO "terms" ("id", "academicYearId", "name", "weight", "createdAt", "updatedAt")
SELECT gen_random_uuid(), ay."id", t."name", 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "academic_years" ay
CROSS JOIN (VALUES ('Term 1'), ('Term 2')) AS t("name")
WHERE NOT EXISTS (
    SELECT 1 FROM "terms" existing WHERE existing."academicYearId" = ay."id" AND existing."name" = t."name"
);
