import { developmentErrorDetails, logServerError } from "../security/logging";
import { Router } from "express";
import type { RequestHandler } from "express";
import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../prisma";
import { resolveOrderInventory } from "../../shared/orderConversion";
import { analyzeLandedCosts } from "../../shared/landedCostAnalysis";
import {
  buildOrderCorrectionPreview,
  hasDownstreamInventoryConsumption,
  type ProposedOrderCorrection,
} from "../../shared/orderCorrection";
import {
  minimumReceivedForConsumption,
  orderReceivingStatus,
  receivingTotals,
  validateReceiptQuantity,
} from "../../shared/orderReceiving";

const router = Router();

class DraftOrderError extends Error {}

class ReceivingError extends Error {}

class CorrectionError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const orderInclude = {
  lines: {
    include: {
      purchasedProduct: true,
      sellableProduct: true,
      inventoryBatches: {
        include: {
          receiptEvents: { orderBy: { occurredAt: "asc" as const } },
          saleAllocations: { select: { id: true } },
          packPoolAllocations: { select: { id: true } },
        },
      },
    },
    orderBy: { id: "asc" as const },
  },
  corrections: {
    include: {
      changes: { orderBy: { id: "asc" as const } },
      fundEntry: true,
    },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

function withReceivingState<T extends {
  status: string;
  inTransitAt: Date | null;
  lines: Array<{
    sellableQuantity: number;
    inventoryBatches: Array<{
      quantityPurchased: number;
      quantityReceived: number;
    }>;
  }>;
}>(order: T) {
  const quantities = order.lines.map(line => {
    const batch = line.inventoryBatches[0];
    return {
      quantityPurchased: batch?.quantityPurchased ?? line.sellableQuantity,
      quantityReceived: batch?.quantityReceived ?? 0,
    };
  });
  return {
    ...order,
    receivingStatus: orderReceivingStatus({
      finalized: order.status === "FINALIZED",
      inTransitAt: order.inTransitAt,
      lines: quantities,
    }),
    receivingTotals: receivingTotals(quantities),
  };
}

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

function parseCorrectionInput(body: unknown, lineIds: number[]) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new CorrectionError("Correction details are required.");
  }
  const record = body as Record<string, unknown>;
  const allowed = new Set(["reason", "notes", "shippingCost", "tariffCost", "otherCost", "adjustment", "lines"]);
  if (Object.keys(record).some(key => !allowed.has(key))) {
    throw new CorrectionError("Correction details contain an unsupported field.");
  }
  const reason = typeof record.reason === "string" ? record.reason.trim() : "";
  const notes = typeof record.notes === "string" ? record.notes.trim() : "";
  if (!reason || reason.length > 200 || notes.length > 2000) {
    throw new CorrectionError("A correction reason is required and notes must stay within the supported length.");
  }
  const parseAmount = (value: unknown, label: string, allowNegative = false) => {
    if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") {
      throw new CorrectionError(`${label} must be a valid amount.`);
    }
    const amount = Number(value);
    const amountCents = Math.round(amount * 100);
    if (!Number.isFinite(amount) || !Number.isSafeInteger(amountCents) || Math.abs(amountCents) > 9_999_999_999 || (!allowNegative && amountCents < 0)) {
      throw new CorrectionError(`${label} is outside the supported range.`);
    }
    return amountCents / 100;
  };
  if (!Array.isArray(record.lines) || record.lines.length !== lineIds.length) {
    throw new CorrectionError("Every finalized order line must be included exactly once.");
  }
  const lines = record.lines.map(value => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new CorrectionError("Each corrected line must identify an order line and product cost.");
    }
    const line = value as Record<string, unknown>;
    if (Object.keys(line).some(key => key !== "orderLineId" && key !== "productCost")) {
      throw new CorrectionError("A corrected line contains an unsupported field.");
    }
    const orderLineId = Number(line.orderLineId);
    if (!Number.isSafeInteger(orderLineId) || !lineIds.includes(orderLineId)) {
      throw new CorrectionError("A corrected line does not belong to this order.");
    }
    const productCost = parseAmount(line.productCost, "Product cost");
    if (productCost <= 0) throw new CorrectionError("Every product cost must be greater than zero.");
    return { orderLineId, productCost };
  });
  if (new Set(lines.map(line => line.orderLineId)).size !== lineIds.length) {
    throw new CorrectionError("Every finalized order line must be included exactly once.");
  }
  const correction: ProposedOrderCorrection = {
    shippingCost: parseAmount(record.shippingCost, "Shipping"),
    tariffCost: parseAmount(record.tariffCost, "Tariffs"),
    otherCost: parseAmount(record.otherCost, "Other cost"),
    adjustment: parseAmount(record.adjustment, "Adjustment", true),
    lines,
  };
  return { reason, notes: notes || null, correction };
}

function assertOrderCanBeCorrected(order: {
  status: string;
  lines: Array<{
    inventoryBatches: Array<{
      quantitySold: number;
      quantityConverted: number;
      saleAllocations: unknown[];
      packPoolAllocations: unknown[];
    }>;
  }>;
}) {
  if (order.status !== "FINALIZED") throw new CorrectionError("Only finalized orders can be corrected.", 409);
  if (order.lines.some(line => line.inventoryBatches.length !== 1)) {
    throw new CorrectionError("Finalized order inventory is incomplete and cannot use the simple correction workflow.", 409);
  }
  if (order.lines.some(line => hasDownstreamInventoryConsumption(line.inventoryBatches[0]))) {
    throw new CorrectionError(
      "This order cannot be corrected using the simple correction workflow because inventory from it has already been consumed.",
      409,
    );
  }
}

// ---------------------------------------------------------
// GET ALL ORDERS
// ---------------------------------------------------------

router.get("/", async (_req, res) => {
  try {
    const orders = await prisma.order.findMany({
      include: orderInclude,
      orderBy: {
        orderDate: "desc",
      },
    });

    res.json(orders.map(withReceivingState));
  } catch (error) {
    logServerError("Error retrieving orders:", error);

    res.status(500).json({
      error: "Failed to retrieve orders",
      ...developmentErrorDetails(error),
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
    logServerError("Error creating order:", error);

    res.status(500).json({
      error: "Failed to create order",
      ...developmentErrorDetails(error),
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
    logServerError("Error adding order line:", error);

    res.status(error instanceof DraftOrderError ? 409 : 500).json({
      error: error instanceof DraftOrderError ? error.message : "Failed to save order line",
      ...developmentErrorDetails(error),
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
  const { orderDate, notes } = req.body;

  // Order numbers are generated by the server when the order is created.
  // Editing a draft order should never change its order number.
  if (
    !Number.isSafeInteger(orderId) ||
    orderId <= 0 ||
    typeof orderDate !== "string" ||
    !orderDate.trim() ||
    !Number.isFinite(new Date(orderDate).getTime()) ||
    (notes != null && typeof notes !== "string")
  ) {
    return res.status(400).json({
      error: "Valid order date and notes are required",
    });
  }

  const costs = {
    shippingCost: "0.00",
    tariffCost: "0.00",
    otherCost: "0.00",
    adjustment: "0.00",
  };

  for (const key of Object.keys(costs) as (keyof typeof costs)[]) {
    const raw = req.body[key];
    const amount = Number(raw);

    if (
      (typeof raw !== "number" && typeof raw !== "string") ||
      String(raw).trim() === "" ||
      !Number.isFinite(amount) ||
      Math.abs(amount) > 99999999.99 ||
      // Shipping, tariffs, and other costs cannot be negative.
      // Adjustment CAN be negative because it can represent a credit
      // or reduction to the total order cost.
      (key !== "adjustment" && amount < 0)
    ) {
      return res.status(400).json({
        error: `Invalid ${key}`,
      });
    }

    costs[key] = centsToMoney(toCents(amount));
  }

  try {
    const order = await prisma.$transaction(async (tx) => {
      await lockDraftOrder(tx, orderId);

      return tx.order.update({
        where: {
          id: orderId,
        },
        data: {
          orderDate: new Date(orderDate),
          notes: notes?.trim() || null,
          ...costs,
        },
        include: {
          lines: true,
        },
      });
    });

    res.json(order);
  } catch (error) {
    res.status(error instanceof DraftOrderError ? 409 : 500).json({
      error:
        error instanceof DraftOrderError
          ? error.message
          : "Failed to update order",
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

    // ---------------------------------------------------------
    // BUILD LANDED COST CALCULATIONS
    // ---------------------------------------------------------
    const officialAnalysis = analyzeLandedCosts({
      shippingCost: Number(order.shippingCost),
      tariffCost: Number(order.tariffCost),
      otherCost: Number(order.otherCost),
      adjustment: Number(order.adjustment),
      lines: order.lines.map(line => ({
        id: line.id,
        productCost: Number(line.productCost),
        sellableQuantity: line.sellableQuantity,
        landedCost: null,
        landedUnitCost: null,
      })),
    }, "VALUE");

    const calculatedLines = order.lines.map((line, index) => ({
      line,
      landedCost: officialAnalysis.lines[index].landedCost.toFixed(2),
      landedUnitCost: officialAnalysis.lines[index].landedUnitCost.toFixed(6),
    }));

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
            quantityPurchased: calculated.line.sellableQuantity,
            quantityReceived: 0,
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
        include: orderInclude,
      });
    });

    res.json(withReceivingState(finalizedOrder));
  } catch (error) {
    logServerError("Error finalizing order:", error);

    res.status(error instanceof DraftOrderError ? 409 : 500).json({
      error: error instanceof DraftOrderError ? error.message : "Failed to finalize order",
      ...developmentErrorDetails(error),
    });
  }
});

// ---------------------------------------------------------
// PHYSICAL RECEIVING
// ---------------------------------------------------------

router.post("/:orderId/mark-in-transit", async (req, res) => {
  const orderId = Number(req.params.orderId);
  if (!Number.isSafeInteger(orderId) || orderId <= 0) {
    res.status(400).json({ error: "orderId must be a valid integer" });
    return;
  }
  try {
    const updated = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(9157, ${orderId})`;
      let order = await tx.order.findUnique({ where: { id: orderId }, include: orderInclude });
      if (!order) throw new ReceivingError("Order not found.");
      for (const productId of [...new Set(order.lines.map(line => line.sellableProductId))].sort((a, b) => a - b)) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(7431, ${productId})`;
      }
      order = await tx.order.findUnique({ where: { id: orderId }, include: orderInclude });
      if (!order) throw new ReceivingError("Order not found.");
      if (order.status !== "FINALIZED") throw new ReceivingError("Only finalized orders can be marked On the Way.");

      for (const line of order.lines) {
        const batch = line.inventoryBatches[0];
        if (!batch) throw new ReceivingError("Finalized order inventory is incomplete.");
        if (minimumReceivedForConsumption(batch) > 0) {
          throw new ReceivingError(
            `${line.sellableProduct.name} has already been sold or converted and cannot be reclassified as fully inbound.`,
          );
        }
      }

      for (const line of order.lines) {
        const batch = line.inventoryBatches[0];
        if (batch.quantityReceived > 0) {
          await tx.inventoryBatch.update({
            where: { id: batch.id },
            data: { quantityReceived: 0 },
          });
          await tx.inventoryReceiptEvent.create({
            data: {
              inventoryBatchId: batch.id,
              type: "RECLASSIFIED_INBOUND",
              quantityDelta: -batch.quantityReceived,
            },
          });
        }
      }
      await tx.order.update({ where: { id: orderId }, data: { inTransitAt: new Date() } });
      return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
    }, { isolationLevel: "Serializable" });
    res.json(withReceivingState(updated));
  } catch (error) {
    logServerError("Error marking order in transit:", error);
    res.status(error instanceof ReceivingError ? 409 : 500).json({
      error: error instanceof ReceivingError ? error.message : "Order could not be marked On the Way.",
    });
  }
});

router.post("/:orderId/receive", async (req, res) => {
  const orderId = Number(req.params.orderId);
  const submittedLines: unknown = req.body?.lines;
  if (!Number.isSafeInteger(orderId) || orderId <= 0 || !Array.isArray(submittedLines)) {
    res.status(400).json({ error: "A valid order and receipt lines are required." });
    return;
  }
  const receipts = submittedLines.map(value => {
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    return { orderLineId: record.orderLineId, quantity: record.quantity };
  });
  if (receipts.some(receipt => receipt === null || !Number.isSafeInteger(receipt.orderLineId) ||
      Number(receipt.orderLineId) <= 0 || !Number.isSafeInteger(receipt.quantity) || Number(receipt.quantity) < 0)) {
    res.status(400).json({ error: "Receipt quantities must be non-negative whole numbers." });
    return;
  }
  const normalized = receipts as Array<{ orderLineId: number; quantity: number }>;
  if (new Set(normalized.map(line => line.orderLineId)).size !== normalized.length ||
      !normalized.some(line => line.quantity > 0)) {
    res.status(400).json({ error: "Enter at least one quantity to receive and do not repeat order lines." });
    return;
  }

  try {
    const updated = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(9157, ${orderId})`;
      const order = await tx.order.findUnique({ where: { id: orderId }, include: orderInclude });
      if (!order) throw new ReceivingError("Order not found.");
      if (order.status !== "FINALIZED") throw new ReceivingError("Only finalized orders can receive inventory.");

      for (const receipt of normalized) {
        const line = order.lines.find(item => item.id === receipt.orderLineId);
        const batch = line?.inventoryBatches[0];
        if (!line || !batch) throw new ReceivingError("A receipt line does not belong to this order.");
        const validation = validateReceiptQuantity(batch, receipt.quantity);
        if (validation) throw new ReceivingError(`${line.sellableProduct.name}: ${validation}`);
      }

      for (const receipt of normalized) {
        if (receipt.quantity === 0) continue;
        const line = order.lines.find(item => item.id === receipt.orderLineId)!;
        const batch = line.inventoryBatches[0];
        await tx.inventoryBatch.update({
          where: { id: batch.id },
          data: { quantityReceived: { increment: receipt.quantity } },
        });
        await tx.inventoryReceiptEvent.create({
          data: {
            inventoryBatchId: batch.id,
            type: "RECEIVED",
            quantityDelta: receipt.quantity,
          },
        });
      }
      return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
    }, { isolationLevel: "Serializable" });
    res.json(withReceivingState(updated));
  } catch (error) {
    logServerError("Error receiving order inventory:", error);
    res.status(error instanceof ReceivingError ? 409 : 500).json({
      error: error instanceof ReceivingError ? error.message : "Inventory receipt could not be saved.",
    });
  }
});

function correctionPreviewForOrder(order: {
  shippingCost: unknown;
  tariffCost: unknown;
  otherCost: unknown;
  adjustment: unknown;
  lines: Array<{
    id: number;
    productCost: unknown;
    sellableQuantity: number;
    landedCost: unknown;
    landedUnitCost: unknown;
  }>;
}, correction: ProposedOrderCorrection) {
  const preview = buildOrderCorrectionPreview({
    shippingCost: Number(order.shippingCost),
    tariffCost: Number(order.tariffCost),
    otherCost: Number(order.otherCost),
    adjustment: Number(order.adjustment),
    lines: order.lines.map(line => ({
      id: line.id,
      productCost: Number(line.productCost),
      sellableQuantity: line.sellableQuantity,
      landedCost: Number(line.landedCost),
      landedUnitCost: Number(line.landedUnitCost),
    })),
  }, correction);
  if (preview.newOrderTotal <= 0) throw new CorrectionError("Corrected order total must be greater than zero.");
  if (!preview.reconciled) throw new CorrectionError("Corrected landed costs did not reconcile to the order total.");
  return preview;
}

router.post("/:orderId/correction-preview", async (req, res) => {
  const orderId = Number(req.params.orderId);
  if (!Number.isSafeInteger(orderId) || orderId <= 0) {
    res.status(400).json({ error: "orderId must be a valid integer" });
    return;
  }
  try {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
    if (!order) throw new CorrectionError("Order not found.", 404);
    assertOrderCanBeCorrected(order);
    const input = parseCorrectionInput(req.body, order.lines.map(line => line.id));
    res.json({ ...correctionPreviewForOrder(order, input.correction), reason: input.reason, notes: input.notes });
  } catch (error) {
    logServerError("Error previewing finalized order correction:", error);
    res.status(error instanceof CorrectionError ? error.status : 500).json({
      error: error instanceof CorrectionError ? error.message : "Order correction could not be previewed.",
    });
  }
});

router.post("/:orderId/corrections", async (req, res) => {
  const orderId = Number(req.params.orderId);
  if (!Number.isSafeInteger(orderId) || orderId <= 0) {
    res.status(400).json({ error: "orderId must be a valid integer" });
    return;
  }
  try {
    const corrected = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(9158, ${orderId})`;
      let order = await tx.order.findUnique({ where: { id: orderId }, include: orderInclude });
      if (!order) throw new CorrectionError("Order not found.", 404);
      for (const productId of [...new Set(order.lines.map(line => line.sellableProductId))].sort((a, b) => a - b)) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(7431, ${productId})`;
      }
      order = await tx.order.findUnique({ where: { id: orderId }, include: orderInclude });
      if (!order) throw new CorrectionError("Order not found.", 404);
      assertOrderCanBeCorrected(order);
      const input = parseCorrectionInput(req.body, order.lines.map(line => line.id));
      const preview = correctionPreviewForOrder(order, input.correction);
      const proposedByLine = new Map(input.correction.lines.map(line => [line.orderLineId, line.productCost]));
      const changes: Array<{ orderLineId: number | null; field: string; oldValue: string; newValue: string }> = [];
      const addChange = (orderLineId: number | null, field: string, oldValue: number, newValue: number, precision = 2) => {
        const oldFixed = oldValue.toFixed(precision);
        const newFixed = newValue.toFixed(precision);
        if (oldFixed !== newFixed) changes.push({ orderLineId, field, oldValue: oldFixed, newValue: newFixed });
      };
      addChange(null, "SHIPPING_COST", Number(order.shippingCost), input.correction.shippingCost);
      addChange(null, "TARIFF_COST", Number(order.tariffCost), input.correction.tariffCost);
      addChange(null, "OTHER_COST", Number(order.otherCost), input.correction.otherCost);
      addChange(null, "ADJUSTMENT", Number(order.adjustment), input.correction.adjustment);
      for (const line of order.lines) {
        const calculated = preview.lines.find(item => item.orderLineId === line.id)!;
        addChange(line.id, "PRODUCT_COST", Number(line.productCost), proposedByLine.get(line.id)!);
        addChange(line.id, "LANDED_COST", Number(line.landedCost), calculated.newLandedCost);
        addChange(line.id, "LANDED_UNIT_COST", Number(line.landedUnitCost), calculated.newLandedUnitCost, 6);
      }
      if (!changes.length) throw new CorrectionError("Change at least one financial value before saving a correction.");

      const audit = await tx.orderCorrection.create({
        data: {
          orderId,
          reason: input.reason,
          notes: input.notes,
          oldOrderTotal: preview.oldOrderTotal.toFixed(2),
          newOrderTotal: preview.newOrderTotal.toFixed(2),
          fundImpact: preview.fundImpact.toFixed(2),
          changes: { create: changes },
        },
      });
      await tx.order.update({
        where: { id: orderId },
        data: {
          shippingCost: input.correction.shippingCost.toFixed(2),
          tariffCost: input.correction.tariffCost.toFixed(2),
          otherCost: input.correction.otherCost.toFixed(2),
          adjustment: input.correction.adjustment.toFixed(2),
        },
      });
      for (const line of order.lines) {
        const calculated = preview.lines.find(item => item.orderLineId === line.id)!;
        await tx.orderLine.update({
          where: { id: line.id },
          data: {
            productCost: proposedByLine.get(line.id)!.toFixed(2),
            landedCost: calculated.newLandedCost.toFixed(2),
            landedUnitCost: calculated.newLandedUnitCost.toFixed(6),
          },
        });
        await tx.inventoryBatch.update({
          where: { id: line.inventoryBatches[0].id },
          data: {
            landedCost: calculated.newLandedCost.toFixed(2),
            landedUnitCost: calculated.newLandedUnitCost.toFixed(6),
          },
        });
      }
      if (Math.round(preview.fundImpact * 100) !== 0) {
        await tx.fundEntry.create({
          data: {
            source: "SEALED",
            type: "ORDER_CORRECTION",
            amount: preview.fundImpact.toFixed(2),
            transactionDate: new Date(),
            orderCorrectionId: audit.id,
            note: `Order correction ${order.orderNumber}: ${input.reason}`,
          },
        });
      }
      return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
    }, { isolationLevel: "Serializable" });
    res.json(withReceivingState(corrected));
  } catch (error) {
    logServerError("Error correcting finalized order:", error);
    res.status(error instanceof CorrectionError ? error.status : 500).json({
      error: error instanceof CorrectionError ? error.message : "Order correction could not be saved.",
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
      include: orderInclude,
    });

    if (!order) {
      return res.status(404).json({
        error: "Order not found",
      });
    }

    res.json(withReceivingState(order));
  } catch (error) {
    logServerError("Error retrieving order:", error);

    res.status(500).json({
      error: "Failed to retrieve order",
      ...developmentErrorDetails(error),
    });
  }
});


export default router;
