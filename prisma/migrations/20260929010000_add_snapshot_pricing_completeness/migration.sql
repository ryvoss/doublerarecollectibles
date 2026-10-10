ALTER TABLE "BusinessPositionSnapshot"
ADD COLUMN "expectedPricingComplete" BOOLEAN,
ADD COLUMN "missingExpectedPriceProducts" INTEGER,
ADD COLUMN "missingExpectedPriceUnits" INTEGER;
