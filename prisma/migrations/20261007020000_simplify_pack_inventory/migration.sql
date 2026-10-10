-- Packs are derived inventory. Move configuration onto the source Box Product
-- and remove the catalog Product dependency from PackPools and Show snapshots.
ALTER TABLE "Product"
  ADD COLUMN "packsPerBox" INTEGER,
  ADD COLUMN "packDisplayName" TEXT,
  ADD COLUMN "defaultPackPrice" DECIMAL(10,2);

-- Preserve any pre-existing configuration if this migration is applied to an
-- environment where a mapping was created before the simplified model shipped.
UPDATE "Product" AS source
SET
  "packsPerBox" = conversion."packsPerBox",
  "packDisplayName" = pack_product."name",
  "defaultPackPrice" = pack_product."expectedSalePrice"
FROM "PackConversion" AS conversion
JOIN "Product" AS pack_product ON pack_product."id" = conversion."packProductId"
WHERE source."id" = conversion."sourceBoxProductId";

ALTER TABLE "PackPool" ADD COLUMN "packDisplayName" TEXT;
UPDATE "PackPool" AS pool
SET "packDisplayName" = pack_product."name"
FROM "Product" AS pack_product
WHERE pack_product."id" = pool."packProductId";
ALTER TABLE "PackPool" ALTER COLUMN "packDisplayName" SET NOT NULL;

ALTER TABLE "ShowPackSnapshot"
  ADD COLUMN "sourceBoxProductId" INTEGER,
  ADD COLUMN "packDisplayName" TEXT;

UPDATE "ShowPackSnapshot" AS snapshot
SET
  "sourceBoxProductId" = COALESCE(
    (
      SELECT pool."sourceBoxProductId"
      FROM "ShowPackPoolAllocation" AS allocation
      JOIN "PackPool" AS pool ON pool."id" = allocation."packPoolId"
      WHERE allocation."showPackSnapshotId" = snapshot."id"
      ORDER BY allocation."createdAt", allocation."id"
      LIMIT 1
    ),
    (
      SELECT conversion."sourceBoxProductId"
      FROM "PackConversion" AS conversion
      WHERE conversion."packProductId" = snapshot."packProductId"
      ORDER BY conversion."id"
      LIMIT 1
    )
  ),
  "packDisplayName" = (
    SELECT pack_product."name"
    FROM "Product" AS pack_product
    WHERE pack_product."id" = snapshot."packProductId"
  );

ALTER TABLE "ShowPackSnapshot"
  ALTER COLUMN "sourceBoxProductId" SET NOT NULL,
  ALTER COLUMN "packDisplayName" SET NOT NULL;

ALTER TABLE "PackPool" DROP CONSTRAINT "PackPool_packProductId_fkey";
ALTER TABLE "ShowPackSnapshot" DROP CONSTRAINT "ShowPackSnapshot_packProductId_fkey";
DROP INDEX "PackPool_packProductId_createdAt_idx";
DROP INDEX "ShowPackSnapshot_showVisitId_packProductId_key";
DROP INDEX "ShowPackSnapshot_packProductId_idx";

ALTER TABLE "PackPool" DROP COLUMN "packProductId";
ALTER TABLE "ShowPackSnapshot" DROP COLUMN "packProductId";
DROP TABLE "PackConversion";

CREATE INDEX "ShowPackSnapshot_sourceBoxProductId_idx" ON "ShowPackSnapshot"("sourceBoxProductId");
CREATE UNIQUE INDEX "ShowPackSnapshot_showVisitId_sourceBoxProductId_key"
  ON "ShowPackSnapshot"("showVisitId", "sourceBoxProductId");

ALTER TABLE "ShowPackSnapshot"
  ADD CONSTRAINT "ShowPackSnapshot_sourceBoxProductId_fkey"
  FOREIGN KEY ("sourceBoxProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
