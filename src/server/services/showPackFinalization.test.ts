import assert from "node:assert/strict";
import { test } from "node:test";
import { persistShowPackFinalizations } from "./showPackFinalization";
import type { ShowPackFinalizationDatabase } from "./showPackFinalization";

test("persists finalized pack results, pool reduction, and Cash/Digital SEALED revenue", async () => {
  const writes = { allocations: [] as Record<string, unknown>[], pools: [] as Record<string, unknown>[], snapshots: [] as Record<string, unknown>[], funds: [] as Record<string, unknown>[] };
  const database = {
    showPackPoolAllocation: { update: async (args: Record<string, unknown>) => { writes.allocations.push(args); } },
    packPool: { update: async (args: Record<string, unknown>) => { writes.pools.push(args); } },
    showPackSnapshot: { update: async (args: Record<string, unknown>) => { writes.snapshots.push(args); } },
    fundEntry: { createMany: async (args: Record<string, unknown>) => { writes.funds.push(args); } },
  };
  const finalizedAt = new Date("2026-10-07T20:00:00Z");
  await persistShowPackFinalizations(database as unknown as ShowPackFinalizationDatabase, { id: 4, visitDate: finalizedAt, showName: "Test Show" }, finalizedAt, [{
    snapshotId: 9,
    packDisplayName: "Gem Pack",
    endingPacks: 10,
    packsSold: 8,
    declaredSalesValue: "48.00",
    estimatedCogs: "33.44",
    giveawayCostBasis: "0.00",
    damagedCostBasis: "0.00",
    actualRevenue: "48.00",
    actualCashRevenue: "20.00",
    actualDigitalRevenue: "28.00",
    allocationUpdates: [{ allocationId: 7, quantityConsumed: 8, costBasisConsumed: "33.44" }],
    poolUpdates: [{ packPoolId: 3, quantityConsumed: 8, costBasisConsumed: "33.44" }],
  }]);
  assert.equal(writes.allocations.length, 1);
  assert.equal(writes.pools.length, 1);
  const snapshotData = writes.snapshots[0].data as Record<string, unknown>;
  assert.equal(snapshotData.packsSold, 8);
  assert.equal(snapshotData.estimatedCogs, "33.44");
  assert.equal(snapshotData.actualGrossProfit, "14.56");
  assert.equal(snapshotData.finalizedAt, finalizedAt);
  const fundData = writes.funds[0].data as Array<Record<string, unknown>>;
  assert.deepEqual(fundData.map(item => [item.location, item.amount]), [["CASH", "20.00"], ["DIGITAL", "28.00"]]);
});

test("blank Actual Revenue persists analytical results without FundEntries", async () => {
  let fundWrites = 0;
  const database = {
    showPackPoolAllocation: { update: async () => undefined },
    packPool: { update: async () => undefined },
    showPackSnapshot: { update: async () => undefined },
    fundEntry: { createMany: async () => { fundWrites += 1; } },
  };
  await persistShowPackFinalizations(database as unknown as ShowPackFinalizationDatabase, { id: 1, visitDate: new Date(), showName: "Test" }, new Date(), [{
    snapshotId: 1, packDisplayName: "Pack", endingPacks: 10, packsSold: 8,
    declaredSalesValue: "48.00", estimatedCogs: "33.44", giveawayCostBasis: "0.00", damagedCostBasis: "0.00",
    actualRevenue: null, actualCashRevenue: null, actualDigitalRevenue: null, allocationUpdates: [], poolUpdates: [],
  }]);
  assert.equal(fundWrites, 0);
});
