-- CreateEnum
CREATE TYPE "ProductUnitType" AS ENUM ('CASE', 'BOX', 'ITEM');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "unitType" "ProductUnitType" NOT NULL DEFAULT 'BOX';
