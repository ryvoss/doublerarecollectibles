ALTER TYPE "FundEntryType" ADD VALUE 'BUSINESS_EXPENSE';
CREATE TABLE "BusinessExpense" (
 "id" SERIAL PRIMARY KEY, "date" DATE NOT NULL, "description" VARCHAR(200) NOT NULL,
 "category" VARCHAR(40) NOT NULL, "amount" DECIMAL(14,2) NOT NULL CHECK ("amount" > 0),
 "paidFrom" VARCHAR(30) NOT NULL CHECK ("paidFrom" IN ('SEALED','SINGLES_CASH','SINGLES_DIGITAL')),
 "version" INTEGER NOT NULL DEFAULT 1, "voidedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "BusinessExpense_date_idx" ON "BusinessExpense"("date");
CREATE TABLE "BusinessExpenseRevision" (
 "id" SERIAL PRIMARY KEY, "expenseId" INTEGER NOT NULL REFERENCES "BusinessExpense"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "action" VARCHAR(10) NOT NULL, "facts" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "BusinessExpenseRevision_expenseId_createdAt_idx" ON "BusinessExpenseRevision"("expenseId", "createdAt");
ALTER TABLE "FundEntry" ADD COLUMN "businessExpenseId" INTEGER REFERENCES "BusinessExpense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "FundEntry_businessExpenseId_idx" ON "FundEntry"("businessExpenseId");
