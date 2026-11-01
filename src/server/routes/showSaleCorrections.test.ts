import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import request from "supertest";
import type { PrismaClient } from "../../generated/prisma/client";
import { createShowSaleCorrectionsRouter } from "./showSaleCorrections";

function appFor(error: unknown) {
  const app = express(); app.use(express.json());
  app.use(createShowSaleCorrectionsRouter({ $transaction: async () => { throw error; } } as unknown as Pick<PrismaClient, "$transaction" | "sale">));
  return app;
}
const body = { revision: "b".repeat(64), paymentMethod: "CASH", notes: null, lines: [{ productId: 1, quantity: 1, unitSalePrice: "10.00" }] };
test("correction routes reject unknown accounting fields and malformed IDs before opening a transaction", async () => {
  const app = appFor(new Error("Must not reach database"));
  await request(app).patch("/1/correction").send({ ...body, cogs: 0 }).expect(400);
  await request(app).patch("/1/correction").send({ ...body, showVisitId: 2 }).expect(400);
  await request(app).delete("/1/correction").send({ revision: body.revision, allocations: [] }).expect(400);
  await request(app).get("/invalid/correction").expect(400);
});
test("serialization/deadlock conflicts return retryable 409 without database details", async () => {
  for (const error of [{ code: "P2034" }, { code: "P2010", meta: { code: "40001" } }, { code: "40P01" }]) {
    const app = appFor(error);
    for (const method of ["patch", "delete"] as const) {
      const response = await request(app)[method]("/1/correction").send(method === "delete" ? { revision: body.revision } : body).expect(409);
      assert.match(response.body.error, /Reopen the sale/);
      assert.doesNotMatch(JSON.stringify(response.body), /P2034|40001|40P01/);
    }
  }
});
