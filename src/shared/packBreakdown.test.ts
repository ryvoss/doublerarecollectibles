import assert from "node:assert/strict";
import { test } from "node:test";
import { PackBreakdownPlanError, planPackBreakdown, resolvePackBreakdownConfiguration } from "./packBreakdown";

const batch = (overrides: Partial<Parameters<typeof planPackBreakdown>[0][number]> = {}) => ({
  id: 1,
  orderDate: new Date("2026-01-01T00:00:00Z"),
  quantityReceived: 3,
  quantitySold: 0,
  quantityConverted: 0,
  landedCost: 225.84,
  landedUnitCost: 75.28,
  previouslyAllocatedCost: 0,
  ...overrides,
});

test("uses pack metadata configured directly on the source Box", () => {
  assert.deepEqual(resolvePackBreakdownConfiguration({
    packsPerBox: 18,
    packDisplayName: "Gem 6 Pack",
    defaultPackPrice: "6.00",
  }), {
    packsPerBox: 18,
    packDisplayName: "Gem 6 Pack",
    defaultPackPrice: 6,
    needsSave: false,
  });
});

test("validates and marks first-time Box configuration for saving", () => {
  assert.deepEqual(resolvePackBreakdownConfiguration({
    packsPerBox: null,
    packDisplayName: null,
    defaultPackPrice: null,
  }, {
    packsPerBox: 18,
    packDisplayName: " Gem 6 Pack ",
    defaultPackPrice: 6,
  }), {
    packsPerBox: 18,
    packDisplayName: "Gem 6 Pack",
    defaultPackPrice: 6,
    needsSave: true,
  });
});

test("breaks down a Box without a Pack Product and transfers exact FIFO cost", () => {
  const result = planPackBreakdown([batch()], 1, 18);
  assert.equal(result.packsCreated, 18);
  assert.equal(result.totalCostBasis, "75.28");
  assert.equal(result.costPerPack, "4.182222");
});

test("transfers FIFO cost from multiple Box batches", () => {
  const result = planPackBreakdown([
    batch({ id: 1, quantityReceived: 1, landedCost: 75.28 }),
    batch({ id: 2, orderDate: new Date("2026-02-01T00:00:00Z"), quantityReceived: 2, landedCost: 160, landedUnitCost: 80 }),
  ], 2, 18);
  assert.equal(result.packsCreated, 36);
  assert.equal(result.totalCostBasis, "155.28");
  assert.deepEqual(result.allocations.map(item => item.inventoryBatchId), [1, 2]);
});

test("rejects insufficient Box inventory", () => {
  assert.throws(
    () => planPackBreakdown([batch({ quantityReceived: 2, quantityConverted: 1 })], 2, 18),
    (error: unknown) => error instanceof PackBreakdownPlanError && error.availableBoxes === 1,
  );
});
