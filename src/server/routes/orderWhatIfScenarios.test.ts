import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import request from "supertest";
import { createOrderWhatIfRouter } from "./orderWhatIfScenarios";
import { orderWhatIfTestDatabase } from "./orderWhatIfTestDatabase";
const input = { name: "Purchase plan", supplier: "Supplier", notes: "Hypothetical", shippingCost: "80", tariffCost: "40", targetMargin: "15", lines: [{ description: "Gem 6", quantity: 20, totalProductCost: "600", sellingPriceOverride: null }] };
function setup() { const store = orderWhatIfTestDatabase(); const app = express(); app.use(express.json()); app.use("/scenarios", createOrderWhatIfRouter(store.database)); return { app, ...store }; }
test("scenario create/open/edit/rename/duplicate/delete use only isolated planning persistence", async () => {
  const { app, records, database } = setup();
  for (const key of ["order", "inventoryBatch", "fundEntry", "businessPositionSnapshot", "supplierCredit", "sale", "product", "inventoryReceiptEvent"]) assert.throws(() => Reflect.get(database, key), /Forbidden/);
  const created = (await request(app).post("/scenarios").send(input).expect(201)).body;
  assert.equal(created.results.expectedProfit, "120.00"); assert.equal(created.createdAt, created.updatedAt);
  assert.equal(records.size, 1); assert.equal("results" in records.get(created.id)!, false);
  assert.equal("recommendedPrice" in (records.get(created.id)!.lines[0] as object), false);
  const opened = (await request(app).get(`/scenarios/${created.id}`).expect(200)).body; assert.deepEqual(opened, created);
  const changed = (await request(app).patch(`/scenarios/${created.id}`).send({ ...input, name: "Renamed", targetMargin: "20", updatedAt: created.updatedAt, lines: [...input.lines, { description: "Free extra", quantity: 1, totalProductCost: "0", sellingPriceOverride: "5" }] }).expect(200)).body;
  assert.equal(changed.name, "Renamed"); assert.equal(changed.lines.length, 2); assert.equal(changed.results.expectedRevenue, "905.00"); assert.notEqual(changed.updatedAt, created.updatedAt);
  await request(app).patch(`/scenarios/${created.id}`).send({ ...input, updatedAt: created.updatedAt }).expect(409);
  await request(app).delete(`/scenarios/${created.id}`).send({ updatedAt: created.updatedAt }).expect(409);
  const duplicate = (await request(app).post("/scenarios").send({ ...input, name: "Copy" }).expect(201)).body;
  assert.notEqual(duplicate.id, created.id);
  assert.equal((await request(app).get("/scenarios").expect(200)).body.length, 2);
  await request(app).delete(`/scenarios/${created.id}`).send({ updatedAt: changed.updatedAt }).expect(204);
  await request(app).get(`/scenarios/${created.id}`).expect(404); assert.equal(records.size, 1);
});
test("invalid IDs, unknown fields and invalid inputs never write", async () => {
  const { app, writeCount } = setup();
  for (const body of [{ ...input, orderId: 1 }, { ...input, shippingCost: -1 }, { ...input, lines: [] }, { ...input, lines: [{ ...input.lines[0], productId: 1 }] }]) await request(app).post("/scenarios").send(body).expect(400);
  await request(app).get("/scenarios/NaN").expect(400);
  await request(app).patch("/scenarios/1").send(input).expect(400);
  await request(app).delete("/scenarios/1").send({ updatedAt: "bad" }).expect(400);
  assert.equal(writeCount(), 0);
});
