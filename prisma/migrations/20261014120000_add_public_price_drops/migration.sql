ALTER TABLE "Product"
  ADD COLUMN "compareAtPrice" DECIMAL(10,2),
  ADD COLUMN "priceUpdatedAt" TIMESTAMP(3);

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_compareAtPrice_check"
  CHECK ("compareAtPrice" IS NULL OR "compareAtPrice" >= 0);

-- Preserve customized Site Manager copy while updating the original default.
UPDATE "SiteSettings"
SET "featuredSectionTitle" = 'Featured & Recent Drops'
WHERE LOWER(BTRIM("featuredSectionTitle")) = 'featured inventory';
