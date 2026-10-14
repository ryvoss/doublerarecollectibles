import assert from "node:assert/strict";
import test from "node:test";
import { remainingBatchCost, remainingBatchQuantity, splitRemainingBatchCost } from "./inventoryCost";

const base = {
  quantityPurchased: 10,
  quantityReceived: 0,
  quantitySold: 0,
  quantityConverted: 0,
  landedCost: 123.45,
  landedUnitCost: 12.345,
  saleAllocations: [],
  packPoolAllocations: [],
};

test("delivery reclassifies cost without changing total owned inventory value", () => {
  const inbound = splitRemainingBatchCost(base);
  const partial = splitRemainingBatchCost({ ...base, quantityReceived: 4 });
  const delivered = splitRemainingBatchCost({ ...base, quantityReceived: 10 });
  assert.deepEqual(inbound, { onHandCost: 0, inboundCost: 123.45 });
  assert.equal(partial.onHandCost + partial.inboundCost, remainingBatchCost(base));
  assert.deepEqual(delivered, { onHandCost: 123.45, inboundCost: 0 });
  assert.equal(remainingBatchCost(base), remainingBatchCost({ ...base, quantityReceived: 10 }));
});

test("inbound units are excluded from physical inventory used by Show stock selection", () => {
  assert.equal(remainingBatchQuantity(base), 0);
  assert.equal(remainingBatchQuantity({ ...base, quantityReceived: 4 }), 4);
});
