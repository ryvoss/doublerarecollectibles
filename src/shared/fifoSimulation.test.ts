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
