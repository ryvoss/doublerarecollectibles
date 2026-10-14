ALTER TYPE "FundEntryType" ADD VALUE 'ORDER_CORRECTION';

CREATE TABLE "OrderCorrection" (
  "id" SERIAL NOT NULL,
  "orderId" INTEGER NOT NULL,
  "reason" VARCHAR(200) NOT NULL,
  "notes" VARCHAR(2000),
  "oldOrderTotal" DECIMAL(14,2) NOT NULL,
  "newOrderTotal" DECIMAL(14,2) NOT NULL,
  "fundImpact" DECIMAL(14,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderCorrection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderCorrectionChange" (
  "id" SERIAL NOT NULL,
  "orderCorrectionId" INTEGER NOT NULL,
  "orderLineId" INTEGER,
  "field" VARCHAR(40) NOT NULL,
  "oldValue" DECIMAL(18,6) NOT NULL,
  "newValue" DECIMAL(18,6) NOT NULL,
  CONSTRAINT "OrderCorrectionChange_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "FundEntry" ADD COLUMN "orderCorrectionId" INTEGER;

CREATE UNIQUE INDEX "FundEntry_orderCorrectionId_key" ON "FundEntry"("orderCorrectionId");
CREATE INDEX "OrderCorrection_orderId_createdAt_idx" ON "OrderCorrection"("orderId", "createdAt");
CREATE INDEX "OrderCorrectionChange_orderCorrectionId_idx" ON "OrderCorrectionChange"("orderCorrectionId");
CREATE INDEX "OrderCorrectionChange_orderLineId_idx" ON "OrderCorrectionChange"("orderLineId");

ALTER TABLE "OrderCorrection"
  ADD CONSTRAINT "OrderCorrection_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderCorrectionChange"
  ADD CONSTRAINT "OrderCorrectionChange_orderCorrectionId_fkey"
  FOREIGN KEY ("orderCorrectionId") REFERENCES "OrderCorrection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderCorrectionChange"
  ADD CONSTRAINT "OrderCorrectionChange_orderLineId_fkey"
  FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FundEntry"
  ADD CONSTRAINT "FundEntry_orderCorrectionId_fkey"
  FOREIGN KEY ("orderCorrectionId") REFERENCES "OrderCorrection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "prevent_order_correction_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Finalized order correction audit records are immutable';
END;
$$;

CREATE TRIGGER "OrderCorrection_immutable"
  BEFORE UPDATE OR DELETE ON "OrderCorrection"
  FOR EACH ROW EXECUTE FUNCTION "prevent_order_correction_mutation"();

CREATE TRIGGER "OrderCorrectionChange_immutable"
  BEFORE UPDATE OR DELETE ON "OrderCorrectionChange"
  FOR EACH ROW EXECUTE FUNCTION "prevent_order_correction_mutation"();
