import assert from "node:assert/strict";
import { test } from "node:test";
import { simulateFifoConsumption } from "./fifoSimulation";

test("simulates FIFO by order date and reconciles a fully consumed batch", () => {
  const result = simulateFifoConsumption([
    { id: 2, orderDate: new Date("2026-02-01"), quantityReceived: 3, quantitySold: 0, landedCost: 21, landedUnitCost: 7, previouslyAllocatedCost: 0 },
    { id: 1, orderDate: new Date("2026-01-01"), quantityReceived: 4, quantitySold: 2, landedCost: 20, landedUnitCost: 5, previouslyAllocatedCost: 10 },
  ], 3);
  assert.equal(result.fulfilled, true);
  assert.equal(result.cogs, "17.00");
  assert.deepEqual(result.allocations.map(item => [item.inventoryBatchId, item.quantity]), [[1, 2], [2, 1]]);
});

test("inbound units are unavailable and do not force premature cost reconciliation", () => {
  const inboundOnly = simulateFifoConsumption([{
    id: 1,
    orderDate: new Date("2026-01-01"),
    quantityPurchased: 5,
    quantityReceived: 0,
    quantitySold: 0,
    landedCost: 50,
    landedUnitCost: 10,
    previouslyAllocatedCost: 0,
  }], 1);
  assert.equal(inboundOnly.availableQuantity, 0);
  assert.equal(inboundOnly.fulfilled, false);

  const partialReceipt = simulateFifoConsumption([{
    id: 1,
    orderDate: new Date("2026-01-01"),
    quantityPurchased: 5,
    quantityReceived: 2,
    quantitySold: 0,
    landedCost: 50,
    landedUnitCost: 10,
    previouslyAllocatedCost: 0,
  }], 2);
  assert.equal(partialReceipt.cogs, "20.00");
});
