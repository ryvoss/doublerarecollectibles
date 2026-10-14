-- Existing finalized inventory is historical on-hand stock. Rename its current
-- quantity column to the owned/purchased quantity, then backfill physical
-- received quantity to the same value before new orders begin at zero received.
ALTER TABLE "Order" ADD COLUMN "inTransitAt" TIMESTAMP(3);

ALTER TABLE "InventoryBatch" RENAME COLUMN "quantityReceived" TO "quantityPurchased";
ALTER TABLE "InventoryBatch" ADD COLUMN "quantityReceived" INTEGER;
UPDATE "InventoryBatch" SET "quantityReceived" = "quantityPurchased";
ALTER TABLE "InventoryBatch" ALTER COLUMN "quantityReceived" SET NOT NULL;
ALTER TABLE "InventoryBatch" ALTER COLUMN "quantityReceived" SET DEFAULT 0;

ALTER TABLE "InventoryBatch"
  ADD CONSTRAINT "InventoryBatch_quantityPurchased_check" CHECK ("quantityPurchased" >= 0),
  ADD CONSTRAINT "InventoryBatch_quantityReceived_check" CHECK ("quantityReceived" >= 0 AND "quantityReceived" <= "quantityPurchased"),
  ADD CONSTRAINT "InventoryBatch_consumption_check" CHECK ("quantitySold" + "quantityConverted" <= "quantityReceived");

CREATE TYPE "InventoryReceiptEventType" AS ENUM ('RECEIVED', 'RECLASSIFIED_INBOUND');

CREATE TABLE "InventoryReceiptEvent" (
  "id" SERIAL NOT NULL,
  "inventoryBatchId" INTEGER NOT NULL,
  "type" "InventoryReceiptEventType" NOT NULL,
  "quantityDelta" INTEGER NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryReceiptEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InventoryReceiptEvent_inventoryBatchId_occurredAt_idx"
  ON "InventoryReceiptEvent"("inventoryBatchId", "occurredAt");

ALTER TABLE "InventoryReceiptEvent"
  ADD CONSTRAINT "InventoryReceiptEvent_inventoryBatchId_fkey"
  FOREIGN KEY ("inventoryBatchId") REFERENCES "InventoryBatch"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BusinessPositionSnapshot"
  ADD COLUMN "sealedInventoryOnHandCost" DECIMAL(14,2),
  ADD COLUMN "sealedInventoryInboundCost" DECIMAL(14,2);

UPDATE "BusinessPositionSnapshot"
SET "sealedInventoryOnHandCost" = "sealedInventoryCost",
    "sealedInventoryInboundCost" = 0;

ALTER TABLE "BusinessPositionSnapshot"
  ALTER COLUMN "sealedInventoryOnHandCost" SET NOT NULL,
  ALTER COLUMN "sealedInventoryInboundCost" SET NOT NULL;
