import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeLandedCosts } from "./landedCostAnalysis";

const order = {
  shippingCost: 390, tariffCost: 100, otherCost: 0, adjustment: -165,
  lines: [1090, 1400, 470, 455, 630, 260].map((productCost, index) => ({
    id: index + 1, productCost, sellableQuantity: [20, 20, 20, 20, 40, 45][index],
    landedCost: null, landedUnitCost: null,
  })),
};

test("ORD-0001 quantity and blend estimates reconcile to the order total", () => {
  const quantity = analyzeLandedCosts(order, "QUANTITY");
  const blend = analyzeLandedCosts(order, "BLEND");
  assert.equal(quantity.expectedTotal, 4630);
  assert.equal(quantity.calculatedTotal, 4630);
  assert.equal(blend.calculatedTotal, 4630);
  assert.equal(quantity.reconciled, true);
  assert.equal(blend.reconciled, true);
  assert.deepEqual(quantity.lines.map(line => line.landedUnitCost.toFixed(2)), ["56.04", "71.31", "25.51", "24.77", "17.88", "8.05"]);
  assert.deepEqual(blend.lines.map(line => line.landedUnitCost.toFixed(2)), ["57.33", "73.30", "25.39", "24.62", "17.41", "7.13"]);
});

test("handles one line, zero costs, and a negative adjustment", () => {
  const result = analyzeLandedCosts({
    shippingCost: 0, tariffCost: 0, otherCost: 0, adjustment: -5,
    lines: [{ id: 1, productCost: 25, sellableQuantity: 2, landedCost: 20, landedUnitCost: 10 }],
  }, "QUANTITY");
  assert.equal(result.lines[0].landedCost, 20);
  assert.equal(result.lines[0].landedUnitCost, 10);
  assert.equal(result.reconciled, true);
});

test("stored view uses recorded line and unit costs exactly", () => {
  const result = analyzeLandedCosts({ ...order, lines: [{ id: 1, productCost: 10, sellableQuantity: 3, landedCost: "11.00", landedUnitCost: "3.666667" }] }, "STORED");
  assert.equal(result.lines[0].landedCost, 11);
  assert.equal(result.lines[0].landedUnitCost, 3.666667);
});
