import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateOrderWhatIf, parseOrderWhatIf } from "./orderWhatIf";
const base = { name: "November Supplier Order", supplier: "Supplier", notes: "Planning only", shippingCost: "80", tariffCost: "40", targetMargin: "15", lines: [{ description: "Gem 6 booster box", quantity: 20, totalProductCost: "600", sellingPriceOverride: null }] };
const calculate = (input = base) => calculateOrderWhatIf(parseOrderWhatIf(input));
test("Gem 6 acceptance at 15% and 20% gross margin", () => {
  const result = calculate();
  assert.equal(result.totalProductCost, "600.00"); assert.equal(result.totalAdditionalCost, "120.00"); assert.equal(result.totalCostToDoor, "720.00");
  assert.equal(result.lines[0].productCostPerItem, "30.00000000"); assert.equal(result.lines[0].landedCostPerItem, "36.00000000");
  assert.equal(result.lines[0].recommendedPriceRaw, "42.35294118"); assert.equal(result.lines[0].recommendedPrice, "42.00");
  assert.equal(result.expectedRevenue, "840.00"); assert.equal(result.expectedProfit, "120.00"); assert.equal(result.expectedMargin, "0.14285714");
  const twenty = calculate({ ...base, targetMargin: "20" });
  assert.equal(twenty.lines[0].recommendedPrice, "45.00"); assert.equal(twenty.expectedRevenue, "900.00"); assert.equal(twenty.expectedProfit, "180.00"); assert.equal(twenty.expectedMargin, "0.20000000");
});
test("multiple lines allocate both cost components by value and reconcile all results", () => {
  const result = calculate({ ...base, shippingCost: "80", tariffCost: "40", targetMargin: "20", lines: [
    { ...base.lines[0], quantity: 10, totalProductCost: "200" }, { ...base.lines[0], quantity: 20, totalProductCost: "600" },
  ] });
  assert.deepEqual(result.lines.map(line => line.allocationWeight), ["0.25000000", "0.75000000"]);
  assert.deepEqual(result.lines.map(line => line.allocatedShipping), ["20.00", "60.00"]);
  assert.deepEqual(result.lines.map(line => line.allocatedTariff), ["10.00", "30.00"]);
  assert.deepEqual(result.lines.map(line => line.landedCost), ["230.00", "690.00"]);
  assert.deepEqual(result.lines.map(line => line.recommendedPrice), ["29.00", "43.00"]);
  assert.equal(result.totalCostToDoor, "920.00"); assert.equal(result.expectedRevenue, "1150.00"); assert.equal(result.expectedProfit, "230.00");
  assert.equal(result.lines.reduce((sum, line) => sum + Number(line.expectedProfit), 0), Number(result.expectedProfit));
});
test("fractional-cent allocation uses stable largest remainder and never allocates to free items", () => {
  const result = calculate({ ...base, shippingCost: "0.01", tariffCost: "0.02", lines: [1, 1, 1, 0].map(value => ({ ...base.lines[0], quantity: 1, totalProductCost: String(value) })) });
  assert.deepEqual(result.lines.map(line => line.allocatedShipping), ["0.01", "0.00", "0.00", "0.00"]);
  assert.deepEqual(result.lines.map(line => line.allocatedTariff), ["0.01", "0.01", "0.00", "0.00"]);
  assert.equal(result.totalCostToDoor, "3.03");
});
test("recommendation rounds nearest whole dollar including a half-dollar tie", () => {
  for (const [cost, expected] of [["35.68", "45.00"], ["34.00", "43.00"], ["33.88", "42.00"]]) {
    const result = calculate({ ...base, shippingCost: "0", tariffCost: "0", targetMargin: "20", lines: [{ ...base.lines[0], quantity: 1, totalProductCost: cost }] });
    assert.equal(result.lines[0].recommendedPrice, expected);
  }
});
test("override controls revenue/profit/margin, survives new assumptions, reset uses recommendation", () => {
  const input = parseOrderWhatIf({ ...base, targetMargin: "20", lines: [{ ...base.lines[0], sellingPriceOverride: "40.50" }] });
  const result = calculateOrderWhatIf(input); assert.equal(result.lines[0].recommendedPrice, "45.00"); assert.equal(result.expectedRevenue, "810.00"); assert.equal(result.expectedProfit, "90.00"); assert.equal(result.expectedMargin, "0.11111111");
  assert.equal(calculateOrderWhatIf({ ...input, targetMargin: "25.50" }).expectedRevenue, "810.00");
  input.lines[0].sellingPriceOverride = null; assert.equal(calculateOrderWhatIf(input).expectedRevenue, "900.00");
});
test("custom margin, zero costs, zero revenue and losses have defined results", () => {
  assert.equal(calculate({ ...base, targetMargin: "17.25" }).lines[0].recommendedPrice, "44.00");
  const free = calculate({ ...base, shippingCost: "0", tariffCost: "0", lines: [{ ...base.lines[0], totalProductCost: "0" }] });
  assert.equal(free.expectedProfit, "0.00"); assert.equal(free.expectedMargin, null);
  const loss = calculateOrderWhatIf(parseOrderWhatIf({ ...base, lines: [{ ...base.lines[0], sellingPriceOverride: "0" }] }));
  assert.equal(loss.expectedRevenue, "0.00"); assert.equal(loss.expectedProfit, "-720.00"); assert.equal(loss.expectedMargin, null);
  assert.throws(() => parseOrderWhatIf({ ...base, lines: [{ ...base.lines[0], totalProductCost: "0" }] }), /positive product cost/);
});
test("strict validation rejects bad costs, quantities, text, margins and unknown fields", () => {
  for (const patch of [{ name: "" }, { name: "x".repeat(101) }, { supplier: "x".repeat(161) }, { notes: "x".repeat(2001) }, { shippingCost: -1 }, { tariffCost: "1.001" }, { shippingCost: true }, { targetMargin: "0" }, { targetMargin: "100" }, { targetMargin: "NaN" }, { targetMargin: "15.123" }, { lines: [] }, { lines: Array(101).fill(base.lines[0]) }, { orderId: 5 }, { expectedProfit: 999 }]) assert.throws(() => parseOrderWhatIf({ ...base, ...patch }));
  for (const patch of [{ quantity: 0 }, { quantity: 1.5 }, { quantity: "20" }, { quantity: 1000001 }, { description: "" }, { description: "x".repeat(201) }, { totalProductCost: "-1" }, { totalProductCost: "100000000" }, { sellingPriceOverride: -1 }, { sellingPriceOverride: "1.001" }, { productId: 1 }]) assert.throws(() => parseOrderWhatIf({ ...base, lines: [{ ...base.lines[0], ...patch }] }));
  assert.equal(parseOrderWhatIf({ ...base, supplier: "  Acme  " }).supplier, "Acme");
});
test("large projections retain exact cents beyond Number safe integer range", () => {
  const result = calculate({ ...base, shippingCost: "99999999.99", tariffCost: "99999999.99", targetMargin: "99.99", lines: Array.from({ length: 100 }, () => ({ ...base.lines[0], quantity: 1, totalProductCost: "99999999.99" })) });
  assert.equal(result.totalCostToDoor, "10199999998.98");
  const total = result.lines.reduce((sum, line) => sum + BigInt(line.expectedRevenue.replace(".", "")), 0n);
  assert.equal(total, BigInt(result.expectedRevenue.replace(".", "")));
});
