import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "../../generated/prisma/client";
import { aggregatePackPerformance } from "./packPerformance";
import type { PackPerformancePool, PackPerformanceSnapshot } from "./packPerformance";

function snapshot(overrides: Partial<PackPerformanceSnapshot> = {}): PackPerformanceSnapshot {
  return {
    id: 1,
    showVisitId: 10,
    sourceBoxProductId: 4,
    packDisplayName: "Gem Pack",
    startingPacks: 36,
    addedPacks: 18,
    endingPacks: 20,
    giveaways: 2,
    damaged: 1,
    packsSold: 31,
    declaredValuePerPack: new Prisma.Decimal("6.00"),
    declaredSalesValue: new Prisma.Decimal("186.00"),
    estimatedCogs: new Prisma.Decimal("129.58"),
    giveawayCostBasis: new Prisma.Decimal("8.36"),
    damagedCostBasis: new Prisma.Decimal("4.18"),
    actualRevenue: new Prisma.Decimal("180.00"),
    actualCashRevenue: new Prisma.Decimal("100.00"),
    actualDigitalRevenue: new Prisma.Decimal("80.00"),
    actualGrossProfit: new Prisma.Decimal("50.42"),
    actualGrossMargin: new Prisma.Decimal("0.280111"),
    finalizedAt: new Date("2026-10-07T20:00:00Z"),
    sourceBoxProduct: { id: 4, itemId: "GEM-BOX", name: "Gem Box", defaultPackPrice: new Prisma.Decimal("7.00") },
    showVisit: { showId: 2, visitDate: new Date("2026-10-07T00:00:00Z"), show: { name: "Test Show" } },
    ...overrides,
  };
}

test("pack performance uses finalized stored values and current PackPool position", () => {
  const pools: PackPerformancePool[] = [
    { sourceBoxProductId: 4, packsRemaining: 10, remainingCostBasis: new Prisma.Decimal("41.82") },
    { sourceBoxProductId: 4, packsRemaining: 5, remainingCostBasis: new Prisma.Decimal("20.91") },
  ];
  const result = aggregatePackPerformance([snapshot()], pools);
  assert.deepEqual(result.summary, {
    snapshotCount: 1,
    productCount: 1,
    packsSold: 31,
    declaredSalesValue: 186,
    cogs: 129.58,
    giveawayCost: 8.36,
    damagedCost: 4.18,
    actualRevenue: 180,
    cashRevenue: 100,
    digitalRevenue: 80,
    grossProfit: 50.42,
    grossMargin: 5042 / 18000,
    actualRevenueCount: 1,
    declaredOnlyCount: 0,
    actualRevenueComplete: true,
    revenueMode: "ACTUAL",
  });
  assert.deepEqual(result.products[0].remaining, {
    packs: 15,
    costBasis: 62.73,
    retailUnitValue: 7,
    retailValueSource: "DEFAULT_PACK_PRICE",
    retailValue: 105,
    potentialGrossProfit: 42.27,
  });
});

test("declared-only snapshots never imply collected revenue", () => {
  const analytical = snapshot({
    actualRevenue: null,
    actualCashRevenue: null,
    actualDigitalRevenue: null,
    actualGrossProfit: null,
    actualGrossMargin: null,
    sourceBoxProduct: { id: 4, itemId: "GEM-BOX", name: "Gem Box", defaultPackPrice: null },
  });
  const result = aggregatePackPerformance([analytical], [{
    sourceBoxProductId: 4,
    packsRemaining: 20,
    remainingCostBasis: new Prisma.Decimal("83.64"),
  }]);
  assert.equal(result.summary.actualRevenue, null);
  assert.equal(result.summary.grossProfit, null);
  assert.equal(result.summary.grossMargin, null);
  assert.equal(result.summary.revenueMode, "DECLARED_ONLY");
  assert.equal(result.products[0].remaining.retailValueSource, "LATEST_DECLARED_VALUE");
  assert.equal(result.products[0].remaining.retailValue, 120);
});

test("mixed reporting totals actual profit only for snapshots with Actual Revenue", () => {
  const result = aggregatePackPerformance([
    snapshot(),
    snapshot({
      id: 2,
      showVisitId: 11,
      actualRevenue: null,
      actualCashRevenue: null,
      actualDigitalRevenue: null,
      actualGrossProfit: null,
      actualGrossMargin: null,
      showVisit: { showId: 2, visitDate: new Date("2026-10-14T00:00:00Z"), show: { name: "Test Show" } },
    }),
  ]);
  assert.equal(result.summary.packsSold, 62);
  assert.equal(result.summary.cogs, 259.16);
  assert.equal(result.summary.actualRevenue, 180);
  assert.equal(result.summary.grossProfit, 50.42);
  assert.equal(result.summary.revenueMode, "MIXED");
  assert.equal(result.summary.declaredOnlyCount, 1);
});
