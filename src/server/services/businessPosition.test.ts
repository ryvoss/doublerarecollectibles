import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateSealedInventoryPosition } from "./businessPosition";

test("Business Health includes transferred PackPool cost once and excludes converted Box retail", () => {
  const result = calculateSealedInventoryPosition([{
    expectedSalePrice: 100,
    defaultPackPrice: 6,
    inventoryBatches: [{
      quantityReceived: 1,
      quantitySold: 0,
      quantityConverted: 1,
      landedCost: 75.28,
      saleAllocations: [],
      packPoolAllocations: [{ totalCost: 75.28 }],
    }],
    packPoolsAsSource: [{ packsRemaining: 18, remainingCostBasis: 75.28 }],
  }]);

  assert.equal(result.sealedInventoryCost, 75.28);
  assert.equal(result.sealedExpectedRetail, 108);
  assert.equal(result.missingExpectedPriceProducts, 0);
});
