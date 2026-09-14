-- CreateEnum
CREATE TYPE "FundLocation" AS ENUM ('CASH', 'DIGITAL');

-- AlterTable
ALTER TABLE "FundEntry" ADD COLUMN     "location" "FundLocation";

-- CreateIndex
CREATE INDEX "FundEntry_source_location_idx" ON "FundEntry"("source", "location");
