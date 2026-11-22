import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import type { PlanningHorizon, ReinvestmentReport } from "../../shared/reinvestment";
import { inboundBatchQuantity, remainingBatchQuantity } from "../services/inventoryCost";
import { aggregateShowProductPerformance } from "./showProductPerformance";
import { rankInvestments, scoreInvestment } from "./reinvestment";

const DAY = 86_400_000;
export function businessDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function investmentWindow(asOf: string) {
  const end = Date.parse(`${asOf}T00:00:00Z`);
  return { start: new Date(end - 29 * DAY), previousStart: new Date(end - 89 * DAY), endExclusive: new Date(end + DAY), day: end };
}
const toCents = (value: Prisma.Decimal) => BigInt(value.toFixed(2).replace(".", ""));
export async function loadReinvestment(database: Pick<PrismaClient, "product" | "saleLine">, horizon: PlanningHorizon, asOf = businessDate()): Promise<ReinvestmentReport> {
  const window = investmentWindow(asOf);
  const eligibleProduct = { active: true, sellable: true, type: "SEALED" as const };
  // Two bulk reads with batched relation loading; no per-product queries or lifetime sales scan.
  const [products, lines] = await Promise.all([
    database.product.findMany({ where: eligibleProduct, select: {
      id: true, name: true, itemId: true, reorderPoint: true, unitType: true, quantityPerParent: true,
      parentProduct: { select: { unitType: true, active: true } },
      inventoryBatches: { select: {
        quantityPurchased: true, quantityReceived: true, quantitySold: true, quantityConverted: true,
        receiptEvents: { where: { type: "RECEIVED", quantityDelta: { gt: 0 }, occurredAt: { lt: window.endExclusive } }, orderBy: { occurredAt: "asc" }, take: 1, select: { occurredAt: true } },
      } },
    } }),
    database.saleLine.findMany({ where: { product: eligibleProduct, sale: { saleDate: { gte: window.previousStart, lt: window.endExclusive } } }, select: {
      productId: true, saleId: true, quantity: true, revenue: true, cogs: true, grossProfit: true,
      product: { select: { itemId: true, name: true } }, sale: { select: { saleDate: true } },
      allocations: { select: { quantity: true, totalCost: true } },
    } }),
  ]);
  // Same stored financial aggregation as the existing Show product-performance report.
  // Show-linked sales appear once in these SaleLines; Show totals are never added again.
  const current = lines.filter(line => line.sale.saleDate >= window.start);
  const financial = new Map(aggregateShowProductPerformance(current).products.map(row => [row.productId, row]));
  const byProduct = new Map<number, typeof lines>();
  for (const line of lines) { const group = byProduct.get(line.productId) ?? []; group.push(line); byProduct.set(line.productId, group); }
  const items = rankInvestments(products.map(product => {
    const history = byProduct.get(product.id) ?? [];
    const recent = history.filter(line => line.sale.saleDate >= window.start);
    const money = financial.get(product.id);
    const firstReceipt = product.inventoryBatches.flatMap(batch => batch.receiptEvents.map(event => event.occurredAt.getTime()));
    const observed = [...firstReceipt, ...history.map(line => line.sale.saleDate.getTime())];
    const firstHistory = observed.length ? Math.min(...observed) : null;
    const lastSale = history.length ? Math.max(...history.map(line => line.sale.saleDate.getTime())) : null;
    const onHand = product.inventoryBatches.reduce((total, batch) => total + remainingBatchQuantity(batch), 0);
    const inbound = product.inventoryBatches.reduce((total, batch) => total + inboundBatchQuantity(batch), 0);
    // Sales record allocation-derived COGS. Fail closed on missing/inconsistent history rather than inventing a new cost.
    const costsReconcile = onHand >= 0 && inbound >= 0 && recent.every(line =>
      line.allocations.reduce((sum, allocation) => sum + allocation.quantity, 0) === line.quantity &&
      line.allocations.reduce((sum, allocation) => sum + toCents(allocation.totalCost), 0n) === toCents(line.cogs) &&
      toCents(line.revenue) - toCents(line.cogs) === toCents(line.grossProfit));
    return scoreInvestment({
      productId: product.id, productName: product.name, itemId: product.itemId, onHand, inbound, reorderPoint: product.reorderPoint,
      units30: money?.unitsSold ?? 0,
      unitsPrevious60: history.filter(line => line.sale.saleDate < window.start).reduce((sum, line) => sum + line.quantity, 0),
      revenue: Number(money?.revenue ?? 0), cogs: Number(money?.cogs ?? 0), grossProfit: Number(money?.grossProfit ?? 0),
      transactions30: new Set(recent.map(line => line.saleId)).size,
      sellingDays30: new Set(recent.map(line => line.sale.saleDate.toISOString().slice(0, 10))).size,
      daysSinceLastSale: lastSale === null ? null : Math.max(0, Math.floor((window.day - lastSale) / DAY)),
      historyDays: firstHistory === null ? null : Math.max(0, Math.floor((window.day - firstHistory) / DAY)), costsReconcile,
      unitsPerCase: product.unitType === "BOX" && product.parentProduct?.active && product.parentProduct.unitType === "CASE" && (product.quantityPerParent ?? 0) > 0 ? product.quantityPerParent : null,
    }, horizon);
  }));
  return { asOf, currentFrom: window.start.toISOString().slice(0, 10), previousFrom: window.previousStart.toISOString().slice(0, 10), horizon, items, topOpportunities: items.filter(item => item.actionable).slice(0, 5) };
}
