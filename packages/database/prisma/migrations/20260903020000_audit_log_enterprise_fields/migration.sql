-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('SUCCESS', 'FAILED', 'DENIED');

-- CreateEnum
CREATE TYPE "AuditSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- AlterTable
ALTER TABLE "audit_logs"
    ADD COLUMN     "actorNameSnapshot" TEXT,
    ADD COLUMN     "actorEmailSnapshot" TEXT,
    ADD COLUMN     "actorRoleSnapshot" TEXT,
    ADD COLUMN     "module" TEXT,
    ADD COLUMN     "resourceNameSnapshot" TEXT,
    ADD COLUMN     "status" "AuditStatus" NOT NULL DEFAULT 'SUCCESS',
    ADD COLUMN     "severity" "AuditSeverity" NOT NULL DEFAULT 'INFO',
    ADD COLUMN     "reason" TEXT,
    ADD COLUMN     "userAgent" TEXT,
    ADD COLUMN     "requestId" TEXT;

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON "audit_logs"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorUserId_createdAt_idx" ON "audit_logs"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_module_idx" ON "audit_logs"("module");

-- CreateIndex
CREATE INDEX "audit_logs_status_idx" ON "audit_logs"("status");

-- CreateIndex
CREATE INDEX "audit_logs_severity_idx" ON "audit_logs"("severity");
