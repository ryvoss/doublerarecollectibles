import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "../../generated/prisma/client";
import { correctShowSale, parseSaleCorrection, saleRevision, showSaleCorrectionContext } from "./showSaleCorrections";

// Stateful transactional repository: failed writes never replace committed
// state. This exercises the production correction service, not a copy of it.
function fixture() {
  const date = new Date("2026-11-01T12:00:00Z");
  const product = (id: number) => ({ id, name: `Box ${id}`, active: true, sellable: true, type: "SEALED", unitType: "BOX" });
  const batch = (id: number, productId: number, quantityReceived: number, quantitySold: number, cost: number) => ({
    id, sellableProductId: productId, quantityPurchased: quantityReceived, quantityReceived, quantitySold, quantityConverted: 0,
    landedCost: cost * quantityReceived, landedUnitCost: cost, updatedAt: date,
    packPoolAllocations: [], orderLine: { order: { orderDate: new Date(date.getTime() + id * 1000) } },
  });
  let state: any = {
    sale: { id: 1, saleNumber: "SALE-0001", saleDate: date, showVisitId: 7, paymentMethod: "CASH", notes: null, createdAt: date, finalizedAt: date },
    visit: { id: 7, status: "ACTIVE", finalizedAt: null },
    lines: [{ id: 1, saleId: 1, productId: 1, quantity: 2, unitSalePrice: "15.00", revenue: "30.00", cogs: "10.00", grossProfit: "20.00" }],
    allocations: [{ id: 1, saleLineId: 1, inventoryBatchId: 1, quantity: 2, unitCost: "5.000000", totalCost: "10.00" }],
    batches: [batch(1, 1, 3, 2, 5), batch(2, 1, 4, 0, 8), batch(3, 2, 4, 0, 9)],
    funds: [{ id: 1, saleId: 1, source: "SEALED", type: "SEALED_SALE", amount: "30.00" }], next: 10,
  };
  let failFunds = false;
  const locks: string[] = [];
  const fullSale = (data: any) => data.sale ? { ...data.sale, showVisit: data.visit, fundEntry: data.funds.find((item: any) => item.saleId === 1),
    lines: data.lines.map((line: any) => ({ ...line, product: product(line.productId), allocations: data.allocations.filter((allocation: any) => allocation.saleLineId === line.id) })) } : null;
  const database = {
    sale: { findUnique: async () => fullSale(state) },
    $transaction: async (work: (tx: any) => Promise<unknown>, options: any) => {
      assert.equal(options.isolationLevel, "Serializable");
      const draft = structuredClone(state);
      const tx = {
        $executeRaw: async (strings: TemplateStringsArray) => { locks.push(strings.join("?")); },
        $queryRaw: async (strings: TemplateStringsArray) => { locks.push(strings.join("?")); return []; },
        sale: { findUnique: async () => fullSale(draft), update: async ({ data }: any) => { Object.assign(draft.sale, data); }, delete: async () => { draft.sale = null; } },
        showVisit: { findUnique: async () => draft.visit },
        product: { findUnique: async ({ where }: any) => product(where.id) },
        inventoryBatch: {
          findMany: async ({ where }: any) => draft.batches.filter((batch: any) => batch.sellableProductId === where.sellableProductId).map((batch: any) => ({ ...batch, saleAllocations: draft.allocations.filter((allocation: any) => allocation.inventoryBatchId === batch.id) })),
          updateMany: async ({ where, data }: any) => {
            const batch = draft.batches.find((batch: any) => batch.id === where.id);
            if (!batch || (where.quantitySold && batch.quantitySold < where.quantitySold.gte)) return { count: 0 };
            batch.quantitySold += data.quantitySold.increment ?? -data.quantitySold.decrement;
            return { count: 1 };
          },
        },
        saleAllocation: {
          deleteMany: async ({ where }: any) => { draft.allocations = draft.allocations.filter((allocation: any) => allocation.saleLineId !== where.saleLineId); },
          create: async ({ data }: any) => { draft.allocations.push({ id: draft.next++, ...data }); },
        },
        saleLine: {
          deleteMany: async () => { draft.lines = []; },
          create: async ({ data }: any) => { const line = { id: draft.next++, ...data }; draft.lines.push(line); return line; },
        },
        fundEntry: {
          create: async ({ data }: any) => { if (failFunds) throw new Error("Injected ledger failure"); draft.funds.push({ id: draft.next++, ...data }); },
          update: async ({ where, data }: any) => { Object.assign(draft.funds.find((item: any) => item.id === where.id), data); },
        },
      };
      const result = await work(tx);
      state = draft;
      return result;
    },
  } as unknown as Pick<PrismaClient, "$transaction" | "sale">;
  return { database, get state() { return state; }, locks, failFunds() { failFunds = true; } };
}

async function editFor(f: ReturnType<typeof fixture>, changes: Record<string, unknown> = {}) {
  const context = await showSaleCorrectionContext(f.database, 1);
  return parseSaleCorrection({ revision: context.revision, paymentMethod: "CASH", notes: null,
    lines: [{ productId: 1, quantity: 2, unitSalePrice: "15.00" }], ...changes });
}
const balance = (f: ReturnType<typeof fixture>) => f.state.funds.reduce((sum: number, entry: any) => sum + Number(entry.amount), 0);

for (const [quantity, expectedCogs] of [[1, "5.00"], [5, "31.00"]] as const) {
  test(`Show sale quantity ${quantity}: restores original inventory and reallocates true FIFO`, async () => {
    const f = fixture();
    await correctShowSale(f.database, 1, await editFor(f, { lines: [{ productId: 1, quantity, unitSalePrice: "15.00" }] }));
    assert.equal(f.state.lines[0].cogs, expectedCogs);
    assert.equal(f.state.lines[0].quantity, quantity);
    assert.equal(f.state.allocations.reduce((sum: number, item: any) => sum + item.quantity, 0), quantity);
    assert.equal(f.state.batches[0].quantitySold, Math.min(3, quantity));
    assert.equal(f.state.batches[1].quantitySold, Math.max(0, quantity - 3));
    assert.equal(balance(f), quantity * 15);
    assert.equal(f.state.funds[0].amount, "30.00");
  });
}

test("insufficient inventory rolls back released allocations, lines, stock, and Funds", async () => {
  const f = fixture(); const before = structuredClone(f.state);
  await assert.rejects(correctShowSale(f.database, 1, await editFor(f, { lines: [{ productId: 1, quantity: 8, unitSalePrice: "15.00" }] })), /Insufficient inventory/);
  assert.deepEqual(f.state, before);
});

test("product correction releases old batches, recalculates COGS, revenue, profit and payment breakdown", async () => {
  const f = fixture();
  await correctShowSale(f.database, 1, await editFor(f, { paymentMethod: "DIGITAL", notes: "Corrected box", lines: [{ productId: 2, quantity: 3, unitSalePrice: "20.00" }] }));
  assert.equal(f.state.batches[0].quantitySold, 0);
  assert.equal(f.state.batches[2].quantitySold, 3);
  assert.equal(f.state.lines[0].cogs, "27.00");
  assert.equal(f.state.lines[0].revenue, "60.00");
  assert.equal(f.state.lines[0].grossProfit, "33.00");
  assert.equal(f.state.sale.paymentMethod, "DIGITAL");
  assert.equal(f.state.sale.notes, "Corrected box");
  assert.equal(balance(f), 60);
});

test("payment and notes correction retains creation timestamp and does not duplicate Funds", async () => {
  const f = fixture(); const created = f.state.sale.createdAt;
  await correctShowSale(f.database, 1, await editFor(f, { paymentMethod: "DIGITAL", notes: "Paid by card" }));
  assert.deepEqual(f.state.sale.createdAt, created);
  assert.equal(f.state.funds.length, 1);
  assert.equal(f.state.sale.paymentMethod, "DIGITAL");
  assert.equal(f.state.sale.notes, "Paid by card");
});

test("delete after a correction restores stock, preserves ledger history and reverses the current revenue once", async () => {
  const f = fixture();
  await correctShowSale(f.database, 1, await editFor(f, { lines: [{ productId: 1, quantity: 1, unitSalePrice: "18.00" }] }));
  const { revision } = await showSaleCorrectionContext(f.database, 1);
  await correctShowSale(f.database, 1, parseSaleCorrection({ revision }, true), true);
  assert.equal(f.state.sale, null);
  assert.equal(f.state.lines.length, 0);
  assert.equal(f.state.allocations.length, 0);
  assert.equal(f.state.batches[0].quantitySold, 0);
  assert.equal(balance(f), 0);
  assert.equal(f.state.funds[0].amount, "30.00");
  assert.equal(f.state.funds[0].saleId, null);
});

for (const deleting of [false, true]) {
  test(`${deleting ? "delete" : "edit"} ledger failure rolls back the entire sale operation`, async () => {
    const f = fixture(); const before = structuredClone(f.state); f.failFunds();
    const edit = await editFor(f, { lines: [{ productId: 1, quantity: 1, unitSalePrice: "15.00" }] });
    await assert.rejects(correctShowSale(f.database, 1, edit, deleting), /Injected ledger failure/);
    assert.deepEqual(f.state, before);
  });
  test(`${deleting ? "delete" : "edit"} revalidates finalization after the form was opened`, async () => {
    const f = fixture(); const edit = await editFor(f);
    f.state.visit.status = "FINALIZED"; f.state.visit.finalizedAt = new Date();
    const before = structuredClone(f.state);
    await assert.rejects(correctShowSale(f.database, 1, edit, deleting), /Show has been finalized/);
    assert.deepEqual(f.state, before);
  });
}

test("stale correction cannot overwrite another edit; transaction takes Show, Sale, visit and batch locks", async () => {
  const f = fixture(); const edit = await editFor(f);
  await correctShowSale(f.database, 1, edit);
  const before = structuredClone(f.state);
  await assert.rejects(correctShowSale(f.database, 1, edit), /changed/);
  assert.deepEqual(f.state, before);
  assert.match(f.locks.join("\n"), /pg_advisory_xact_lock\(86420932\)/);
  for (const table of ["Sale", "ShowVisit", "InventoryBatch"]) assert.match(f.locks.join("\n"), new RegExp(`FROM "${table}".*FOR UPDATE`));
});

test("non-Show, planned, missing ledger and inconsistent inventory sales fail closed", async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.state.visit = null; },
    (f: ReturnType<typeof fixture>) => { f.state.visit.status = "PLANNED"; },
    (f: ReturnType<typeof fixture>) => { f.state.funds = []; },
    (f: ReturnType<typeof fixture>) => { f.state.allocations[0].quantity = 1; },
  ]) {
    const f = fixture(); const edit = await editFor(f); mutate(f); const before = structuredClone(f.state);
    // Refresh the fingerprint for the inconsistent-ledger/allocation checks.
    try { edit.revision = (await showSaleCorrectionContext(f.database, 1)).revision; } catch { /* expected for a locked visit */ }
    await assert.rejects(correctShowSale(f.database, 1, edit)); assert.deepEqual(f.state, before);
  }
});

test("validation rejects accounting overrides, duplicate products, fractions, invalid prices and association manipulation", async () => {
  const f = fixture(); const valid = await editFor(f);
  for (const body of [ { ...valid, cogs: 0 }, { ...valid, showVisitId: 8 }, { ...valid, saleDate: "2026-01-01" },
    { ...valid, lines: [valid.lines[0], valid.lines[0]] },
    ...[0, -1, 1.5].map(quantity => ({ ...valid, lines: [{ ...valid.lines[0], quantity }] })),
    ...["", "NaN", "-1", "1.001", "1000000000"].map(unitSalePrice => ({ ...valid, lines: [{ ...valid.lines[0], unitSalePrice }] })),
    { ...valid, lines: [{ ...valid.lines[0], allocations: [] }] },
  ]) assert.throws(() => parseSaleCorrection(body));
  assert.throws(() => parseSaleCorrection({ revision: valid.revision, saleId: 4 }, true));
  assert.equal(saleRevision((await showSaleCorrectionContext(f.database, 1)).sale), valid.revision);
});

test("sealed corrections respect boxes converted to packs and retain their allocated cost basis", async () => {
  const f = fixture();
  f.state.batches[0].quantityConverted = 1;
  f.state.batches[0].packPoolAllocations = [{ totalCost: "5.00" }];
  await correctShowSale(f.database, 1, await editFor(f, { lines: [{ productId: 1, quantity: 3, unitSalePrice: "15.00" }] }));
  assert.equal(f.state.batches[0].quantitySold, 2);
  assert.equal(f.state.batches[0].quantityConverted, 1);
  assert.deepEqual(f.state.batches[0].packPoolAllocations, [{ totalCost: "5.00" }]);
  assert.equal(f.state.batches[1].quantitySold, 1);
  assert.equal(f.state.lines[0].cogs, "18.00");
});

test("reallocation uses the existing FIFO final-unit residual-cost rule", async () => {
  const f = fixture();
  f.state.batches[0].landedCost = "15.01";
  await correctShowSale(f.database, 1, await editFor(f, { lines: [{ productId: 1, quantity: 3, unitSalePrice: "15.00" }] }));
  assert.equal(f.state.lines[0].cogs, "15.01");
  assert.equal(f.state.allocations[0].totalCost, "15.01");
});
