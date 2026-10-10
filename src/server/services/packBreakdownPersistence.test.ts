import assert from "node:assert/strict";
import { test } from "node:test";
import { persistPackBreakdown } from "./packBreakdownPersistence";
import type { PackBreakdownPersistenceDatabase } from "./packBreakdownPersistence";

const plan = {
  boxesConsumed: 1,
  packsCreated: 18,
  totalCostBasis: "75.28",
  costPerPack: "4.182222",
  allocations: [{ inventoryBatchId: 7, quantity: 1, unitCost: "75.280000", totalCost: "75.28" }],
};

function fakeDatabase() {
  const writes: Array<{ delegate: string; operation: string; args: unknown }> = [];
  const record = (delegate: string, operation: string, result: unknown) => async (args: unknown) => {
    writes.push({ delegate, operation, args });
    return result;
  };
  return {
    writes,
    database: {
      packPool: { create: record("packPool", "create", { id: 12 }) },
      packPoolSourceAllocation: { create: record("packPoolSourceAllocation", "create", { id: 13 }) },
      inventoryBatch: { update: record("inventoryBatch", "update", { id: 7 }) },
      showPackPoolAllocation: { create: record("showPackPoolAllocation", "create", { id: 14 }) },
      showPackSnapshot: { update: record("showPackSnapshot", "update", { id: 15 }) },
    } as unknown as PackBreakdownPersistenceDatabase,
  };
}

test("breakdown creates derived PackPool inventory without a Pack Product", async () => {
  const { database, writes } = fakeDatabase();
  await persistPackBreakdown(database, {
    sourceBoxProductId: 3,
    packDisplayName: "Gem 6 Pack",
    showVisitId: null,
    showPackSnapshotId: null,
    plan,
  });

  const poolData = (writes[0].args as { data: Record<string, unknown> }).data;
  assert.equal(poolData.sourceBoxProductId, 3);
  assert.equal(poolData.packDisplayName, "Gem 6 Pack");
  assert.equal(poolData.packsCreated, 18);
  assert.equal(poolData.totalCostBasis, "75.28");
  assert.equal("packProductId" in poolData, false);
  assert.deepEqual(writes.map(write => write.delegate), ["packPool", "packPoolSourceAllocation", "inventoryBatch"]);
});

test("active Show breakdown allocates new derived packs to its snapshot", async () => {
  const { database, writes } = fakeDatabase();
  await persistPackBreakdown(database, {
    sourceBoxProductId: 3,
    packDisplayName: "Gem 6 Pack",
    showVisitId: 4,
    showPackSnapshotId: 5,
    plan,
  });

  assert.deepEqual(writes.map(write => write.delegate), [
    "packPool",
    "packPoolSourceAllocation",
    "inventoryBatch",
    "showPackPoolAllocation",
    "showPackSnapshot",
  ]);
});
