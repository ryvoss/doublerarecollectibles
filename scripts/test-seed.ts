import "dotenv/config";
import { prisma } from "../src/server/prisma";
import { TEST_DATABASE_NAME, assertDatabaseEnvironment } from "../src/server/environment";

const day = (value: string) => new Date(`${value}T12:00:00.000Z`);
const round = (n: number) => Math.round(n * 100) / 100;

async function main() {
  if (assertDatabaseEnvironment() !== "TEST") throw new Error("Seed is TEST-only.");
  const actual = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  if (actual[0]?.name !== TEST_DATABASE_NAME) throw new Error("Connected database is not TEST; refusing to reset or seed.");
  const counts = await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe(`TRUNCATE TABLE "SaleAllocation", "SaleLine", "Sale", "FundEntry", "InventoryBatch", "OrderLine", "Order", "ShowVisit", "Show", "Product" RESTART IDENTITY CASCADE`);
    const productSpecs = [
      ["MEGA-BOX", "Mega Evolution Booster Box", "BOX", 145],
      ["PRISM-BOX", "Prismatic Evolutions Booster Box", "BOX", 170],
      ["DESTINED-ETB", "Destined Rivals Elite Trainer Box", "ITEM", 85],
      ["SURGING-ETB", "Surging Sparks Elite Trainer Box", "ITEM", 72],
      ["151-BUNDLE", "Scarlet & Violet 151 Booster Bundle", "ITEM", 58],
    ] as const;
    const products = [];
    for (const [itemId, name, unitType, expectedSalePrice] of productSpecs) products.push(await tx.product.create({ data: { itemId, name, type: "SEALED", unitType, sellable: true, active: true, expectedSalePrice } }));
    await tx.product.create({ data: { itemId: "MEGA-CASE", name: "Mega Evolution Booster Case", type: "SEALED", unitType: "CASE", sellable: false, active: true } });
    const batches: { id: number; productId: number; remaining: number; unitCost: number }[] = [];
    const orders = [
      { date: "2026-04-10", lines: [[0, 12, 900], [1, 8, 800]], shipping: 45, tariff: 15, other: 0, adjustment: -40 },
      { date: "2026-06-04", lines: [[0, 10, 830], [2, 16, 720], [3, 12, 540]], shipping: 60, tariff: 0, other: 20, adjustment: 0 },
      { date: "2026-08-02", lines: [[1, 10, 1050], [4, 18, 630], [2, 10, 480]], shipping: 70, tariff: 20, other: 10, adjustment: -35 },
    ] as const;
    let orderIndex = 0;
    for (const spec of orders) {
      const order = await tx.order.create({ data: { orderNumber: `ORD-${String(++orderIndex).padStart(4, "0")}`, orderDate: day(spec.date), status: "FINALIZED", finalizedAt: day(spec.date), shippingCost: spec.shipping, tariffCost: spec.tariff, otherCost: spec.other, adjustment: spec.adjustment } });
      const base = spec.lines.reduce((n, line) => n + line[2], 0);
      const extra = spec.shipping + spec.tariff + spec.other + spec.adjustment;
      let allocated = 0;
      for (let i = 0; i < spec.lines.length; i++) {
        const [productIndex, quantity, productCost] = spec.lines[i];
        const share = i === spec.lines.length - 1 ? round(extra - allocated) : round(extra * productCost / base);
        allocated += share;
        const landedCost = round(productCost + share), unitCost = landedCost / quantity;
        const line = await tx.orderLine.create({ data: { orderId: order.id, purchasedProductId: products[productIndex].id, sellableProductId: products[productIndex].id, quantityPurchased: quantity, productCost, sellableQuantity: quantity, landedCost, landedUnitCost: unitCost } });
        const batch = await tx.inventoryBatch.create({ data: { orderLineId: line.id, sellableProductId: products[productIndex].id, quantityReceived: quantity, landedCost, landedUnitCost: unitCost } });
        batches.push({ id: batch.id, productId: products[productIndex].id, remaining: quantity, unitCost });
      }
      await tx.fundEntry.create({ data: { source: "SEALED", type: "ORDER_PURCHASE", amount: -round(base + extra), transactionDate: day(spec.date), orderId: order.id, note: `Test purchase ${order.orderNumber}` } });
    }
    const draft = await tx.order.create({ data: { orderNumber: "ORD-0004", orderDate: day("2026-09-12"), status: "DRAFT", shippingCost: 12, notes: "Disposable draft order" } });
    await tx.orderLine.create({ data: { orderId: draft.id, purchasedProductId: products[3].id, sellableProductId: products[3].id, quantityPurchased: 4, productCost: 180, sellableQuantity: 4 } });
    await tx.fundEntry.create({ data: { source: "SEALED", type: "OPENING_BALANCE", amount: 6000, transactionDate: day("2026-04-01"), note: "TEST opening sealed funds" } });
    await tx.fundEntry.create({ data: { source: "SINGLES", location: "CASH", type: "OPENING_BALANCE", amount: 300, transactionDate: day("2026-04-01"), note: "TEST starting cash" } });
    await tx.fundEntry.create({ data: { source: "SINGLES", location: "DIGITAL", type: "PERSONAL_CONTRIBUTION", amount: 200, transactionDate: day("2026-04-01"), note: "TEST starting digital" } });
    await tx.fundEntry.create({ data: { source: "SEALED", type: "PERSONAL_CONTRIBUTION", amount: 500, transactionDate: day("2026-07-01"), note: "TEST capital contribution" } });
    const showA = await tx.show.create({ data: { name: "Northside Card Market", active: true } });
    const showB = await tx.show.create({ data: { name: "Lakeside Collectibles Expo", active: true } });
    const visitSpecs = [
      { showId: showA.id, date: "2026-05-16", startValue: 2200, endValue: 2290, startCash: 300, endCash: 370, startDigital: 200, endDigital: 230 },
      { showId: showB.id, date: "2026-06-20", startValue: 2290, endValue: 2245, startCash: 370, endCash: 410, startDigital: 230, endDigital: 280 },
      { showId: showA.id, date: "2026-08-15", startValue: 2245, endValue: 2380, startCash: 410, endCash: 495, startDigital: 280, endDigital: 335 },
      { showId: showB.id, date: "2026-09-05", startValue: 2380, endValue: 2410, startCash: 495, endCash: 545, startDigital: 335, endDigital: 360 },
    ];
    const visits = [];
    for (const spec of visitSpecs) {
      const visit = await tx.showVisit.create({ data: { showId: spec.showId, visitDate: day(spec.date), status: "FINALIZED", startedAt: day(spec.date), finalizedAt: day(spec.date), startingSinglesValue: spec.startValue, endingSinglesValue: spec.endValue, startingCash: spec.startCash, endingCash: spec.endCash, startingDigital: spec.startDigital, endingDigital: spec.endDigital } });
      visits.push(visit);
      for (const [location, amount] of [["CASH", spec.endCash - spec.startCash], ["DIGITAL", spec.endDigital - spec.startDigital]] as const) {
        await tx.fundEntry.create({ data: { source: "SINGLES", location, type: "SINGLES_SHOW_GAIN", amount, transactionDate: day(spec.date), showVisitId: visit.id, note: `TEST ${location.toLowerCase()} Show reconciliation` } });
      }
    }
    const sales = [
      ["2026-05-02", null, "CASH", [[0, 2, 132], [1, 1, 158]]],
      ["2026-05-16", visits[0].id, "DIGITAL", [[0, 3, 145], [1, 2, 175]]],
      ["2026-06-08", null, "DIGITAL", [[2, 3, 82], [3, 2, 69]]],
      ["2026-06-20", visits[1].id, "CASH", [[0, 2, 138], [2, 4, 88]]],
      ["2026-07-12", null, "CASH", [[1, 2, 168], [3, 4, 75]]],
      ["2026-08-15", visits[2].id, "DIGITAL", [[0, 4, 150], [4, 5, 62]]],
      ["2026-08-30", null, "DIGITAL", [[2, 5, 84], [4, 4, 57]]],
      ["2026-09-05", visits[3].id, "CASH", [[1, 3, 180], [3, 6, 70]]],
      ["2026-09-10", null, "DIGITAL", [[0, 2, 148], [4, 3, 60]]],
    ] as const;
    let saleIndex = 0;
    for (const [date, visitId, paymentMethod, lines] of sales) {
      const sale = await tx.sale.create({ data: { saleNumber: `SALE-${String(++saleIndex).padStart(4, "0")}`, saleDate: day(date), paymentMethod, showVisitId: visitId, finalizedAt: day(date) } });
      let saleRevenue = 0;
      for (const [productIndex, quantity, price] of lines) {
        const productId = products[productIndex].id, allocations: { batchId: number; quantity: number; unitCost: number; totalCost: number }[] = [];
        let needed = quantity, cogs = 0;
        for (const batch of batches.filter(b => b.productId === productId)) {
          if (!needed) break;
          const take = Math.min(needed, batch.remaining);
          if (!take) continue;
          const totalCost = round(take * batch.unitCost);
          allocations.push({ batchId: batch.id, quantity: take, unitCost: batch.unitCost, totalCost });
          batch.remaining -= take; needed -= take; cogs += totalCost;
          await tx.inventoryBatch.update({ where: { id: batch.id }, data: { quantitySold: { increment: take } } });
        }
        if (needed) throw new Error(`TEST seed insufficient stock for ${products[productIndex].name}`);
        const revenue = round(quantity * price), profit = round(revenue - cogs);
        const line = await tx.saleLine.create({ data: { saleId: sale.id, productId, quantity, unitSalePrice: price, revenue, cogs: round(cogs), grossProfit: profit, grossMargin: revenue ? profit / revenue : 0 } });
        for (const allocation of allocations) await tx.saleAllocation.create({ data: { saleLineId: line.id, inventoryBatchId: allocation.batchId, quantity: allocation.quantity, unitCost: allocation.unitCost, totalCost: allocation.totalCost } });
        saleRevenue += revenue;
      }
      await tx.fundEntry.create({ data: { source: "SEALED", type: "SEALED_SALE", amount: round(saleRevenue), transactionDate: day(date), saleId: sale.id, note: `TEST ${sale.saleNumber}` } });
    }
    return {
      products: await tx.product.count(), orders: await tx.order.count(), orderLines: await tx.orderLine.count(), inventoryBatches: await tx.inventoryBatch.count(), sales: await tx.sale.count(), saleLines: await tx.saleLine.count(), saleAllocations: await tx.saleAllocation.count(), shows: await tx.show.count(), showVisits: await tx.showVisit.count(), fundEntries: await tx.fundEntry.count(),
    };
  });
  console.log("Seeded isolated TEST database:", counts);
}

main().catch(error => { console.error("TEST seed failed:", error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
