-- CreateEnum
CREATE TYPE "ShowVisitStatus" AS ENUM ('PLANNED', 'ACTIVE', 'FINALIZED');

-- AlterTable
ALTER TABLE "ShowVisit" ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "status" "ShowVisitStatus" NOT NULL DEFAULT 'PLANNED';

-- CreateIndex
CREATE INDEX "ShowVisit_status_idx" ON "ShowVisit"("status");
