-- Records which school's Parents page created a guardian, so a parent added
-- with no child yet appears in that school's list (and only there). Purely
-- additive: a nullable column; existing guardians keep NULL.

-- AlterTable
ALTER TABLE "guardians" ADD COLUMN     "createdInSchoolId" TEXT;

-- CreateIndex
CREATE INDEX "guardians_createdInSchoolId_idx" ON "guardians"("createdInSchoolId");

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_createdInSchoolId_fkey" FOREIGN KEY ("createdInSchoolId") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;
