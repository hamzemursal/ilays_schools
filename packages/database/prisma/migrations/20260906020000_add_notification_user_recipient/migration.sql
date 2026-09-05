-- AlterTable
ALTER TABLE "notifications" ALTER COLUMN "guardianId" DROP NOT NULL;
ALTER TABLE "notifications" ADD COLUMN "userId" TEXT;
ALTER TABLE "notifications" ADD COLUMN "actionUrl" TEXT;

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
