import { Router } from "express";
import type { RequestHandler } from "express";
import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../prisma";
import { resolveOrderInventory } from "../../shared/orderConversion";

const router = Router();

class DraftOrderError extends Error {}

// Updating the order row locks it until the transaction completes. Every
// draft mutation uses this gate so it cannot write after finalization.
async function lockDraftOrder(tx: Prisma.TransactionClient, orderId: number) {
  const result = await tx.order.updateMany({
    where: {id: orderId, status: "DRAFT"},
    data: {updatedAt: new Date()},
  });
  if (result.count !== 1) throw new DraftOrderError("Order not found or already finalized. Refresh the order.");
}

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
      orderDate,
      shippingCost,
      tariffCost,
      otherCost,
      adjustment,
      notes,
    } = req.body;

    if (
      typeof orderDate !== "string" ||
      !orderDate.trim() ||
      !Number.isFinite(new Date(orderDate).getTime())
    ) {
      return res.status(400).json({
        error: "A valid orderDate is required",
      });
    }

    const order = await prisma.$transaction(async (tx) => {
      // Only one order-number generator may run at a time. This keeps
      // two nearly simultaneous order creations from receiving the
      // same ORD number. The lock is released automatically when this
      // database transaction finishes.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(246813579)`;

      const existingOrders = await tx.order.findMany({
        where: {
          orderNumber: {
            startsWith: "ORD-",
          },
        },
        select: {
          orderNumber: true,
        },
      });

      // Find the largest existing ORD number instead of relying on the
      // database row ID. This also works if older/manual order numbers
      // exist alongside the new automatic numbering system.
      const highestOrderNumber = existingOrders.reduce(
        (highest, existingOrder) => {
          const match = /^ORD-(\d+)$/.exec(existingOrder.orderNumber);

          if (!match) {
            return highest;
          }

          const numericPart = Number(match[1]);

          return Number.isSafeInteger(numericPart)
            ? Math.max(highest, numericPart)
            : highest;
        },
        0
      );

      const orderNumber = `ORD-${String(highestOrderNumber + 1).padStart(4, "0")}`;

      return tx.order.create({
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

const saveOrderLine: RequestHandler = async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    if (!Number.isInteger(orderId)) {
  return res.status(400).json({
    error: "orderId must be a valid integer",
  });
}

    const {
      purchasedProductId,
      quantityPurchased,
      priceEach,
    } = req.body;

    // Make sure all required information was provided.
    if (
      !Number.isSafeInteger(purchasedProductId) || purchasedProductId <= 0 ||
      !Number.isSafeInteger(quantityPurchased) || quantityPurchased <= 0 ||
      quantityPurchased > 2147483647
    ) {
      return res.status(400).json({
        error:
          "Product ID and purchased quantity must be positive whole numbers",
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

    // New clients send price each; retain total-cost support for older clients.
    // Neither client may override the catalog-derived inventory conversion.
    const submittedCost = priceEach ?? req.body.productCost;
    if ((typeof submittedCost !== "number" && typeof submittedCost !== "string") ||
        String(submittedCost).trim() === "" || !Number.isFinite(Number(submittedCost)) ||
        Number(submittedCost) <= 0) {
      return res.status(400).json({ error: "Purchase price must be greater than zero" });
    }
    const costCents = toCents(submittedCost) * (priceEach !== undefined && priceEach !== null ? quantityPurchased : 1);
    if (!Number.isSafeInteger(costCents) || costCents <= 0 || costCents > 9999999999) {
      return res.status(400).json({ error: "Total product cost is outside the supported range" });
    }
    const catalog = await prisma.product.findMany();
    let inventory;
    try {
      inventory = resolveOrderInventory(catalog, purchasedProductId, quantityPurchased);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid product conversion" });
    }

    const lineId = req.params.lineId === undefined ? null : Number(req.params.lineId);
    if (lineId !== null && (!Number.isSafeInteger(lineId) || lineId <= 0)) {
      return res.status(400).json({error: "Invalid order line ID"});
    }
    const orderLine = await prisma.$transaction(async (tx) => {
      await lockDraftOrder(tx, orderId);
      const data = {
        orderId,
        purchasedProductId,
        sellableProductId: inventory.product.id,
        quantityPurchased,
        productCost: centsToMoney(costCents),
        sellableQuantity: inventory.quantity,

        // These remain empty until the entire order is finalized.
        landedCost: null,
        landedUnitCost: null,
      };
      const include = {
        purchasedProduct: true,
        sellableProduct: true,
      };
      if (lineId === null) return tx.orderLine.create({data, include});
      const existing = await tx.orderLine.findFirst({where: {id: lineId, orderId}});
      if (!existing) throw new DraftOrderError("Order line not found in this order.");
      return tx.orderLine.update({where: {id: lineId}, data, include});
    });

    res.status(lineId === null ? 201 : 200).json(orderLine);
  } catch (error) {
    console.error("Error adding order line:", error);

    res.status(error instanceof DraftOrderError ? 409 : 500).json({
      error: error instanceof DraftOrderError ? error.message : "Failed to save order line",
      details: error instanceof Error ? error.message : String(error),
    });
  }
};

router.post("/:orderId/lines", saveOrderLine);
router.patch("/:orderId/lines/:lineId", saveOrderLine);

router.delete("/:orderId/lines/:lineId", async (req, res) => {
  const orderId = Number(req.params.orderId);
  const lineId = Number(req.params.lineId);
  if (![orderId, lineId].every((id) => Number.isSafeInteger(id) && id > 0)) {
    return res.status(400).json({error: "Invalid order or line ID"});
  }
  try {
    await prisma.$transaction(async (tx) => {
      await lockDraftOrder(tx, orderId);
      const removed = await tx.orderLine.deleteMany({where: {id: lineId, orderId}});
      if (removed.count !== 1) throw new DraftOrderError("Order line not found in this order.");
    });
    res.status(204).send();
  } catch (error) {
    res.status(error instanceof DraftOrderError ? 409 : 500).json({
      error: error instanceof DraftOrderError ? error.message : "Failed to remove order line",
    });
  }
});

router.patch("/:orderId", async (req, res) => {
  const orderId = Number(req.params.orderId);
  const {orderNumber, orderDate, notes} = req.body;
  if (!Number.isSafeInteger(orderId) || orderId <= 0 ||
      typeof orderNumber !== "string" || !orderNumber.trim() ||
      typeof orderDate !== "string" || !orderDate.trim() || !Number.isFinite(new Date(orderDate).getTime()) ||
      (notes != null && typeof notes !== "string")) {
    return res.status(400).json({error: "Valid order number, date, and notes are required"});
  }
  const costs = {shippingCost: "0.00", tariffCost: "0.00", otherCost: "0.00", adjustment: "0.00"};
  for (const key of Object.keys(costs) as (keyof typeof costs)[]) {
    const raw = req.body[key];
    const amount = Number(raw);
    if ((typeof raw !== "number" && typeof raw !== "string") || String(raw).trim() === "" ||
        !Number.isFinite(amount) || Math.abs(amount) > 99999999.99 || (key !== "adjustment" && amount < 0)) {
      return res.status(400).json({error: `Invalid ${key}`});
    }
    costs[key] = centsToMoney(toCents(amount));
  }
  try {
    const order = await prisma.$transaction(async (tx) => {
      await lockDraftOrder(tx, orderId);
      const duplicate = await tx.order.findFirst({where: {orderNumber: orderNumber.trim(), id: {not: orderId}}});
      if (duplicate) throw new DraftOrderError("This order number is already in use.");
      return tx.order.update({where: {id: orderId}, data: {
        orderNumber: orderNumber.trim(), orderDate: new Date(orderDate), notes: notes?.trim() || null, ...costs,
      }, include: {lines: true}});
    });
    res.json(order);
  } catch (error) {
    res.status(error instanceof DraftOrderError ? 409 : 500).json({
      error: error instanceof DraftOrderError ? error.message : "Failed to update order",
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
      const locked = await tx.order.updateMany({
        where: {id: orderId, status: "DRAFT", updatedAt: order.updatedAt},
        data: {updatedAt: new Date()},
      });
      if (locked.count !== 1) throw new DraftOrderError("The order changed. Refresh and review it before finalizing.");
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
        // ---------------------------------------------------------
        // SUBTRACT ORDER COST FROM SEALED FUNDS
        //
        // A finalized order represents money spent by the Sealed
        // side of the business.
        //
        // We subtract the complete order cost:
        // product cost + shipping + tariffs + other + adjustment.
        //
        // This happens inside the same database transaction as the
        // inventory batches and order finalization. If any part fails,
        // the entire operation is rolled back.
        // ---------------------------------------------------------

        const totalOrderCostCents =
          totalProductCostCents +
          totalAdditionalCostCents;

        await tx.fundEntry.create({
          data: {
            source: "SEALED",
            type: "ORDER_PURCHASE",
            amount: centsToMoney(-totalOrderCostCents),
            transactionDate: order.orderDate,
            orderId: order.id,
            note: `Inventory order ${order.orderNumber}`,
          },
        });
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

    res.status(error instanceof DraftOrderError ? 409 : 500).json({
      error: error instanceof DraftOrderError ? error.message : "Failed to finalize order",
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
