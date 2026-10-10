ALTER TABLE "Product"
ADD COLUMN "publicVisible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "publicPrice" DECIMAL(10,2),
ADD COLUMN "featured" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Product_publicVisible_active_sellable_idx"
ON "Product"("publicVisible", "active", "sellable");
