CREATE TABLE "BusinessPositionSnapshot" (
    "id" SERIAL NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalBusinessFunds" DECIMAL(14,2) NOT NULL,
    "sealedFunds" DECIMAL(14,2) NOT NULL,
    "singlesFunds" DECIMAL(14,2) NOT NULL,
    "sealedInventoryCost" DECIMAL(14,2) NOT NULL,
    "singlesInventoryValue" DECIMAL(14,2),
    "totalBusinessValue" DECIMAL(14,2),
    "sealedExpectedRetail" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "BusinessPositionSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BusinessPositionSnapshot_snapshotDate_key" ON "BusinessPositionSnapshot"("snapshotDate");
CREATE INDEX "BusinessPositionSnapshot_snapshotDate_idx" ON "BusinessPositionSnapshot"("snapshotDate");
