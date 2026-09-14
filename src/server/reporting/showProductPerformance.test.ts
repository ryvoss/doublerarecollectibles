import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response } from "express";
import { Prisma } from "../../generated/prisma/client";
import { aggregateShowProductPerformance, createShowProductPerformanceHandler } from "./showProductPerformance";

function line(productId = 1, saleId = 1, revenue = "10.00", cogs = "6.00", grossProfit = "4.00", quantity = 1) {
  return {
    productId, saleId, quantity,
    revenue: new Prisma.Decimal(revenue),
    cogs: new Prisma.Decimal(cogs),
    grossProfit: new Prisma.Decimal(grossProfit),
    product: { itemId: `ITEM-${productId}`, name: "Same name" },
  };
}

test("groups by ID across sales and counts distinct transactions, not allocations", () => {
  const allocated = { ...line(), allocations: [{ quantity: 1 }, { quantity: 1 }] };
  const report = aggregateShowProductPerformance([allocated, line(1, 1), line(1, 2), line(2, 2)]);
  assert.equal(report.products.length, 2);
  assert.deepEqual(report.products[0], {
    productId: 1, itemId: "ITEM-1", productName: "Same name", unitsSold: 3,
    revenue: "30.00", cogs: "18.00", grossProfit: "12.00", grossMargin: 0.4,
    saleLineCount: 3, transactionCount: 2,
  });
  assert.equal(report.rankings.bestSeller?.productId, 1);
});

test("preserves exact cents and inconsistent stored profit", () => {
  const report = aggregateShowProductPerformance([line(1, 1, "0.10", "0.01", "0.02"), line(1, 2, "0.20", "0.02", "0.03")]);
  assert.equal(report.products[0].revenue, "0.30");
  assert.equal(report.products[0].cogs, "0.03");
  assert.equal(report.products[0].grossProfit, "0.05");
  assert.equal(report.products[0].grossMargin, 5 / 30);
});

test("zero revenue is excluded from margin ranking; negative profits remain eligible", () => {
  const report = aggregateShowProductPerformance([line(1, 1, "0", "1", "-1"), line(2, 2, "10", "12", "-2")]);
  assert.equal(report.products[0].grossMargin, 0);
  assert.equal(report.products[1].grossProfit, "-2.00");
  assert.equal(report.rankings.highestGrossMargin?.productId, 2);
  assert.equal(aggregateShowProductPerformance([line(1, 1, "0")]).rankings.highestGrossMargin, null);
});

test("all ranking ties use ascending product ID", () => {
  const report = aggregateShowProductPerformance([line(5), line(2)]);
  for (const winner of Object.values(report.rankings)) assert.equal(winner?.productId, 2);
});

test("margin ranking uses exact ratios and combined totals, not rounded or average margins", () => {
  const report = aggregateShowProductPerformance([
    line(1, 1, "1000000", "0", "500000"),
    line(2, 1, "1000000", "0", "500000.01"),
    line(3, 1, "1", "0", "1"), line(3, 2, "999", "999", "0"),
  ]);
  assert.equal(report.rankings.highestGrossMargin?.productId, 2);
  assert.equal(report.products[2].grossMargin, 0.001);
});

test("empty report returns empty products and null rankings", () => {
  assert.deepEqual(aggregateShowProductPerformance([]), {
    products: [], rankings: { bestSeller: null, highestRevenue: null, highestGrossProfit: null, highestGrossMargin: null },
  });
});

// Exercise the actual handlers with a read-only database fixture; no live database is used.
function fixture() {
  const visits = [
    { id: 1, showId: 10, finalizedAt: null },
    { id: 2, showId: 10, finalizedAt: new Date("2026-09-01") },
    { id: 3, showId: 20, finalizedAt: new Date("2026-09-01") },
  ];
  const records = [
    { ...line(1, 1), visitId: 1, type: "SEALED", active: true },
    { ...line(1, 2), visitId: 2, type: "SEALED", active: false },
    { ...line(2, 3), visitId: 2, type: "SINGLE", active: true },
    { ...line(3, 4), visitId: 3, type: "SEALED", active: true },
    { ...line(4, 5), visitId: null, type: "SEALED", active: true },
  ];
  const database = {
    show: { findUnique: async ({ where }: { where: { id: number } }) => where.id === 10 ? { id: 10 } : null },
    showVisit: { findUnique: async ({ where }: { where: { id: number } }) => visits.find((visit) => visit.id === where.id) ?? null },
    saleLine: { findMany: async (args: Prisma.SaleLineFindManyArgs) => {
      assert.equal(args.where?.product && "type" in args.where.product ? args.where.product.type : null, "SEALED");
      assert.equal(JSON.stringify(args).includes("allocations"), false);
      assert.equal(JSON.stringify(args).includes("active"), false);
      const sale = args.where?.sale as { showVisitId?: number; showVisit?: { showId: number; finalizedAt: { not: null } } };
      if (sale.showVisit) assert.deepEqual(sale.showVisit.finalizedAt, { not: null });
      return records.filter((record) => {
        const visit = visits.find((entry) => entry.id === record.visitId);
        return record.type === "SEALED" && (sale.showVisitId !== undefined
          ? record.visitId === sale.showVisitId
          : visit?.showId === sale.showVisit?.showId && visit?.finalizedAt !== null);
      });
    } },
  };
  return database as unknown as Parameters<typeof createShowProductPerformanceHandler>[0];
}

async function request(level: "visit" | "show", id: string) {
  let status = 200;
  let body: Record<string, unknown> = {};
  const response = {
    status(code: number) { status = code; return response; },
    json(value: Record<string, unknown>) { body = value; return response; },
  };
  await createShowProductPerformanceHandler(fixture(), level)(
    { params: { visitId: id, showId: id } } as unknown as Request,
    response as unknown as Response,
    () => {},
  );
  return { status, body };
}

test("both endpoints reject invalid IDs and return 404 for missing records", async () => {
  for (const level of ["visit", "show"] as const) {
    for (const id of ["abc", "0", "-1", "1.2", "1e2", "2147483648"]) {
      assert.equal((await request(level, id)).status, 400);
    }
    assert.equal((await request(level, "999")).status, 404);
  }
});

test("open visit includes only its linked sealed sales and is provisional", async () => {
  const { status, body } = await request("visit", "1");
  assert.equal(status, 200);
  assert.deepEqual(body.scope, { type: "visit", showId: 10, visitId: 1, finalizedAt: null, finalizedOnly: false, provisional: true });
  assert.deepEqual(body.products, aggregateShowProductPerformance([line()]).products);
  assert.equal(((await request("visit", "2")).body.scope as { provisional: boolean }).provisional, false);
});

test("recurring show excludes open/unlinked/other-show/singles sales and retains inactive products", async () => {
  const { status, body } = await request("show", "10");
  assert.equal(status, 200);
  assert.deepEqual(body.scope, { type: "show", showId: 10, finalizedOnly: true, provisional: false });
  assert.deepEqual(body.products, aggregateShowProductPerformance([line(1, 2)]).products);
});
