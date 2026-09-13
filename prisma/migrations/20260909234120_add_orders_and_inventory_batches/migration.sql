-- CreateTable
CREATE TABLE "Order" (
    "id" SERIAL NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "supplierName" TEXT,
    "shippingCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "tariffCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "otherCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "adjustment" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "purchasedProductId" INTEGER NOT NULL,
    "sellableProductId" INTEGER NOT NULL,
    "quantityPurchased" INTEGER NOT NULL,
    "productCost" DECIMAL(10,2) NOT NULL,
    "sellableQuantity" INTEGER NOT NULL,
    "landedCost" DECIMAL(10,2) NOT NULL,
    "landedUnitCost" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBatch" (
    "id" SERIAL NOT NULL,
    "orderLineId" INTEGER NOT NULL,
    "sellableProductId" INTEGER NOT NULL,
    "quantityReceived" INTEGER NOT NULL,
    "landedCost" DECIMAL(10,2) NOT NULL,
    "landedUnitCost" DECIMAL(10,2) NOT NULL,
    "quantitySold" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_purchasedProductId_fkey" FOREIGN KEY ("purchasedProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_sellableProductId_fkey" FOREIGN KEY ("sellableProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_sellableProductId_fkey" FOREIGN KEY ("sellableProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
