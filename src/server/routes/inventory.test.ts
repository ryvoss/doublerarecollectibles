import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import request from "supertest";
import router from "./inventory";
import { prisma } from "../prisma";

const app = express(); app.use(express.json()); app.use(router);
test("inventory summary retains receiving and cost splits while exposing admin reorder settings", async t => {
  const product = { id: 1, itemId: "BOX", name: "Box", type: "SEALED", reorderPoint: 4, expectedSalePrice: 20, unitType: "BOX", packsPerBox: null, packDisplayName: null, defaultPackPrice: null, packPoolsAsSource: [], inventoryBatches: [
    { quantityPurchased: 10, quantityReceived: 6, quantitySold: 1, quantityConverted: 1, landedCost: 100, landedUnitCost: 10, saleAllocations: [{ totalCost: 10 }], packPoolAllocations: [{ totalCost: 10 }] },
    { quantityPurchased: 2, quantityReceived: 2, quantitySold: 0, quantityConverted: 0, landedCost: 40, landedUnitCost: 20, saleAllocations: [], packPoolAllocations: [] },
  ] };
  const delegate = prisma.product as unknown as { findMany: () => Promise<unknown> };
  const original = delegate.findMany; t.after(() => { delegate.findMany = original; });
  delegate.findMany = async () => [product, { ...product, id: 2, inventoryBatches: [], reorderPoint: 10 }];
  const response = await request(app).get("/").expect(200);
  const [stock, empty] = response.body;
  assert.equal(stock.unitsOnHand, 6); assert.equal(stock.unitsInbound, 4);
  assert.equal(stock.onHandInventoryValue, 80); assert.equal(stock.inboundInventoryValue, 40); assert.equal(stock.inventoryValue, 120);
  assert.equal(stock.unitCost, 13.33); assert.equal(stock.reorderPoint, 4);
  assert.equal(empty.unitsOnHand, 0); assert.equal(empty.unitCost, null); assert.equal(empty.reorderPoint, 10);
});
test("reorder update changes only the eligible product threshold", async t => {
  let query: unknown;
  const delegate = prisma.product as unknown as { updateMany: (args: unknown) => Promise<unknown> };
  const original = delegate.updateMany; t.after(() => { delegate.updateMany = original; });
  delegate.updateMany = async (args: unknown) => { query = args; return { count: 1 }; };
  await request(app).patch("/7/reorder-point").send({ reorderPoint: 25 }).expect(200);
  assert.deepEqual(query, { where: { id: 7, active: true, sellable: true, type: "SEALED" }, data: { reorderPoint: 25 } });
});
