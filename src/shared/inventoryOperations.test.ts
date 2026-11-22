import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DEFAULT_INVENTORY_FILTER, DEFAULT_INVENTORY_SORT, selectInventory, stockStatus, needsReorder, validReorderPoint } from "./inventoryOperations";
const item = (productId: number, unitsOnHand: number, unitsInbound = 0, reorderPoint = 10) => ({ productId, productName: `Product ${productId}`, itemId: String(productId), unitsOnHand, unitsInbound, reorderPoint, inventoryValue: unitsOnHand * 2 });
test("fresh inventory defaults to All and descending on hand, retaining zero-stock products", () => {
  assert.equal(DEFAULT_INVENTORY_FILTER, "all"); assert.equal(DEFAULT_INVENTORY_SORT, "onHandDesc");
  assert.deepEqual(selectInventory([item(1, 0), item(2, 6), item(3, 20)]).map(x => x.productId), [3, 2, 1]);
});
test("stock statuses use each product threshold and keep inbound separate", () => {
  assert.equal(stockStatus(item(1, 0)), "Out of Stock");
  assert.equal(stockStatus(item(1, 10)), "Reorder Recommended");
  assert.equal(stockStatus(item(1, 6, 20)), "Restock On The Way");
  assert.equal(stockStatus(item(1, 11)), "Healthy");
  assert.equal(stockStatus(item(1, 6, 0, 5)), "Healthy");
  assert.equal(stockStatus(item(1, 0, 2, 0)), "Restock On The Way");
});
test("quick filters distinguish exhausted stock, inbound coverage and partial restocks", () => {
  const items = [item(1, 0), item(2, 6), item(3, 6, 20), item(4, 6, 2), item(5, 20), item(6, 0, 20)];
  const ids = (filter: "reorder" | "inbound" | "out") => selectInventory(items, filter, "name").map(x => x.productId);
  assert.deepEqual(ids("reorder"), [1, 2, 4]); assert.deepEqual(ids("inbound"), [3, 4, 6]); assert.deepEqual(ids("out"), [1, 6]);
  assert.equal(needsReorder(item(1, 6, 4)), true); assert.equal(needsReorder(item(1, 6, 5)), false);
});
test("sorts are deterministic, prioritize reorder groups and never mutate source", () => {
  const items = [item(5, 20), item(3, 6, 20), item(2, 6), item(1, 0), item(4, 2, 1), item(6, 6)];
  assert.deepEqual(selectInventory(items, "all", "priority").map(x => x.productId), [1, 2, 6, 4, 3, 5]);
  assert.deepEqual(selectInventory(items, "all", "onHandAsc").map(x => x.productId), [1, 4, 2, 3, 6, 5]);
  assert.equal(selectInventory(items, "all", "value")[0].productId, 5);
  assert.deepEqual(items.map(x => x.productId), [5, 3, 2, 1, 4, 6]);
  assert.equal(selectInventory(items, "all", "name", "product 4").length, 1);
});
test("reorder points default in the database and accept only bounded integers", () => {
  const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
  assert.match(schema, /reorderPoint\s+Int\s+@default\(10\)/);
  for (const value of [0, 10, 200, 1000000]) assert.equal(validReorderPoint(value), true);
  for (const value of [-1, 1.2, 1000001, null, "10", true, NaN]) assert.equal(validReorderPoint(value), false);
});
