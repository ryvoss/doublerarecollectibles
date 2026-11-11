import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import request from "supertest";
import { prisma } from "../prisma";
import ordersRouter from "../routes/orders";
import salesRouter from "../routes/sales";
import { calculateBusinessPosition } from "./businessPosition";
import { toPublicInventoryItem } from "./publicContracts";
import { databaseName, runtimeDatabaseUrl, TEST_DATABASE_NAME } from "../environment";
const enabled = process.env.APP_ENV === "TEST";
const app = express(); app.use(express.json()); app.use("/orders", ordersRouter); app.use("/sales", salesRouter);
let sequence = 0;
const run = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
async function draft(costs: number[], quantities: number[], supplierName = `supplier-${run}`) {
  const products = await Promise.all(costs.map(() => prisma.product.create({ data: { itemId: `QA-${run}-${++sequence}`, name: "Purchasing test", type: "SEALED", unitType: "BOX", expectedSalePrice: 200 } })));
  return prisma.order.create({ data: { orderNumber: `QA-${run}-${++sequence}`, orderDate: new Date(), supplierName,
    lines: { create: costs.map((cost, i) => ({ purchasedProductId: products[i].id, sellableProductId: products[i].id, quantityPurchased: quantities[i], sellableQuantity: quantities[i], productCost: cost })) } }, include: { lines: true } });
}
async function finalize(id: number, creditApplications: unknown[] = []) {
  const response = await request(app).post(`/orders/${id}/finalize`).send({ creditApplications });
  assert.equal(response.status, 200, JSON.stringify(response.body)); return response.body;
}
async function preview(id: number, lines: Array<{ orderLineId: number; cancelQuantity: number }>, settlementType = "SUPPLIER_CREDIT") {
  const body = { reason: "Supplier unable to fulfill", settlementType, lines };
  const response = await request(app).post(`/orders/${id}/amendment-preview`).send(body);
  assert.equal(response.status, 200, JSON.stringify(response.body)); return { ...body, token: response.body.token };
}
async function commit(id: number, body: object) {
  const response = await request(app).post(`/orders/${id}/amendments`).send(body);
  assert.equal(response.status, 200, JSON.stringify(response.body)); return response.body;
}
async function assetValue() { const p = await calculateBusinessPosition(); return Math.round((p.totalBusinessFunds + p.sealedInventoryCost + p.supplierCreditBalance) * 100); }

test("PostgreSQL purchasing acceptance, safeguards and concurrency", { skip: !enabled }, async t => {
  assert.equal(databaseName(runtimeDatabaseUrl()), TEST_DATABASE_NAME);
  try {
  const connected = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  if (process.env.PURCHASING_ISOLATED_PRISMA === "1") {
    const url = new URL(runtimeDatabaseUrl());
    assert.equal(url.hostname, "localhost"); assert.equal(url.port, "51233");
    const marker = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM purchasing_qa.purchasing_qa_identity`;
    assert.deepEqual(marker, [{ id: "supplier-credit-qa-20261110" }]);
  } else assert.equal(connected[0].name, TEST_DATABASE_NAME);
    await t.test("Order 5 / Order 6: 4630 cash, 4630 inventory, zero credit, full future COGS", async () => {
      await prisma.show.create({ data: { name: `Valuation QA ${run}`, visits: { create: { visitDate: new Date(), status: "FINALIZED", finalizedAt: new Date(), endingSinglesValue: 250 } } } });
      const startingBusinessValue = (await calculateBusinessPosition()).totalBusinessValue;
      const startingValue = await assetValue();
      const fifth = await draft([1250, 500, 530], [40, 20, 20]); await finalize(fifth.id);
      const originalPayment = await prisma.fundEntry.findUniqueOrThrow({ where: { orderId: fifth.id } });
      const before = await assetValue();
      const amendment = await commit(fifth.id, await preview(fifth.id, fifth.lines.slice(1).map(line => ({ orderLineId: line.id, cancelQuantity: 20 }))));
      await request(app).post(`/orders/${fifth.id}/amendments`).send({ reason: "repeat", settlementType: "SUPPLIER_CREDIT", token: "old", lines: [{ orderLineId: fifth.lines[1].id, cancelQuantity: 20 }] }).expect(409);
      assert.equal(amendment.settlementAmount, "1030.00"); assert.equal(amendment.newOrderTotal, "1250.00");
      assert.equal(await assetValue(), before); assert.equal(before, startingValue);
      assert.deepEqual(await prisma.fundEntry.findUnique({ where: { orderId: fifth.id } }), originalPayment);
      assert.equal(await prisma.fundEntry.count({ where: { orderAmendmentId: amendment.amendmentId } }), 0);
      const credit = await prisma.supplierCredit.findUniqueOrThrow({ where: { amendmentId: amendment.amendmentId } });
      for (const line of fifth.lines.slice(1)) {
        const product = await prisma.product.findUniqueOrThrow({ where: { id: line.sellableProductId }, include: { inventoryBatches: true } });
        assert.equal(product.inventoryBatches[0].quantityPurchased, 0);
        assert.equal(toPublicInventoryItem(product, null).availability, "SOLD_OUT");
      }
      const sixth = await draft([1000, 800, 600, 500, 480], [20, 20, 12, 10, 10]);
      await request(app).post(`/orders/${sixth.id}/finalize`).send({ expectedUpdatedAt: "stale", creditApplications: [] }).expect(409);
      await finalize(sixth.id, [{ supplierCreditId: credit.id, amountApplied: "1030.00" }]);
      const sixthPayment = await prisma.fundEntry.findUniqueOrThrow({ where: { orderId: sixth.id } });
      assert.equal(Number(sixthPayment.amount), -2350);
      assert.equal(Number(sixthPayment.amount) + Number(originalPayment.amount), -4630);
      const batches = await prisma.inventoryBatch.findMany({ where: { orderLine: { orderId: { in: [fifth.id, sixth.id] } } } });
      assert.equal(batches.reduce((sum, batch) => sum + Number(batch.landedCost), 0), 4630);
      assert.equal(Number((await prisma.supplierCredit.findUniqueOrThrow({ where: { id: credit.id } })).remainingAmount), 0);
      assert.equal(await assetValue(), startingValue);
      assert.equal((await calculateBusinessPosition()).totalBusinessValue, startingBusinessValue);
      await request(app).post(`/orders/${sixth.id}/receive`).send({ lines: sixth.lines.map(line => ({ orderLineId: line.id, quantity: line.sellableQuantity })) }).expect(200);
      const sale = await request(app).post("/sales").send({ saleDate: "2026-11-10", paymentMethod: "CASH", lines: sixth.lines.map(line => ({ productId: line.sellableProductId, quantity: line.sellableQuantity, unitSalePrice: 200 })) });
      assert.equal(sale.status, 201, JSON.stringify(sale.body));
      const allocations = await prisma.saleAllocation.findMany({ where: { inventoryBatch: { orderLine: { orderId: sixth.id } } } });
      assert.equal(allocations.reduce((sum, allocation) => sum + Number(allocation.totalCost), 0), 3380);
      await request(app).post(`/orders/${sixth.id}/amendment-preview`).send({ reason: "Unavailable", settlementType: "CASH_REFUND", lines: [{ orderLineId: sixth.lines[0].id, cancelQuantity: 1 }] }).expect(409);
      await assert.rejects(prisma.orderAmendment.update({ where: { id: amendment.amendmentId }, data: { reason: "Rewrite history" } }));
      await assert.rejects(prisma.supplierCreditApplication.deleteMany({ where: { orderId: sixth.id } }));
    });
    await t.test("additional landed costs and credit funding reconcile to full inventory basis", async () => {
      const order = await draft([100, 200], [10, 20]);
      await prisma.order.update({ where: { id: order.id }, data: { shippingCost: 30, tariffCost: 12, otherCost: 6, adjustment: -18 } });
      await finalize(order.id);
      const amended = await commit(order.id, await preview(order.id, [{ orderLineId: order.lines[0].id, cancelQuantity: 5 }]));
      assert.equal(amended.settlementAmount, "55.00");
      const credit = await prisma.supplierCredit.findUniqueOrThrow({ where: { amendmentId: amended.amendmentId } });
      const target = await draft([100], [10]); await prisma.order.update({ where: { id: target.id }, data: { shippingCost: 10 } });
      await finalize(target.id, [{ supplierCreditId: credit.id, amountApplied: "55" }]);
      const batch = await prisma.inventoryBatch.findUniqueOrThrow({ where: { orderLineId: target.lines[0].id } });
      assert.equal(Number(batch.landedCost), 110); assert.equal(Number(batch.landedUnitCost), 11);
      assert.equal(Number((await prisma.fundEntry.findUniqueOrThrow({ where: { orderId: target.id } })).amount), -55);
    });
    await t.test("partial cancellation, receiving floor, stale preview and cash refund", async () => {
      const order = await draft([100], [10]); await finalize(order.id);
      const body = await preview(order.id, [{ orderLineId: order.lines[0].id, cancelQuantity: 4 }], "CASH_REFUND");
      await request(app).post(`/orders/${order.id}/receive`).send({ lines: [{ orderLineId: order.lines[0].id, quantity: 3 }] }).expect(200);
      await request(app).post(`/orders/${order.id}/amendments`).send(body).expect(409);
      const invalid = await request(app).post(`/orders/${order.id}/amendment-preview`).send({ ...body, lines: [{ orderLineId: order.lines[0].id, cancelQuantity: 8 }] }); assert.equal(invalid.status, 409);
      const saved = await commit(order.id, await preview(order.id, body.lines, "CASH_REFUND"));
      const refund = await prisma.fundEntry.findUniqueOrThrow({ where: { orderAmendmentId: saved.amendmentId } }); assert.equal(Number(refund.amount), 40);
      const batch = await prisma.inventoryBatch.findUniqueOrThrow({ where: { orderLineId: order.lines[0].id } }); assert.equal(batch.quantityPurchased, 6); assert.equal(batch.quantityReceived, 3);
      assert.equal(await prisma.supplierCredit.count({ where: { amendmentId: saved.amendmentId } }), 0);
      await request(app).post(`/orders/${order.id}/receive`).send({ lines: [{ orderLineId: order.lines[0].id, quantity: 4 }] }).expect(409);
    });
    await t.test("full order cancellation, partial credit use and concurrent overspend rollback", async () => {
      const source = await draft([100], [10]); await finalize(source.id);
      const result = await commit(source.id, await preview(source.id, [{ orderLineId: source.lines[0].id, cancelQuantity: 10 }]));
      const state = await request(app).get(`/orders/${source.id}`).expect(200); assert.equal(state.body.receivingStatus, "CANCELED");
      const credit = await prisma.supplierCredit.findUniqueOrThrow({ where: { amendmentId: result.amendmentId } });
      const partial = await draft([100], [10]); await finalize(partial.id, [{ supplierCreditId: credit.id, amountApplied: "20" }]);
      assert.equal(Number((await prisma.supplierCredit.findUniqueOrThrow({ where: { id: credit.id } })).remainingAmount), 80);
      const wrongSupplier = await draft([100], [10], "other supplier");
      await request(app).post(`/orders/${wrongSupplier.id}/finalize`).send({ creditApplications: [{ supplierCreditId: credit.id, amountApplied: "1" }] }).expect(409);
      const tooSmall = await draft([10], [1]);
      await request(app).post(`/orders/${tooSmall.id}/finalize`).send({ creditApplications: [{ supplierCreditId: credit.id, amountApplied: "11" }] }).expect(409);
      const targets = await Promise.all([draft([100], [10]), draft([100], [10])]);
      const results = await Promise.all(targets.map(order => request(app).post(`/orders/${order.id}/finalize`).send({ creditApplications: [{ supplierCreditId: credit.id, amountApplied: "80" }] })));
      assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
      const loser = targets[results.findIndex(result => result.status === 409)];
      assert.equal(await prisma.inventoryBatch.count({ where: { orderLine: { orderId: loser.id } } }), 0);
      assert.equal(await prisma.fundEntry.count({ where: { orderId: loser.id } }), 0);
      assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: loser.id } })).status, "DRAFT");
      assert.equal(Number((await prisma.supplierCredit.findUniqueOrThrow({ where: { id: credit.id } })).remainingAmount), 0);
    });
    await t.test("amendment and sale race cannot rewrite consumed COGS", { skip: process.env.PURCHASING_ISOLATED_PRISMA === "1" ? "Requires PostgreSQL concurrent serializable transactions." : false }, async () => {
      const order = await draft([100], [10]); await finalize(order.id);
      await request(app).post(`/orders/${order.id}/receive`).send({ lines: [{ orderLineId: order.lines[0].id, quantity: 5 }] }).expect(200);
      const body = await preview(order.id, [{ orderLineId: order.lines[0].id, cancelQuantity: 5 }]);
      const results = await Promise.all([
        request(app).post(`/orders/${order.id}/amendments`).send(body),
        request(app).post("/sales").send({ saleDate: "2026-11-10", paymentMethod: "CASH", lines: [{ productId: order.lines[0].sellableProductId, quantity: 5, unitSalePrice: 20 }] }),
      ]);
      assert.ok(results.every(result => [200, 201, 409].includes(result.status)), JSON.stringify(results.map(result => result.body)));
      const batch = await prisma.inventoryBatch.findUniqueOrThrow({ where: { orderLineId: order.lines[0].id }, include: { saleAllocations: true } });
      assert.ok(batch.quantitySold <= batch.quantityReceived); assert.ok(batch.quantityReceived <= batch.quantityPurchased);
      for (const allocation of batch.saleAllocations) assert.equal(Number(allocation.unitCost), 10);
    });
    await t.test("amendment and receiving race preserve received reality", { skip: process.env.PURCHASING_ISOLATED_PRISMA === "1" ? "Prisma local runtime cannot run concurrent serializable transactions; run on PostgreSQL." : false }, async () => {
      const order = await draft([100], [10]); await finalize(order.id);
      const body = await preview(order.id, [{ orderLineId: order.lines[0].id, cancelQuantity: 10 }]);
      const results = await Promise.all([
        request(app).post(`/orders/${order.id}/amendments`).send(body),
        request(app).post(`/orders/${order.id}/receive`).send({ lines: [{ orderLineId: order.lines[0].id, quantity: 10 }] }),
      ]);
      assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
      const batch = await prisma.inventoryBatch.findUniqueOrThrow({ where: { orderLineId: order.lines[0].id } });
      assert.ok(batch.quantityReceived <= batch.quantityPurchased);
    });
  } finally { await prisma.$disconnect(); }
});
