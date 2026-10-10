ALTER TABLE "InventoryBatch"
ADD COLUMN "quantityConverted" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "InventoryBatch"
ADD CONSTRAINT "InventoryBatch_quantityConverted_check"
CHECK ("quantityConverted" >= 0 AND "quantitySold" + "quantityConverted" <= "quantityReceived");

CREATE TABLE "PackConversion" (
    "id" SERIAL NOT NULL,
    "sourceBoxProductId" INTEGER NOT NULL,
    "packProductId" INTEGER NOT NULL,
    "packsPerBox" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PackConversion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PackConversion_products_differ_check" CHECK ("sourceBoxProductId" <> "packProductId"),
    CONSTRAINT "PackConversion_packsPerBox_check" CHECK ("packsPerBox" > 0)
);

CREATE TABLE "PackPool" (
    "id" SERIAL NOT NULL,
    "sourceBoxProductId" INTEGER NOT NULL,
    "packProductId" INTEGER NOT NULL,
    "showVisitId" INTEGER,
    "boxesConsumed" INTEGER NOT NULL,
    "packsCreated" INTEGER NOT NULL,
    "packsRemaining" INTEGER NOT NULL,
    "totalCostBasis" DECIMAL(14,2) NOT NULL,
    "remainingCostBasis" DECIMAL(14,2) NOT NULL,
    "costPerPack" DECIMAL(18,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PackPool_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PackPool_quantities_check" CHECK ("boxesConsumed" > 0 AND "packsCreated" > 0 AND "packsRemaining" >= 0 AND "packsRemaining" <= "packsCreated"),
    CONSTRAINT "PackPool_costs_check" CHECK ("totalCostBasis" >= 0 AND "remainingCostBasis" >= 0 AND "remainingCostBasis" <= "totalCostBasis" AND "costPerPack" >= 0)
);

CREATE TABLE "PackPoolSourceAllocation" (
    "id" SERIAL NOT NULL,
    "packPoolId" INTEGER NOT NULL,
    "inventoryBatchId" INTEGER NOT NULL,
    "quantityBoxes" INTEGER NOT NULL,
    "unitCost" DECIMAL(14,6) NOT NULL,
    "totalCost" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PackPoolSourceAllocation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PackPoolSourceAllocation_values_check" CHECK ("quantityBoxes" > 0 AND "unitCost" >= 0 AND "totalCost" >= 0)
);

CREATE UNIQUE INDEX "PackConversion_sourceBoxProductId_key" ON "PackConversion"("sourceBoxProductId");
CREATE INDEX "PackConversion_packProductId_idx" ON "PackConversion"("packProductId");
CREATE INDEX "PackPool_sourceBoxProductId_createdAt_idx" ON "PackPool"("sourceBoxProductId", "createdAt");
CREATE INDEX "PackPool_packProductId_createdAt_idx" ON "PackPool"("packProductId", "createdAt");
CREATE INDEX "PackPool_showVisitId_idx" ON "PackPool"("showVisitId");
CREATE UNIQUE INDEX "PackPoolSourceAllocation_packPoolId_inventoryBatchId_key" ON "PackPoolSourceAllocation"("packPoolId", "inventoryBatchId");
CREATE INDEX "PackPoolSourceAllocation_inventoryBatchId_idx" ON "PackPoolSourceAllocation"("inventoryBatchId");

ALTER TABLE "PackConversion" ADD CONSTRAINT "PackConversion_sourceBoxProductId_fkey" FOREIGN KEY ("sourceBoxProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PackConversion" ADD CONSTRAINT "PackConversion_packProductId_fkey" FOREIGN KEY ("packProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PackPool" ADD CONSTRAINT "PackPool_sourceBoxProductId_fkey" FOREIGN KEY ("sourceBoxProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PackPool" ADD CONSTRAINT "PackPool_packProductId_fkey" FOREIGN KEY ("packProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PackPool" ADD CONSTRAINT "PackPool_showVisitId_fkey" FOREIGN KEY ("showVisitId") REFERENCES "ShowVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PackPoolSourceAllocation" ADD CONSTRAINT "PackPoolSourceAllocation_packPoolId_fkey" FOREIGN KEY ("packPoolId") REFERENCES "PackPool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PackPoolSourceAllocation" ADD CONSTRAINT "PackPoolSourceAllocation_inventoryBatchId_fkey" FOREIGN KEY ("inventoryBatchId") REFERENCES "InventoryBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
