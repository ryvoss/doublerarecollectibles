/*
  Warnings:

  - A unique constraint covering the columns `[orderLineId]` on the table `InventoryBatch` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "InventoryBatch" ALTER COLUMN "landedUnitCost" SET DATA TYPE DECIMAL(14,6);

-- AlterTable
ALTER TABLE "OrderLine" ALTER COLUMN "landedUnitCost" SET DATA TYPE DECIMAL(14,6);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBatch_orderLineId_key" ON "InventoryBatch"("orderLineId");
