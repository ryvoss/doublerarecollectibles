ALTER TABLE "Product" ADD COLUMN "reorderPoint" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "Product" ADD CONSTRAINT "Product_reorderPoint_check" CHECK ("reorderPoint" >= 0 AND "reorderPoint" <= 1000000);
