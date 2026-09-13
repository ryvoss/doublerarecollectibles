import { Router } from "express";
import { prisma } from "../prisma";

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
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    const inventory = products.map((product) => {
      let unitsReceived = 0;
      let unitsSold = 0;
      let unitsOnHand = 0;
      let inventoryValue = 0;

      for (const batch of product.inventoryBatches) {
        const quantityRemaining =
          batch.quantityReceived - batch.quantitySold;

        // Total cost already recognized as COGS from this batch.
        const allocatedCost =
          batch.saleAllocations.reduce(
            (total, allocation) =>
              total + Number(allocation.totalCost),
            0
          );

        // Remaining inventory value is based on the exact historical
        // landed cost minus COGS already allocated from the batch.
        const batchRemainingValue =
          Number(batch.landedCost) - allocatedCost;

        unitsReceived += batch.quantityReceived;
        unitsSold += batch.quantitySold;
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

            orderLine: {
              include: {
                order: true,
              },
            },
          },
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
    let unitsOnHand = 0;
    let inventoryValue = 0;

    const batches = product.inventoryBatches.map((batch) => {
      const quantityRemaining =
        batch.quantityReceived - batch.quantitySold;

      // Total cost already recognized as COGS from this batch.
      const allocatedCost =
        batch.saleAllocations.reduce(
          (total, allocation) =>
            total + Number(allocation.totalCost),
          0
        );

      // Exact historical cost still remaining in inventory.
      const remainingValue =
        Number(batch.landedCost) - allocatedCost;

      unitsReceived += batch.quantityReceived;
      unitsSold += batch.quantitySold;
      unitsOnHand += quantityRemaining;
      inventoryValue += remainingValue;

      return {
        batchId: batch.id,

        orderId: batch.orderLine.order.id,
        orderNumber: batch.orderLine.order.orderNumber,
        orderDate: batch.orderLine.order.orderDate,

        quantityReceived: batch.quantityReceived,
        quantitySold: batch.quantitySold,
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
      },

      batches,
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