import { developmentErrorDetails, logServerError } from "../security/logging";
import { Router } from "express";
import { prisma } from "../prisma";
import {
  allocatedBatchCost,
  inboundBatchQuantity,
  remainingBatchCost,
  remainingBatchQuantity,
  splitRemainingBatchCost,
} from "../services/inventoryCost";

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
      let unitsPurchased = 0;
      let unitsReceived = 0;
      let unitsInbound = 0;
      let unitsSold = 0;
      let unitsConvertedOut = 0;
      let unitsOnHand = 0;
      let inventoryValue = 0;
      let onHandInventoryValue = 0;
      let inboundInventoryValue = 0;

      for (const batch of product.inventoryBatches) {
        const quantityRemaining = remainingBatchQuantity(batch);

        // Remaining value subtracts both recognized COGS and cost basis
        // transferred into pack inventory.
        const batchRemainingValue = remainingBatchCost(batch);
        const splitCost = splitRemainingBatchCost(batch);

        unitsPurchased += batch.quantityPurchased;
        unitsReceived += batch.quantityReceived;
        unitsInbound += inboundBatchQuantity(batch);
        unitsSold += batch.quantitySold;
        unitsConvertedOut += batch.quantityConverted;
        unitsOnHand += quantityRemaining;
        inventoryValue += batchRemainingValue;
        onHandInventoryValue += splitCost.onHandCost;
        inboundInventoryValue += splitCost.inboundCost;
      }

      const expectedSalePrice =
        product.expectedSalePrice !== null
          ? Number(product.expectedSalePrice)
          : 0;

      const retailValue =
        unitsOnHand * expectedSalePrice;

      const potentialGrossProfit =
        retailValue - onHandInventoryValue;

      const potentialGrossMargin =
        retailValue > 0
          ? potentialGrossProfit / retailValue
          : 0;

      return {
        productId: product.id,
        itemId: product.itemId,
        productName: product.name,
        productType: product.type,

        unitsPurchased,
        unitsReceived,
        unitsInbound,
        unitsSold,
        unitsConvertedOut,
        unitsOnHand,

        inventoryValue: Number(
          inventoryValue.toFixed(2)
        ),
        onHandInventoryValue: Number(onHandInventoryValue.toFixed(2)),
        inboundInventoryValue: Number(inboundInventoryValue.toFixed(2)),

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
    logServerError("Error retrieving inventory:", error);

    res.status(500).json({
      error: "Failed to retrieve inventory",
      ...developmentErrorDetails(error),
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
                order: {
                  include: {
                    corrections: {
                      include: { changes: { orderBy: { id: "asc" } } },
                      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                    },
                  },
                },
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

    let unitsPurchased = 0;
    let unitsReceived = 0;
    let unitsInbound = 0;
    let unitsSold = 0;
    let unitsConvertedOut = 0;
    let unitsOnHand = 0;
    let inventoryValue = 0;
    let onHandInventoryValue = 0;
    let inboundInventoryValue = 0;

    const batches = product.inventoryBatches.map((batch) => {
      const quantityRemaining = remainingBatchQuantity(batch);

      // Cost removed through either a sale or a Box-to-Pack transfer.
      const allocatedCost = allocatedBatchCost(batch);

      // Exact historical cost still remaining in inventory.
      const remainingValue = remainingBatchCost(batch);
      const splitCost = splitRemainingBatchCost(batch);

      unitsPurchased += batch.quantityPurchased;
      unitsReceived += batch.quantityReceived;
      unitsInbound += inboundBatchQuantity(batch);
      unitsSold += batch.quantitySold;
      unitsConvertedOut += batch.quantityConverted;
      unitsOnHand += quantityRemaining;
      inventoryValue += remainingValue;
      onHandInventoryValue += splitCost.onHandCost;
      inboundInventoryValue += splitCost.inboundCost;

      return {
        batchId: batch.id,

        orderId: batch.orderLine.order.id,
        orderNumber: batch.orderLine.order.orderNumber,
        orderDate: batch.orderLine.order.orderDate,

        quantityPurchased: batch.quantityPurchased,
        quantityReceived: batch.quantityReceived,
        quantityInbound: inboundBatchQuantity(batch),
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
        onHandValue: Number(splitCost.onHandCost.toFixed(2)),
        inboundValue: Number(splitCost.inboundCost.toFixed(2)),

        correctionCount: batch.orderLine.order.corrections.length,
        corrections: batch.orderLine.order.corrections.map(correction => ({
          id: correction.id,
          reason: correction.reason,
          notes: correction.notes,
          createdAt: correction.createdAt,
          oldOrderTotal: Number(correction.oldOrderTotal),
          newOrderTotal: Number(correction.newOrderTotal),
          changes: correction.changes
            .filter(change => change.orderLineId === null || change.orderLineId === batch.orderLineId)
            .map(change => ({
              id: change.id,
              field: change.field,
              oldValue: Number(change.oldValue),
              newValue: Number(change.newValue),
            })),
        })),

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
        retailValue - onHandInventoryValue;

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
        unitsPurchased,
        unitsReceived,
        unitsInbound,
        unitsSold,
        unitsConvertedOut,
        unitsOnHand,

        inventoryValue: Number(
          inventoryValue.toFixed(2)
        ),
        onHandInventoryValue: Number(onHandInventoryValue.toFixed(2)),
        inboundInventoryValue: Number(inboundInventoryValue.toFixed(2)),

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
    logServerError(
      "Error retrieving inventory detail:",
      error
    );

    res.status(500).json({
      error: "Failed to retrieve inventory detail",
      ...developmentErrorDetails(error),
    });
  }
});

export default router;
