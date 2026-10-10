ALTER TYPE "FundEntryType" ADD VALUE 'PACK_SHOW_REVENUE';

ALTER TABLE "FundEntry" ADD COLUMN "showPackSnapshotId" INTEGER;

CREATE TABLE "ShowPackSnapshot" (
    "id" SERIAL NOT NULL,
    "showVisitId" INTEGER NOT NULL,
    "packProductId" INTEGER NOT NULL,
    "startingPacks" INTEGER NOT NULL,
    "addedPacks" INTEGER NOT NULL DEFAULT 0,
    "giveaways" INTEGER NOT NULL DEFAULT 0,
    "damaged" INTEGER NOT NULL DEFAULT 0,
    "endingPacks" INTEGER,
    "packsSold" INTEGER,
    "declaredValuePerPack" DECIMAL(10,2) NOT NULL,
    "startingCostBasis" DECIMAL(14,2) NOT NULL,
    "startingCostPerPack" DECIMAL(18,6) NOT NULL,
    "addedCostBasis" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "declaredSalesValue" DECIMAL(14,2),
    "estimatedCogs" DECIMAL(14,2),
    "giveawayCostBasis" DECIMAL(14,2),
    "damagedCostBasis" DECIMAL(14,2),
    "actualRevenue" DECIMAL(14,2),
    "actualCashRevenue" DECIMAL(14,2),
    "actualDigitalRevenue" DECIMAL(14,2),
    "actualGrossProfit" DECIMAL(14,2),
    "actualGrossMargin" DECIMAL(12,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finalizedAt" TIMESTAMP(3),
    CONSTRAINT "ShowPackSnapshot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ShowPackSnapshot_quantities_check" CHECK ("startingPacks" >= 0 AND "addedPacks" >= 0 AND "giveaways" >= 0 AND "damaged" >= 0 AND ("endingPacks" IS NULL OR "endingPacks" >= 0) AND ("packsSold" IS NULL OR "packsSold" >= 0)),
    CONSTRAINT "ShowPackSnapshot_values_check" CHECK ("declaredValuePerPack" >= 0 AND "startingCostBasis" >= 0 AND "startingCostPerPack" >= 0 AND "addedCostBasis" >= 0)
);

CREATE TYPE "ShowPackAllocationType" AS ENUM ('STARTING', 'ADDED');

CREATE TABLE "ShowPackPoolAllocation" (
    "id" SERIAL NOT NULL,
    "showPackSnapshotId" INTEGER NOT NULL,
    "packPoolId" INTEGER NOT NULL,
    "type" "ShowPackAllocationType" NOT NULL,
    "quantityAllocated" INTEGER NOT NULL,
    "costBasisAllocated" DECIMAL(14,2) NOT NULL,
    "quantityConsumed" INTEGER NOT NULL DEFAULT 0,
    "costBasisConsumed" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShowPackPoolAllocation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ShowPackPoolAllocation_values_check" CHECK ("quantityAllocated" > 0 AND "costBasisAllocated" >= 0 AND "quantityConsumed" >= 0 AND "quantityConsumed" <= "quantityAllocated" AND "costBasisConsumed" >= 0 AND "costBasisConsumed" <= "costBasisAllocated")
);

CREATE UNIQUE INDEX "ShowPackSnapshot_showVisitId_packProductId_key" ON "ShowPackSnapshot"("showVisitId", "packProductId");
CREATE INDEX "ShowPackSnapshot_packProductId_idx" ON "ShowPackSnapshot"("packProductId");
CREATE INDEX "ShowPackPoolAllocation_showPackSnapshotId_createdAt_idx" ON "ShowPackPoolAllocation"("showPackSnapshotId", "createdAt");
CREATE INDEX "ShowPackPoolAllocation_packPoolId_idx" ON "ShowPackPoolAllocation"("packPoolId");
CREATE INDEX "FundEntry_showPackSnapshotId_idx" ON "FundEntry"("showPackSnapshotId");

ALTER TABLE "ShowPackSnapshot" ADD CONSTRAINT "ShowPackSnapshot_showVisitId_fkey" FOREIGN KEY ("showVisitId") REFERENCES "ShowVisit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShowPackSnapshot" ADD CONSTRAINT "ShowPackSnapshot_packProductId_fkey" FOREIGN KEY ("packProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShowPackPoolAllocation" ADD CONSTRAINT "ShowPackPoolAllocation_showPackSnapshotId_fkey" FOREIGN KEY ("showPackSnapshotId") REFERENCES "ShowPackSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShowPackPoolAllocation" ADD CONSTRAINT "ShowPackPoolAllocation_packPoolId_fkey" FOREIGN KEY ("packPoolId") REFERENCES "PackPool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FundEntry" ADD CONSTRAINT "FundEntry_showPackSnapshotId_fkey" FOREIGN KEY ("showPackSnapshotId") REFERENCES "ShowPackSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
