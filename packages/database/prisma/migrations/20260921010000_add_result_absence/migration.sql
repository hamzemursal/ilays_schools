-- AlterTable: an absent student is recorded as absent, never as a stored 0.
-- Additive only — every existing numeric mark keeps its value and stays
-- isAbsent = false.
ALTER TABLE "results" ADD COLUMN "isAbsent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "results" ALTER COLUMN "marksObtained" DROP NOT NULL;

-- A result is either a real mark or an explicit absence — never both, never
-- neither. (Prisma's schema DSL can't express CHECK constraints, so this
-- lives only here and in the service layer.)
ALTER TABLE "results" ADD CONSTRAINT "results_mark_or_absent_check"
    CHECK (("isAbsent" = true AND "marksObtained" IS NULL) OR ("isAbsent" = false AND "marksObtained" IS NOT NULL));
