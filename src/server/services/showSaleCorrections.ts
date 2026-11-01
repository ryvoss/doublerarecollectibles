import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { simulateFifoConsumption } from "../../shared/fifoSimulation";
import { allocatedBatchCost } from "./inventoryCost";

export class SaleCorrectionError extends Error {
  status: number;
  constructor(message: string, status = 409) { super(message); this.status = status; }
}

const include = { lines: { orderBy: { id: "asc" }, include: { product: true, allocations: { orderBy: { id: "asc" } } } }, showVisit: true, fundEntry: true } as const;
type CorrectionSale = Prisma.SaleGetPayload<{ include: typeof include }>;
const cents = (value: unknown) => Math.round(Number(value) * 100);
const money = (value: number) => (value / 100).toFixed(2);
export const saleRevision = (sale: CorrectionSale) => createHash("sha256").update(JSON.stringify(sale)).digest("hex");

export function assertEditableShowSale(sale: CorrectionSale | null): asserts sale is CorrectionSale {
  if (!sale) throw new SaleCorrectionError("Sale not found", 404);
  if (!sale.showVisit) throw new SaleCorrectionError("Normal sale corrections are only available for Show-linked sales.");
  if (sale.showVisit.finalizedAt || sale.showVisit.status === "FINALIZED") {
    throw new SaleCorrectionError("This sale cannot be edited because the Show has been finalized.");
  }
  if (sale.showVisit.status !== "ACTIVE") throw new SaleCorrectionError("The Show must be active to correct this sale.");
}

type Edit = { revision: string; paymentMethod: "CASH" | "DIGITAL"; notes: string | null;
  lines: { productId: number; quantity: number; unitSalePrice: string }[] };
export function parseSaleCorrection(body: unknown, deleting = false): Edit {
  const fail = () => { throw new SaleCorrectionError("Invalid sale correction. Supply a current revision, payment method, notes, and valid sale lines only.", 400); };
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail();
  const data = body as Record<string, unknown>;
  const allowed = deleting ? ["revision"] : ["revision", "paymentMethod", "notes", "lines"];
  if (Object.keys(data).some(key => !allowed.includes(key)) || typeof data.revision !== "string" || !/^[a-f0-9]{64}$/.test(data.revision)) return fail();
  if (deleting) return { revision: data.revision, paymentMethod: "CASH", notes: null, lines: [] };
  if (data.paymentMethod !== "CASH" && data.paymentMethod !== "DIGITAL") return fail();
  if (data.notes !== null && (typeof data.notes !== "string" || data.notes.length > 10000)) return fail();
  if (!Array.isArray(data.lines) || !data.lines.length || data.lines.length > 100) return fail();
  const products = new Set<number>();
  const lines = data.lines.map((line: unknown) => {
    if (!line || typeof line !== "object" || Array.isArray(line)) return fail();
    const item = line as Record<string, unknown>;
    if (Object.keys(item).some(key => !["productId", "quantity", "unitSalePrice"].includes(key)) ||
        !Number.isSafeInteger(item.productId) || Number(item.productId) <= 0 || products.has(Number(item.productId)) ||
        !Number.isSafeInteger(item.quantity) || Number(item.quantity) <= 0 || Number(item.quantity) > 2147483647 ||
        !["string", "number"].includes(typeof item.unitSalePrice) || !/^\d+(\.\d{1,2})?$/.test(String(item.unitSalePrice)) ||
        cents(item.unitSalePrice) > 9999999999 || cents(item.unitSalePrice) * Number(item.quantity) > 9999999999) return fail();
    products.add(Number(item.productId));
    return { productId: Number(item.productId), quantity: Number(item.quantity), unitSalePrice: money(cents(item.unitSalePrice)) };
  });
  return { revision: data.revision, paymentMethod: data.paymentMethod, notes: typeof data.notes === "string" ? data.notes.trim() || null : null, lines };
}

export async function showSaleCorrectionContext(database: Pick<PrismaClient, "sale">, id: number) {
  const sale = await database.sale.findUnique({ where: { id }, include });
  assertEditableShowSale(sale);
  return { sale, revision: saleRevision(sale) };
}

// The Show lock is also held by finalization and pack operations. The visit row
// lock additionally serializes against the existing sealed-sale create route.
export async function correctShowSale(database: Pick<PrismaClient, "$transaction">, id: number, edit: Edit, deleting = false) {
  return database.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(86420932)`;
    await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${id} FOR UPDATE`;
    const sale = await tx.sale.findUnique({ where: { id }, include });
    assertEditableShowSale(sale);
    await tx.$queryRaw`SELECT id FROM "ShowVisit" WHERE id = ${sale.showVisitId} FOR UPDATE`;
    const visit = await tx.showVisit.findUnique({ where: { id: sale.showVisitId! } });
    assertEditableShowSale({ ...sale, showVisit: visit });
    if (saleRevision(sale) !== edit.revision) throw new SaleCorrectionError("This sale or Show changed. Close and reopen the sale before trying again.");
    await tx.$queryRaw`SELECT id FROM "SaleLine" WHERE "saleId" = ${id} ORDER BY id FOR UPDATE`;
    await tx.$queryRaw`SELECT a.id FROM "SaleAllocation" a JOIN "SaleLine" l ON l.id = a."saleLineId" WHERE l."saleId" = ${id} ORDER BY a.id FOR UPDATE OF a`;
    if (!sale.fundEntry || sale.fundEntry.source !== "SEALED" || sale.fundEntry.type !== "SEALED_SALE") {
      throw new SaleCorrectionError("The original sale Funds entry is missing or inconsistent. Review it before correcting this sale.");
    }
    const productIds = [...new Set([...sale.lines.map(line => line.productId), ...edit.lines.map(line => line.productId)])].sort((a, b) => a - b);
    for (const productId of productIds) {
      await tx.$queryRaw`SELECT id FROM "InventoryBatch" WHERE "sellableProductId" = ${productId} ORDER BY id FOR UPDATE`;
    }
    for (const line of sale.lines) {
      if (line.allocations.reduce((sum, allocation) => sum + allocation.quantity, 0) !== line.quantity) {
        throw new SaleCorrectionError("Sale allocations are inconsistent. No changes were made.");
      }
      for (const allocation of line.allocations) {
        const restored = await tx.inventoryBatch.updateMany({ where: { id: allocation.inventoryBatchId, quantitySold: { gte: allocation.quantity } }, data: { quantitySold: { decrement: allocation.quantity } } });
        if (restored.count !== 1) throw new SaleCorrectionError("Inventory changed. No changes were made.");
      }
      await tx.saleAllocation.deleteMany({ where: { saleLineId: line.id } });
    }
    await tx.saleLine.deleteMany({ where: { saleId: id } });
    let newRevenue = 0;
    if (!deleting) {
      for (const line of edit.lines) {
        const product = await tx.product.findUnique({ where: { id: line.productId } });
        if (!product || !product.active || !product.sellable || product.unitType === "CASE" || product.type !== "SEALED") {
          throw new SaleCorrectionError("Choose an active, sellable sealed product.", 400);
        }
        const batches = await tx.inventoryBatch.findMany({ where: { sellableProductId: line.productId }, include: { saleAllocations: true, packPoolAllocations: true, orderLine: { include: { order: true } } } });
        const fifo = simulateFifoConsumption(batches.map(batch => ({ ...batch, orderDate: batch.orderLine.order.orderDate, landedCost: Number(batch.landedCost), landedUnitCost: Number(batch.landedUnitCost), previouslyAllocatedCost: allocatedBatchCost(batch) })), line.quantity);
        if (!fifo.fulfilled) throw new SaleCorrectionError(`Insufficient inventory for ${product.name}. The original sale has been preserved.`);
        const revenue = cents(line.unitSalePrice) * line.quantity;
        const profit = revenue - cents(fifo.cogs);
        newRevenue += revenue;
        const created = await tx.saleLine.create({ data: { saleId: id, ...line, revenue: money(revenue), cogs: fifo.cogs, grossProfit: money(profit), grossMargin: (revenue ? profit / revenue : 0).toFixed(6) } });
        for (const allocation of fifo.allocations) {
          const batch = batches.find(item => item.id === allocation.inventoryBatchId)!;
          const consumed = await tx.inventoryBatch.updateMany({ where: { id: batch.id, updatedAt: batch.updatedAt }, data: { quantitySold: { increment: allocation.quantity } } });
          if (consumed.count !== 1) throw new SaleCorrectionError("Inventory changed. Review and try again.");
          await tx.saleAllocation.create({ data: { saleLineId: created.id, ...allocation } });
        }
      }
      await tx.sale.update({ where: { id }, data: { paymentMethod: edit.paymentMethod, notes: edit.notes } });
    }
    const originalRevenue = sale.lines.reduce((sum, line) => sum + cents(line.revenue), 0);
    const adjustment = newRevenue - originalRevenue;
    if (adjustment !== 0) {
      await tx.fundEntry.create({ data: { source: "SEALED", type: "MANUAL_ADJUSTMENT", amount: money(adjustment), transactionDate: sale.saleDate, showVisitId: sale.showVisitId,
        note: `${deleting ? "Deleted" : "Corrected"} ${sale.saleNumber} (Sale ID ${id}): revenue ${money(originalRevenue)} -> ${money(newRevenue)}` } });
    }
    if (deleting) {
      // Preserve the original immutable ledger amount and number, even after
      // deleting the Sale. The unique original sale link must be detached.
      await tx.fundEntry.update({ where: { id: sale.fundEntry.id }, data: { saleId: null } });
      await tx.sale.delete({ where: { id } });
      return { deleted: true };
    }
    return { sale: await tx.sale.findUnique({ where: { id }, include }) };
  }, { isolationLevel: "Serializable", timeout: 15000 });
}
