-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ImportBatchStatus" ADD VALUE 'STAGING';
ALTER TYPE "ImportBatchStatus" ADD VALUE 'READY_FOR_REVIEW';
ALTER TYPE "ImportBatchStatus" ADD VALUE 'COMMITTING';
ALTER TYPE "ImportBatchStatus" ADD VALUE 'FAILED';

-- AlterEnum
ALTER TYPE "ImportRowStatus" ADD VALUE 'READY';
