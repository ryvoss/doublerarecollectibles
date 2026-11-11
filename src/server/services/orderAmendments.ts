import { createHash } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client";
import { hasDownstreamInventoryConsumption } from "../../shared/orderCorrection";
import { cents, dollars, PurchasingError, supplierIdentity } from "./supplierCredits";

export const amendmentInclude = {
  lines: { include: { inventoryBatches: { include: { saleAllocations: true, packPoolAllocations: true } } }, orderBy: { id: "asc" as const } },
  amendments: true,
} as const;
type AmendmentOrder = Prisma.OrderGetPayload<{ include: typeof amendmentInclude }>;
const costFields = ["shippingCost", "tariffCost", "otherCost", "adjustment"] as const;

export function amendmentPlan(order: AmendmentOrder, body: unknown) {
  if (order.status !== "FINALIZED") throw new PurchasingError("Only finalized orders can be amended.");
  if (!body || typeof body !== "object") throw new PurchasingError("Amendment details are required.");
  const input = body as Record<string, unknown>;
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  if (!reason || reason.length > 200 || notes.length > 2000) throw new PurchasingError("A reason of up to 200 characters and notes of up to 2000 characters are required.");
  if (input.settlementType !== "SUPPLIER_CREDIT" && input.settlementType !== "CASH_REFUND") throw new PurchasingError("Select Supplier Credit or Cash Refund.");
  if (input.settlementType === "SUPPLIER_CREDIT" && !order.supplierName) throw new PurchasingError("Assign the supplier before creating credit.");
  if (!Array.isArray(input.lines) || !input.lines.length) throw new PurchasingError("Enter quantities to cancel.");
  const seen = new Set<number>();
  const changes = input.lines.map((raw: unknown) => {
    if (!raw || typeof raw !== "object") throw new PurchasingError("Invalid cancellation line.");
    const { orderLineId, cancelQuantity } = raw as Record<string, unknown>;
    if (!Number.isSafeInteger(orderLineId) || !Number.isSafeInteger(cancelQuantity) || Number(cancelQuantity) <= 0 || seen.has(Number(orderLineId))) throw new PurchasingError("Cancellation quantities must be positive whole purchased units, with no repeated lines.");
    seen.add(Number(orderLineId));
    const line = order.lines.find(item => item.id === orderLineId);
    if (!line || line.quantityPurchased < Number(cancelQuantity) || line.quantityPurchased <= 0 || line.inventoryBatches.length !== 1) throw new PurchasingError("Cancellation exceeds the current fulfillable quantity.");
    const batch = line.inventoryBatches[0];
    if (hasDownstreamInventoryConsumption(batch)) throw new PurchasingError("Affected inventory has already been sold, converted or consumed by a Show. An advanced reconciliation is required.");
    const newQuantity = line.quantityPurchased - Number(cancelQuantity);
    const newSellableQuantity = newQuantity * (line.sellableQuantity / line.quantityPurchased);
    if (!Number.isSafeInteger(newSellableQuantity) || newSellableQuantity < batch.quantityReceived) throw new PurchasingError("Cancellation cannot reduce inventory below already received quantities.");
    // Retain each line's existing allocation; do not move freight/cost onto other batches.
    const newCost = Math.round(cents(line.landedCost) * newQuantity / line.quantityPurchased);
    const newProductCost = Math.round(cents(line.productCost) * newQuantity / line.quantityPurchased);
    return { orderLineId: line.id, oldQuantity: line.quantityPurchased, newQuantity,
      oldSellableQuantity: line.sellableQuantity, newSellableQuantity,
      oldProductCost: dollars(cents(line.productCost)), newProductCost: dollars(newProductCost),
      oldCost: dollars(cents(line.landedCost)), newCost: dollars(newCost) };
  });
  const oldTotal = order.lines.reduce((sum, line) => sum + cents(line.landedCost), 0);
  const settlement = changes.reduce((sum, change) => sum + cents(change.oldCost) - cents(change.newCost), 0);
  if (settlement <= 0) throw new PurchasingError("Canceled inventory must have positive value.");
  const oldProduct = order.lines.reduce((sum, line) => sum + cents(line.productCost), 0);
  const removedProduct = changes.reduce((sum, change) => sum + cents(change.oldProductCost) - cents(change.newProductCost), 0);
  const oldAdditionalCosts = Object.fromEntries(costFields.map(field => [field, dollars(cents(order[field]))]));
  const newAdditionalCosts = Object.fromEntries(costFields.map(field => [field, dollars(Math.round(cents(order[field]) * (oldProduct - removedProduct) / oldProduct))]));
  // Preserve exact cent reconciliation; rounding residue belongs to adjustment.
  const requiredAdditional = oldTotal - settlement - (oldProduct - removedProduct);
  newAdditionalCosts.adjustment = dollars(requiredAdditional - cents(newAdditionalCosts.shippingCost) - cents(newAdditionalCosts.tariffCost) - cents(newAdditionalCosts.otherCost));
  return { reason, notes: notes || null, settlementType: input.settlementType,
    settlementAmount: dollars(settlement), oldOrderTotal: dollars(oldTotal), newOrderTotal: dollars(oldTotal - settlement),
    oldAdditionalCosts, newAdditionalCosts, changes };
}

export async function amendOrder(tx: Prisma.TransactionClient, orderId: number, body: unknown, preview = false) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(9157, ${orderId})`;
  let order = await tx.order.findUnique({ where: { id: orderId }, include: amendmentInclude });
  if (!order) throw new PurchasingError("Order not found.");
  for (const productId of [...new Set(order.lines.map(line => line.sellableProductId))].sort((a, b) => a - b)) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7431, ${productId})`;
  }
  order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: amendmentInclude });
  const plan = amendmentPlan(order, body);
  const token = createHash("sha256").update(JSON.stringify({ order, plan })).digest("hex");
  if (preview) return { ...plan, token };
  if ((body as Record<string, unknown>).token !== token) throw new PurchasingError("Order or inventory changed. Preview the amendment again before saving.");
  const { changes, ...auditData } = plan;
  const audit = await tx.orderAmendment.create({ data: { ...auditData, orderId, changes: { create: changes } } });
  for (const change of changes) {
    const line = order.lines.find(item => item.id === change.orderLineId)!;
    const unitCost = change.newSellableQuantity ? (Number(change.newCost) / change.newSellableQuantity).toFixed(6) : "0.000000";
    await tx.orderLine.update({ where: { id: line.id }, data: {
      quantityPurchased: change.newQuantity, sellableQuantity: change.newSellableQuantity,
      productCost: change.newProductCost, landedCost: change.newCost, landedUnitCost: unitCost,
    } });
    await tx.inventoryBatch.update({ where: { id: line.inventoryBatches[0].id }, data: {
      quantityPurchased: change.newSellableQuantity, landedCost: change.newCost, landedUnitCost: unitCost,
    } });
  }
  await tx.order.update({ where: { id: orderId }, data: plan.newAdditionalCosts });
  if (plan.settlementType === "SUPPLIER_CREDIT") {
    await tx.supplierCredit.create({ data: { supplierName: supplierIdentity(order.supplierName), sourceOrderId: orderId,
      amendmentId: audit.id, originalAmount: plan.settlementAmount, remainingAmount: plan.settlementAmount,
      reason: plan.reason, notes: plan.notes } });
  } else {
    await tx.fundEntry.create({ data: { source: "SEALED", type: "ORDER_REFUND", amount: plan.settlementAmount,
      transactionDate: new Date(), orderAmendmentId: audit.id, note: `Order refund ${order.orderNumber}: ${plan.reason}` } });
  }
  return { ...plan, amendmentId: audit.id };
}
