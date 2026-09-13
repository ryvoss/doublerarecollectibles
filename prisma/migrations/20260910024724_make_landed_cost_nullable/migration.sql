-- AlterTable
ALTER TABLE "OrderLine" ALTER COLUMN "landedCost" DROP NOT NULL,
ALTER COLUMN "landedUnitCost" DROP NOT NULL;
