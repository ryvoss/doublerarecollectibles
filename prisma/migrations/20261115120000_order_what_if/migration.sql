-- CreateTable
CREATE TABLE "OrderWhatIfScenario" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "supplier" VARCHAR(160),
    "notes" VARCHAR(2000),
    "shippingCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "tariffCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "targetMargin" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderWhatIfScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderWhatIfLine" (
    "id" SERIAL NOT NULL,
    "scenarioId" INTEGER NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "totalProductCost" DECIMAL(10,2) NOT NULL,
    "sellingPriceOverride" DECIMAL(10,2),
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "OrderWhatIfLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderWhatIfScenario_updatedAt_idx" ON "OrderWhatIfScenario"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderWhatIfLine_scenarioId_sortOrder_key" ON "OrderWhatIfLine"("scenarioId", "sortOrder");

-- AddForeignKey
ALTER TABLE "OrderWhatIfLine" ADD CONSTRAINT "OrderWhatIfLine_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "OrderWhatIfScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "OrderWhatIfScenario" ADD CONSTRAINT "OrderWhatIfScenario_costs_check" CHECK ("shippingCost" >= 0 AND "tariffCost" >= 0 AND "targetMargin" > 0 AND "targetMargin" < 100);
ALTER TABLE "OrderWhatIfLine" ADD CONSTRAINT "OrderWhatIfLine_inputs_check" CHECK ("quantity" > 0 AND "quantity" <= 1000000 AND "totalProductCost" >= 0 AND ("sellingPriceOverride" IS NULL OR "sellingPriceOverride" >= 0) AND "sortOrder" >= 0);
