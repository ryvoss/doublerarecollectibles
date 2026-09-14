-- CreateEnum
CREATE TYPE "FundSource" AS ENUM ('SEALED', 'SINGLES');

-- CreateEnum
CREATE TYPE "FundEntryType" AS ENUM ('OPENING_BALANCE', 'SEALED_SALE', 'ORDER_PURCHASE', 'SINGLES_SHOW_GAIN', 'PERSONAL_CONTRIBUTION', 'MANUAL_ADJUSTMENT');

-- CreateTable
CREATE TABLE "FundEntry" (
    "id" SERIAL NOT NULL,
    "source" "FundSource" NOT NULL,
    "type" "FundEntryType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "saleId" INTEGER,
    "orderId" INTEGER,
    "showVisitId" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FundEntry_saleId_key" ON "FundEntry"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "FundEntry_orderId_key" ON "FundEntry"("orderId");

-- CreateIndex
CREATE INDEX "FundEntry_source_transactionDate_idx" ON "FundEntry"("source", "transactionDate");

-- CreateIndex
CREATE INDEX "FundEntry_showVisitId_idx" ON "FundEntry"("showVisitId");

-- AddForeignKey
ALTER TABLE "FundEntry" ADD CONSTRAINT "FundEntry_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundEntry" ADD CONSTRAINT "FundEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundEntry" ADD CONSTRAINT "FundEntry_showVisitId_fkey" FOREIGN KEY ("showVisitId") REFERENCES "ShowVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
