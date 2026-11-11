-- AlterEnum
ALTER TYPE "FundEntryType" ADD VALUE 'ORDER_REFUND';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "supplierName" VARCHAR(160);

-- AlterTable
ALTER TABLE "FundEntry" ADD COLUMN     "orderAmendmentId" INTEGER;

-- AlterTable
ALTER TABLE "BusinessPositionSnapshot" ADD COLUMN     "supplierCreditBalance" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "OrderAmendment" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "reason" VARCHAR(200) NOT NULL,
    "notes" VARCHAR(2000),
    "settlementType" VARCHAR(20) NOT NULL,
    "settlementAmount" DECIMAL(14,2) NOT NULL,
    "oldOrderTotal" DECIMAL(14,2) NOT NULL,
    "newOrderTotal" DECIMAL(14,2) NOT NULL,
    "oldAdditionalCosts" JSONB NOT NULL,
    "newAdditionalCosts" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderAmendment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderAmendmentChange" (
    "id" SERIAL NOT NULL,
    "amendmentId" INTEGER NOT NULL,
    "orderLineId" INTEGER NOT NULL,
    "oldQuantity" INTEGER NOT NULL,
    "newQuantity" INTEGER NOT NULL,
    "oldSellableQuantity" INTEGER NOT NULL,
    "newSellableQuantity" INTEGER NOT NULL,
    "oldProductCost" DECIMAL(14,2) NOT NULL,
    "newProductCost" DECIMAL(14,2) NOT NULL,
    "oldCost" DECIMAL(14,2) NOT NULL,
    "newCost" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "OrderAmendmentChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierCredit" (
    "id" SERIAL NOT NULL,
    "supplierName" VARCHAR(160) NOT NULL,
    "sourceOrderId" INTEGER NOT NULL,
    "amendmentId" INTEGER NOT NULL,
    "originalAmount" DECIMAL(14,2) NOT NULL,
    "remainingAmount" DECIMAL(14,2) NOT NULL,
    "reason" VARCHAR(200) NOT NULL,
    "notes" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierCreditApplication" (
    "id" SERIAL NOT NULL,
    "supplierCreditId" INTEGER NOT NULL,
    "orderId" INTEGER NOT NULL,
    "amountApplied" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierCreditApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderAmendment_orderId_createdAt_idx" ON "OrderAmendment"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderAmendmentChange_amendmentId_idx" ON "OrderAmendmentChange"("amendmentId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierCredit_amendmentId_key" ON "SupplierCredit"("amendmentId");

-- CreateIndex
CREATE INDEX "SupplierCredit_supplierName_idx" ON "SupplierCredit"("supplierName");

-- CreateIndex
CREATE INDEX "SupplierCreditApplication_orderId_idx" ON "SupplierCreditApplication"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierCreditApplication_supplierCreditId_orderId_key" ON "SupplierCreditApplication"("supplierCreditId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "FundEntry_orderAmendmentId_key" ON "FundEntry"("orderAmendmentId");

-- AddForeignKey
ALTER TABLE "FundEntry" ADD CONSTRAINT "FundEntry_orderAmendmentId_fkey" FOREIGN KEY ("orderAmendmentId") REFERENCES "OrderAmendment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAmendment" ADD CONSTRAINT "OrderAmendment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAmendmentChange" ADD CONSTRAINT "OrderAmendmentChange_amendmentId_fkey" FOREIGN KEY ("amendmentId") REFERENCES "OrderAmendment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAmendmentChange" ADD CONSTRAINT "OrderAmendmentChange_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCredit" ADD CONSTRAINT "SupplierCredit_sourceOrderId_fkey" FOREIGN KEY ("sourceOrderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCredit" ADD CONSTRAINT "SupplierCredit_amendmentId_fkey" FOREIGN KEY ("amendmentId") REFERENCES "OrderAmendment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCreditApplication" ADD CONSTRAINT "SupplierCreditApplication_supplierCreditId_fkey" FOREIGN KEY ("supplierCreditId") REFERENCES "SupplierCredit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCreditApplication" ADD CONSTRAINT "SupplierCreditApplication_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "SupplierCredit" ADD CONSTRAINT "SupplierCredit_balance_check"
CHECK ("originalAmount" > 0 AND "remainingAmount" >= 0 AND "remainingAmount" <= "originalAmount");
ALTER TABLE "SupplierCreditApplication" ADD CONSTRAINT "SupplierCreditApplication_amount_check" CHECK ("amountApplied" > 0);
ALTER TABLE "OrderAmendment" ADD CONSTRAINT "OrderAmendment_settlement_check"
CHECK ("settlementType" IN ('SUPPLIER_CREDIT', 'CASH_REFUND') AND "settlementAmount" > 0 AND "oldOrderTotal" - "newOrderTotal" = "settlementAmount");
ALTER TABLE "OrderAmendmentChange" ADD CONSTRAINT "OrderAmendmentChange_quantity_check"
CHECK ("newQuantity" >= 0 AND "newQuantity" < "oldQuantity" AND "newSellableQuantity" >= 0 AND "newSellableQuantity" < "oldSellableQuantity");
CREATE FUNCTION purchasing_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Purchasing history is append-only'; END;
$$;
CREATE TRIGGER amendment_immutable BEFORE UPDATE OR DELETE ON "OrderAmendment" FOR EACH ROW EXECUTE FUNCTION purchasing_history_immutable();
CREATE TRIGGER amendment_change_immutable BEFORE UPDATE OR DELETE ON "OrderAmendmentChange" FOR EACH ROW EXECUTE FUNCTION purchasing_history_immutable();
CREATE TRIGGER credit_application_immutable BEFORE UPDATE OR DELETE ON "SupplierCreditApplication" FOR EACH ROW EXECUTE FUNCTION purchasing_history_immutable();
CREATE FUNCTION supplier_credit_preserve_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Supplier credits cannot be deleted'; END IF;
  IF (to_jsonb(NEW) - 'remainingAmount') IS DISTINCT FROM (to_jsonb(OLD) - 'remainingAmount') THEN
    RAISE EXCEPTION 'Supplier credit source is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER supplier_credit_source_immutable BEFORE UPDATE OR DELETE ON "SupplierCredit" FOR EACH ROW EXECUTE FUNCTION supplier_credit_preserve_source();
