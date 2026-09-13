import { Router } from "express";
import { prisma } from "../prisma";

const router = Router();

// ---------------------------------------------------------
// MONEY HELPERS
// ---------------------------------------------------------

// Converts dollars into whole cents.
// Example: 25.50 becomes 2550.
//
// Doing our allocation math in cents helps avoid common
// floating-point rounding problems with money.
function toCents(value: unknown): number {
  return Math.round(Number(value) * 100);
}

// Converts whole cents back into dollars.
// Example: 2550 becomes 25.50.
function centsToMoney(value: number): string {
  return (value / 100).toFixed(2);
}

// ---------------------------------------------------------
// GET ALL ORDERS
// ---------------------------------------------------------

router.get("/", async (_req, res) => {
  try {
    const orders = await prisma.order.findMany({
      include: {
        lines: true,
      },
      orderBy: {
        orderDate: "desc",
      },
    });

    res.json(orders);
  } catch (error) {
    console.error("Error retrieving orders:", error);

    res.status(500).json({
      error: "Failed to retrieve orders",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// ---------------------------------------------------------
// CREATE ORDER
// ---------------------------------------------------------

router.post("/", async (req, res) => {
  try {
    const {
      orderNumber,
      orderDate,
      shippingCost,
      tariffCost,
      otherCost,
      adjustment,
      notes,
    } = req.body;

    if (!orderNumber || !orderDate) {
      return res.status(400).json({
        error: "orderNumber and orderDate are required",
      });
    }

    const order = await prisma.order.create({
      data: {
        orderNumber,
        orderDate: new Date(orderDate),
        shippingCost: shippingCost ?? 0,
        tariffCost: tariffCost ?? 0,
        otherCost: otherCost ?? 0,
        adjustment: adjustment ?? 0,
        notes: notes ?? null,
      },
    });

    res.status(201).json(order);
  } catch (error) {
    console.error("Error creating order:", error);

    res.status(500).json({
      error: "Failed to create order",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// ---------------------------------------------------------
// ADD LINE TO ORDER
// ---------------------------------------------------------

router.post("/:orderId/lines", async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    if (!Number.isInteger(orderId)) {
  return res.status(400).json({
    error: "orderId must be a valid integer",
  });
}

    const {
      purchasedProductId,
      sellableProductId,
      quantityPurchased,
      productCost,
      sellableQuantity,
    } = req.body;

    // Make sure all required information was provided.
    if (
      !purchasedProductId ||
      !sellableProductId ||
      !quantityPurchased ||
      productCost === undefined ||
      !sellableQuantity
    ) {
      return res.status(400).json({
        error:
          "purchasedProductId, sellableProductId, quantityPurchased, productCost, and sellableQuantity are required",
      });
    }

    // Make sure the order actually exists.
    const order = await prisma.order.findUnique({
      where: {
        id: orderId,
      },
    });

    if (!order) {
      return res.status(404).json({
        error: "Order not found",
      });
    }

    // Finalized orders should never be modified.
    if (order.status !== "DRAFT") {
      return res.status(400).json({
        error: "Only draft orders can be modified",
      });
    }

    const orderLine = await prisma.orderLine.create({
      data: {
        orderId,
        purchasedProductId,
        sellableProductId,
        quantityPurchased,
        productCost,
        sellableQuantity,

        // These remain empty until the entire order is finalized.
        landedCost: null,
        landedUnitCost: null,
      },
      include: {
        purchasedProduct: true,
        sellableProduct: true,
      },
    });

    res.status(201).json(orderLine);
  } catch (error) {
    console.error("Error adding order line:", error);

    res.status(500).json({
      error: "Failed to add order line",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// ---------------------------------------------------------
// FINALIZE ORDER
// ---------------------------------------------------------

router.post("/:orderId/finalize", async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);

    // Make sure the URL contains a real numeric order ID.
    if (!Number.isInteger(orderId)) {
      return res.status(400).json({
        error: "orderId must be a valid integer",
      });
    }

    // Get the order and all of its lines.
    const order = await prisma.order.findUnique({
      where: {
        id: orderId,
      },
      include: {
            lines: {
                 orderBy: {
                 id: "asc",
                },
            },
        },
    });

    if (!order) {
      return res.status(404).json({
        error: "Order not found",
      });
    }

    // A finalized order should never be finalized again.
    if (order.status !== "DRAFT") {
      return res.status(400).json({
        error: "Only draft orders can be finalized",
      });
    }

    // An empty order should never create inventory.
    if (order.lines.length === 0) {
      return res.status(400).json({
        error: "An order must contain at least one line before it can be finalized",
      });
    }

    // ---------------------------------------------------------
    // CALCULATE ORDER TOTALS
    // ---------------------------------------------------------

    const totalProductCostCents = order.lines.reduce(
      (total, line) => total + toCents(line.productCost),
      0
    );

    if (totalProductCostCents <= 0) {
      return res.status(400).json({
        error: "Total product cost must be greater than zero",
      });
    }

    const totalAdditionalCostCents =
      toCents(order.shippingCost) +
      toCents(order.tariffCost) +
      toCents(order.otherCost) +
      toCents(order.adjustment);

    // We keep track of how much additional cost has already
    // been allocated. This lets the final line receive any
    // rounding remainder so every cent is accounted for.
    let allocatedAdditionalCostCents = 0;

    // ---------------------------------------------------------
    // BUILD LANDED COST CALCULATIONS
    // ---------------------------------------------------------

    const calculatedLines = order.lines.map((line, index) => {
  const productCostCents = toCents(line.productCost);

  let allocatedCostCents: number;

  const isLastLine = index === order.lines.length - 1;

  if (isLastLine) {
    // The final line receives the exact remaining cents.
    //
    // Example:
    // Shipping needs to be split into:
    // $3.33
    // $3.33
    // $3.34
    //
    // This guarantees the allocations always add back
    // to the exact order-level additional cost.
    allocatedCostCents =
      totalAdditionalCostCents - allocatedAdditionalCostCents;
  } else {
    const allocationPercent =
      productCostCents / totalProductCostCents;

    allocatedCostCents = Math.round(
      totalAdditionalCostCents * allocationPercent
    );

    allocatedAdditionalCostCents += allocatedCostCents;
  }

  const landedCostCents =
    productCostCents + allocatedCostCents;

  // Store total landed cost to the penny.
  const landedCost = centsToMoney(landedCostCents);

  // Unit cost gets additional decimal precision.
  //
  // We start from landedCostCents rather than the formatted
  // dollar value so we retain the exact line total.
  const landedUnitCost = (
    landedCostCents /
    100 /
    line.sellableQuantity
  ).toFixed(6);

  return {
    line,
    allocatedCost: centsToMoney(allocatedCostCents),
    landedCost,
    landedUnitCost,
  };
});

    // ---------------------------------------------------------
    // SAVE EVERYTHING AS ONE DATABASE TRANSACTION
    // ---------------------------------------------------------

    const finalizedOrder = await prisma.$transaction(async (tx) => {
      for (const calculated of calculatedLines) {
        // Save the finalized landed costs onto the order line.
        await tx.orderLine.update({
          where: {
            id: calculated.line.id,
          },
          data: {
            landedCost: calculated.landedCost,
            landedUnitCost: calculated.landedUnitCost,
          },
        });

        // Every finalized order line creates its own inventory batch.
        await tx.inventoryBatch.create({
          data: {
            orderLineId: calculated.line.id,
            sellableProductId: calculated.line.sellableProductId,
            quantityReceived: calculated.line.sellableQuantity,
            landedCost: calculated.landedCost,
            landedUnitCost: calculated.landedUnitCost,
            quantitySold: 0,
          },
        });
      }

      // Once all lines and inventory batches are successfully created,
      // lock the order by marking it finalized.
      return tx.order.update({
        where: {
          id: orderId,
        },
        data: {
          status: "FINALIZED",
          finalizedAt: new Date(),
        },
        include: {
          lines: {
            include: {
              inventoryBatches: true,
            },
          },
        },
      });
    });

    res.json(finalizedOrder);
  } catch (error) {
    console.error("Error finalizing order:", error);

    res.status(500).json({
      error: "Failed to finalize order",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// ---------------------------------------------------------
// GET ONE ORDER
// ---------------------------------------------------------

router.get("/:orderId", async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);

    if (!Number.isInteger(orderId)) {
      return res.status(400).json({
        error: "orderId must be a valid integer",
      });
    }

    const order = await prisma.order.findUnique({
      where: {
        id: orderId,
      },
      include: {
        lines: {
          include: {
            purchasedProduct: true,
            sellableProduct: true,
            inventoryBatches: true,
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({
        error: "Order not found",
      });
    }

    res.json(order);
  } catch (error) {
    console.error("Error retrieving order:", error);

    res.status(500).json({
      error: "Failed to retrieve order",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;