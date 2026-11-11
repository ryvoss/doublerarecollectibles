import assert from "node:assert/strict";
import { test } from "node:test";
import type { Prisma } from "../../generated/prisma/client";
import { amendmentPlan, amendmentInclude } from "./orderAmendments";
import { parseCreditApplications, supplierIdentity } from "./supplierCredits";
type Order = Prisma.OrderGetPayload<{ include: typeof amendmentInclude }>;
function order() { return { status: "FINALIZED", supplierName: "supplier", shippingCost: 10, tariffCost: 0, otherCost: 0, adjustment: 0, lines: [{ id: 1, quantityPurchased: 10, sellableQuantity: 60, productCost: 100, landedCost: 110, inventoryBatches: [{ quantityReceived: 0, quantitySold: 0, quantityConverted: 0, saleAllocations: [], packPoolAllocations: [] }] }] } as unknown as Order; }
const input = (cancelQuantity: number) => ({ reason: "Unavailable", settlementType: "SUPPLIER_CREDIT", lines: [{ orderLineId: 1, cancelQuantity }] });
test("partial cancellation preserves conversion and allocated landed value", () => { const plan = amendmentPlan(order(), input(4)); assert.equal(plan.settlementAmount, "44.00"); assert.equal(plan.newOrderTotal, "66.00"); assert.equal(plan.changes[0].newSellableQuantity, 36); assert.equal(plan.newAdditionalCosts.shippingCost, "6.00"); });
test("full cancellation zeros inventory and additional costs", () => { const plan = amendmentPlan(order(), input(10)); assert.equal(plan.newOrderTotal, "0.00"); assert.equal(plan.changes[0].newQuantity, 0); assert.equal(plan.newAdditionalCosts.shippingCost, "0.00"); });
test("received quantities and every downstream consumption source block unsafe cancellation", () => {
  for (const patch of [{ quantityReceived: 49 }, { quantitySold: 1 }, { quantityConverted: 1 }, { saleAllocations: [{}] }, { packPoolAllocations: [{}] }]) {
    const current = order(); Object.assign(current.lines[0].inventoryBatches[0], patch); assert.throws(() => amendmentPlan(current, input(2)), /received|consumed/);
  }
});
test("retained received quantity is safe; malformed, duplicate and excess cancellation rejected", () => {
  const current = order(); current.lines[0].inventoryBatches[0].quantityReceived = 48;
  assert.equal(amendmentPlan(current, input(2)).changes[0].newSellableQuantity, 48);
  for (const quantity of [0, -1, 0.5, 11, NaN]) assert.throws(() => amendmentPlan(order(), input(quantity)));
  assert.throws(() => amendmentPlan(order(), { ...input(1), lines: [...input(1).lines, ...input(1).lines] }));
});
test("credit input is exact positive cents, distinct IDs and normalized supplier", () => {
  assert.equal(supplierIdentity("  Supplier   XYZ "), "supplier xyz");
  for (const amount of ["1.001", "-1", "0", "NaN", {}, true]) assert.throws(() => parseCreditApplications([{ supplierCreditId: 1, amountApplied: amount }]));
  assert.throws(() => parseCreditApplications([{ supplierCreditId: 1, amountApplied: "1" }, { supplierCreditId: 1, amountApplied: "1" }]));
});
