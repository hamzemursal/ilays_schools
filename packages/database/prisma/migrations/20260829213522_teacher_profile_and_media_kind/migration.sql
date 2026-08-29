-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('PHOTO', 'DOCUMENT');

-- DropIndex
DROP INDEX "media_files_ownerType_ownerId_idx";

-- AlterTable
ALTER TABLE "media_files" ADD COLUMN     "kind" "MediaKind" NOT NULL DEFAULT 'PHOTO',
ADD COLUMN     "label" TEXT;

-- AlterTable
ALTER TABLE "teachers" ADD COLUMN     "address" TEXT,
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "emergencyContactName" TEXT,
ADD COLUMN     "emergencyContactPhone" TEXT,
ADD COLUMN     "employmentDate" TIMESTAMP(3),
ADD COLUMN     "sex" "Sex",
ADD COLUMN     "specialization" TEXT;

-- CreateIndex
CREATE INDEX "media_files_ownerType_ownerId_kind_idx" ON "media_files"("ownerType", "ownerId", "kind");
