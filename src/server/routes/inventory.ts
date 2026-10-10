import { Router } from "express";
import { prisma } from "../prisma";
import { allocatedBatchCost, remainingBatchCost, remainingBatchQuantity } from "../services/inventoryCost";

const router = Router();

// ---------------------------------------------------------
// GET INVENTORY SUMMARY
// ---------------------------------------------------------

router.get("/", async (_req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: {
        active: true,
        sellable: true,
      },
      include: {
        inventoryBatches: {
          include: {
            saleAllocations: true,
            packPoolAllocations: true,
          },
        },
        packPoolsAsSource: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    const inventory = products.map((product) => {
      let unitsReceived = 0;
      let unitsSold = 0;
      let unitsConvertedOut = 0;
      let unitsOnHand = 0;
      let inventoryValue = 0;

      for (const batch of product.inventoryBatches) {
        const quantityRemaining = remainingBatchQuantity(batch);

        // Remaining value subtracts both recognized COGS and cost basis
        // transferred into pack inventory.
        const batchRemainingValue = remainingBatchCost(batch);

        unitsReceived += batch.quantityReceived;
        unitsSold += batch.quantitySold;
        unitsConvertedOut += batch.quantityConverted;
        unitsOnHand += quantityRemaining;
        inventoryValue += batchRemainingValue;
      }

      const expectedSalePrice =
        product.expectedSalePrice !== null
          ? Number(product.expectedSalePrice)
          : 0;

      const retailValue =
        unitsOnHand * expectedSalePrice;

      const potentialGrossProfit =
        retailValue - inventoryValue;

      const potentialGrossMargin =
        retailValue > 0
          ? potentialGrossProfit / retailValue
          : 0;

      return {
        productId: product.id,
        itemId: product.itemId,
        productName: product.name,
        productType: product.type,

        unitsReceived,
        unitsSold,
        unitsConvertedOut,
        unitsOnHand,

        inventoryValue: Number(
          inventoryValue.toFixed(2)
        ),

        expectedSalePrice,

        retailValue: Number(
          retailValue.toFixed(2)
        ),

        potentialGrossProfit: Number(
          potentialGrossProfit.toFixed(2)
        ),

        potentialGrossMargin: Number(
          potentialGrossMargin.toFixed(4)
        ),

        batchCount: product.inventoryBatches.length,
        packPoolCount: product.packPoolsAsSource.length,
        unitType: product.unitType,
        packsPerBox: product.packsPerBox,
        packDisplayName: product.packDisplayName,
        defaultPackPrice: product.defaultPackPrice === null ? null : Number(product.defaultPackPrice),
      };
    });

    res.json(inventory);
  } catch (error) {
    console.error("Error retrieving inventory:", error);

    res.status(500).json({
      error: "Failed to retrieve inventory",
      details:
        error instanceof Error
          ? error.message
          : String(error),
    });
  }
});

// ---------------------------------------------------------
// GET INVENTORY DETAIL FOR ONE PRODUCT
// ---------------------------------------------------------

router.get("/:productId", async (req, res) => {
  try {
    const productId = Number(req.params.productId);

    if (!Number.isInteger(productId)) {
      return res.status(400).json({
        error: "productId must be a valid integer",
      });
    }

    const product = await prisma.product.findUnique({
      where: {
        id: productId,
      },
      include: {
        inventoryBatches: {
          include: {
            saleAllocations: true,
            packPoolAllocations: true,

            orderLine: {
              include: {
                order: true,
              },
            },
          },
        },
        packPoolsAsSource: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
      },
    });

    if (!product) {
      return res.status(404).json({
        error: "Product not found",
      });
    }

    // Sort by the actual purchase date rather than the date the
    // inventory batch happened to be entered into the system.
    //
    // If two batches have the same order date, batch ID is used
    // as the tie-breaker.
    product.inventoryBatches.sort((a, b) => {
      const dateDifference =
        a.orderLine.order.orderDate.getTime() -
        b.orderLine.order.orderDate.getTime();

      if (dateDifference !== 0) {
        return dateDifference;
      }

      return a.id - b.id;
    });

    let unitsReceived = 0;
    let unitsSold = 0;
    let unitsConvertedOut = 0;
    let unitsOnHand = 0;
    let inventoryValue = 0;

    const batches = product.inventoryBatches.map((batch) => {
      const quantityRemaining = remainingBatchQuantity(batch);

      // Cost removed through either a sale or a Box-to-Pack transfer.
      const allocatedCost = allocatedBatchCost(batch);

      // Exact historical cost still remaining in inventory.
      const remainingValue = remainingBatchCost(batch);

      unitsReceived += batch.quantityReceived;
      unitsSold += batch.quantitySold;
      unitsConvertedOut += batch.quantityConverted;
      unitsOnHand += quantityRemaining;
      inventoryValue += remainingValue;

      return {
        batchId: batch.id,

        orderId: batch.orderLine.order.id,
        orderNumber: batch.orderLine.order.orderNumber,
        orderDate: batch.orderLine.order.orderDate,

        quantityReceived: batch.quantityReceived,
        quantitySold: batch.quantitySold,
        quantityConverted: batch.quantityConverted,
        quantityRemaining,

        landedCost: Number(batch.landedCost),
        landedUnitCost: Number(batch.landedUnitCost),

        allocatedCost: Number(
          allocatedCost.toFixed(2)
        ),

        remainingValue: Number(
          remainingValue.toFixed(2)
        ),

        createdAt: batch.createdAt,
      };
    });

    const packPools = product.packPoolsAsSource.map(pool => ({
        packPoolId: pool.id,
        packDisplayName: pool.packDisplayName,
        boxesConsumed: pool.boxesConsumed,
        packsCreated: pool.packsCreated,
        packsRemaining: pool.packsRemaining,
        totalCostBasis: Number(pool.totalCostBasis),
        remainingCostBasis: Number(pool.remainingCostBasis),
        costPerPack: Number(pool.costPerPack),
        createdAt: pool.createdAt,
      }));

    const expectedSalePrice =
      product.expectedSalePrice !== null
        ? Number(product.expectedSalePrice)
        : 0;

    const retailValue =
      unitsOnHand * expectedSalePrice;

    const potentialGrossProfit =
      retailValue - inventoryValue;

    const potentialGrossMargin =
      retailValue > 0
        ? potentialGrossProfit / retailValue
        : 0;

    res.json({
      product: {
        id: product.id,
        itemId: product.itemId,
        name: product.name,
        type: product.type,
        expectedSalePrice,
      },

      summary: {
        unitsReceived,
        unitsSold,
        unitsConvertedOut,
        unitsOnHand,

        inventoryValue: Number(
          inventoryValue.toFixed(2)
        ),

        retailValue: Number(
          retailValue.toFixed(2)
        ),

        potentialGrossProfit: Number(
          potentialGrossProfit.toFixed(2)
        ),

        potentialGrossMargin: Number(
          potentialGrossMargin.toFixed(4)
        ),

        batchCount: batches.length,
        packPoolCount: packPools.length,
      },

      batches,
      packPools,
    });
  } catch (error) {
    console.error(
      "Error retrieving inventory detail:",
      error
    );

    res.status(500).json({
      error: "Failed to retrieve inventory detail",
      details:
        error instanceof Error
          ? error.message
          : String(error),
    });
  }
});

export default router;
