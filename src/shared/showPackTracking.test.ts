import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateShowPackResult, planPackPoolReservations, planShowPackConsumption } from "./showPackTracking";

const pools = [
  { id: 1, createdAt: new Date("2026-01-01"), packsRemaining: 18, remainingCostBasis: 75.28, reservedQuantity: 0, reservedCostBasis: 0 },
  { id: 2, createdAt: new Date("2026-02-01"), packsRemaining: 18, remainingCostBasis: 90, reservedQuantity: 0, reservedCostBasis: 0 },
];

test("starting snapshot reserves all available packs and cost", () => {
  const plan = planPackPoolReservations(pools);
  assert.equal(plan.quantity, 36);
  assert.equal(plan.costBasis, "165.28");
});

test("Show start can allocate only part of available Pack Inventory", () => {
  const plan = planPackPoolReservations(pools, 30);
  assert.equal(plan.availableQuantity, 36);
  assert.equal(plan.quantity, 30);
  assert.equal(plan.reservations.reduce((sum, item) => sum + item.quantity, 0), 30);
  assert.deepEqual(plan.reservations.map(item => item.quantity), [18, 12]);
  assert.equal(plan.costBasis, "135.28");
});

test("packs added during a Show exclude existing reservations", () => {
  const plan = planPackPoolReservations([{ ...pools[0], reservedQuantity: 10, reservedCostBasis: 41.82 }], 8);
  assert.equal(plan.quantity, 8);
  assert.equal(plan.costBasis, "33.46");
});

test("a box broken down during an active Show is reserved as Added inventory", () => {
  const plan = planPackPoolReservations([{ id: 3, createdAt: new Date(), packsRemaining: 18, remainingCostBasis: 75.28, reservedQuantity: 0, reservedCostBasis: 0 }]);
  assert.deepEqual(plan.reservations, [{ packPoolId: 3, quantity: 18, costBasis: "75.28" }]);
});

test("calculates packs sold with giveaways and damaged adjustments", () => {
  const result = calculateShowPackResult({ startingPacks: 36, addedPacks: 18, endingPacks: 20, giveaways: 2, damaged: 1, declaredValuePerPack: 6, actualRevenue: 186, actualCashRevenue: 100, actualDigitalRevenue: 86 });
  assert.equal(result.packsSold, 31);
  assert.equal(result.declaredSalesValue, "186.00");
});

test("rejects a negative sold calculation", () => {
  assert.throws(() => calculateShowPackResult({ startingPacks: 10, addedPacks: 0, endingPacks: 11, giveaways: 0, damaged: 0, declaredValuePerPack: 6, actualRevenue: null, actualCashRevenue: null, actualDigitalRevenue: null }), /cannot be negative/);
});

test("FIFO pack consumption separates sold, giveaway, and damaged cost", () => {
  const result = planShowPackConsumption([
    { id: 1, packPoolId: 1, createdAt: new Date("2026-01-01"), quantityAllocated: 18, costBasisAllocated: 75.28, quantityConsumed: 0, costBasisConsumed: 0 },
    { id: 2, packPoolId: 2, createdAt: new Date("2026-02-01"), quantityAllocated: 18, costBasisAllocated: 90, quantityConsumed: 0, costBasisConsumed: 0 },
  ], { sold: 20, giveaways: 1, damaged: 1 });
  assert.equal(result.estimatedCogs, "85.28");
  assert.equal(result.giveawayCostBasis, "5.00");
  assert.equal(result.damagedCostBasis, "5.00");
  assert.equal(result.poolUpdates.reduce((sum, item) => sum + item.quantityConsumed, 0), 22);
});

test("finalization values preserve blank actual revenue as analytical only", () => {
  const result = calculateShowPackResult({ startingPacks: 18, addedPacks: 0, endingPacks: 10, giveaways: 0, damaged: 0, declaredValuePerPack: 6, actualRevenue: null, actualCashRevenue: null, actualDigitalRevenue: null });
  assert.equal(result.actualRevenue, null);
  assert.equal(result.packsSold, 8);
});
