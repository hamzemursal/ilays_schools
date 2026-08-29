-- CreateEnum
CREATE TYPE "MediaOwnerType" AS ENUM ('STUDENT', 'TEACHER');

-- CreateTable
CREATE TABLE "media_files" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "schoolId" TEXT,
    "ownerType" "MediaOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_files_storageKey_key" ON "media_files"("storageKey");

-- CreateIndex
CREATE INDEX "media_files_ownerType_ownerId_idx" ON "media_files"("ownerType", "ownerId");
