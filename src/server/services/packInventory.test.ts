import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "../../generated/prisma/client";
import { aggregatePackInventory } from "./packInventory";
import type { PackInventoryPool } from "./packInventory";

const source = {
  id: 3,
  itemId: "GEM6-BOX",
  name: "Gem 6 Box",
  active: true,
  sellable: true,
  unitType: "BOX" as const,
  packDisplayName: "Gem 6 Pack",
  defaultPackPrice: new Prisma.Decimal("6.00"),
};

test("pack inventory groups derived packs by source Box", () => {
  const pools: PackInventoryPool[] = [
    { sourceBoxProductId: 3, packDisplayName: "Gem 6 Pack", packsRemaining: 12, remainingCostBasis: new Prisma.Decimal("50.19"), sourceBoxProduct: source },
    { sourceBoxProductId: 3, packDisplayName: "Gem 6 Pack", packsRemaining: 6, remainingCostBasis: new Prisma.Decimal("25.09"), sourceBoxProduct: source },
  ];
  assert.deepEqual(aggregatePackInventory(pools), [{
    sourceBoxProductId: 3,
    itemId: "GEM6-BOX",
    sourceBoxProductName: "Gem 6 Box",
    packDisplayName: "Gem 6 Pack",
    packsOnHand: 18,
    remainingCostBasis: 75.28,
    costPerPack: 4.182222,
    defaultPackPrice: 6,
    expectedRetailValue: 108,
    potentialGrossProfit: 32.72,
    potentialGrossMargin: 3272 / 10800,
    poolCount: 2,
  }]);
});

test("pack inventory keeps missing derived-pack pricing explicit", () => {
  const result = aggregatePackInventory([{
    sourceBoxProductId: 3,
    packDisplayName: "Gem 6 Pack",
    packsRemaining: 18,
    remainingCostBasis: new Prisma.Decimal("75.28"),
    sourceBoxProduct: { ...source, defaultPackPrice: null },
  }]);
  assert.equal(result[0].defaultPackPrice, null);
  assert.equal(result[0].expectedRetailValue, null);
  assert.equal(result[0].potentialGrossProfit, null);
});
