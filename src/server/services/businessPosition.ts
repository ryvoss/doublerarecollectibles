import { prisma } from "../prisma";
import { remainingBatchCost, splitRemainingBatchCost } from "./inventoryCost";

const money = (value: number) => (Math.round(value * 100) / 100).toFixed(2);

type BusinessPositionProduct = {
  expectedSalePrice: unknown | null;
  defaultPackPrice: unknown | null;
  inventoryBatches: Array<{
    quantityPurchased: number;
    quantityReceived: number;
    quantitySold: number;
    quantityConverted: number;
    landedCost: unknown;
    landedUnitCost: unknown;
    saleAllocations: Array<{ totalCost: unknown }>;
    packPoolAllocations: Array<{ totalCost: unknown }>;
  }>;
  packPoolsAsSource: Array<{ packsRemaining: number; remainingCostBasis: unknown }>;
};

export function calculateSealedInventoryPosition(products: BusinessPositionProduct[]) {
  let sealedInventoryCost = 0;
  let sealedInventoryOnHandCost = 0;
  let sealedInventoryInboundCost = 0;
  let sealedExpectedRetail = 0;
  let missingExpectedPriceProducts = 0;
  let missingExpectedPriceUnits = 0;
  for (const product of products) {
    let productUnits = 0;
    let packUnits = 0;
    for (const batch of product.inventoryBatches) {
      const ownedRemaining = batch.quantityPurchased - batch.quantitySold - batch.quantityConverted;
      sealedInventoryCost += remainingBatchCost(batch);
      const splitCost = splitRemainingBatchCost(batch);
      sealedInventoryOnHandCost += splitCost.onHandCost;
      sealedInventoryInboundCost += splitCost.inboundCost;
      productUnits += ownedRemaining;
      if (product.expectedSalePrice !== null) sealedExpectedRetail += ownedRemaining * Number(product.expectedSalePrice);
    }
    for (const pool of product.packPoolsAsSource) {
      // The Box batch cost transferred to this pool was already removed from
      // remainingBatchCost, so adding the pool cost includes it exactly once.
      sealedInventoryCost += Number(pool.remainingCostBasis);
      sealedInventoryOnHandCost += Number(pool.remainingCostBasis);
      packUnits += pool.packsRemaining;
      if (product.defaultPackPrice !== null) sealedExpectedRetail += pool.packsRemaining * Number(product.defaultPackPrice);
    }
    const missingBoxUnits = productUnits > 0 && product.expectedSalePrice === null ? productUnits : 0;
    const missingPackUnits = packUnits > 0 && product.defaultPackPrice === null ? packUnits : 0;
    if (missingBoxUnits + missingPackUnits > 0) {
      missingExpectedPriceProducts++;
      missingExpectedPriceUnits += missingBoxUnits + missingPackUnits;
    }
  }
  return {
    sealedInventoryCost,
    sealedInventoryOnHandCost,
    sealedInventoryInboundCost,
    sealedExpectedRetail,
    missingExpectedPriceProducts,
    missingExpectedPriceUnits,
  };
}

export async function calculateBusinessPosition() {
  const [fundGroups, products, visits] = await Promise.all([
    prisma.fundEntry.groupBy({ by: ["source"], _sum: { amount: true } }),
    prisma.product.findMany({
      where: { active: true, sellable: true },
      select: {
        expectedSalePrice: true,
        inventoryBatches: { select: { quantityPurchased: true, quantityReceived: true, quantitySold: true, quantityConverted: true, landedCost: true, landedUnitCost: true, saleAllocations: { select: { totalCost: true } }, packPoolAllocations: { select: { totalCost: true } } } },
        packPoolsAsSource: { select: { packsRemaining: true, remainingCostBasis: true } },
        defaultPackPrice: true,
      },
    }),
    prisma.showVisit.findMany({
      where: { OR: [{ status: "ACTIVE" }, { status: "FINALIZED", endingSinglesValue: { not: null } }] },
      select: { status: true, startedAt: true, finalizedAt: true, visitDate: true, startingSinglesValue: true, endingSinglesValue: true },
    }),
  ]);
  const sealedFunds = Number(fundGroups.find(group => group.source === "SEALED")?._sum.amount ?? 0);
  const singlesFunds = Number(fundGroups.find(group => group.source === "SINGLES")?._sum.amount ?? 0);
  const { sealedInventoryCost, sealedInventoryOnHandCost, sealedInventoryInboundCost, sealedExpectedRetail, missingExpectedPriceProducts, missingExpectedPriceUnits } =
    calculateSealedInventoryPosition(products);
  const valuation = visits.map(visit => ({
    value: visit.status === "ACTIVE" ? Number(visit.startingSinglesValue) : Number(visit.endingSinglesValue),
    recordedAt: visit.status === "ACTIVE" ? visit.startedAt ?? visit.visitDate : visit.finalizedAt ?? visit.visitDate,
    source: visit.status === "ACTIVE" ? "ACTIVE_SHOW_START" as const : "FINALIZED_SHOW_END" as const,
  })).filter(item => Number.isFinite(item.value)).sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())[0] ?? null;
  const totalBusinessFunds = sealedFunds + singlesFunds;
  const totalBusinessValue = valuation ? totalBusinessFunds + sealedInventoryCost + valuation.value : null;
  return {
    sealedFunds: Number(money(sealedFunds)), singlesFunds: Number(money(singlesFunds)), totalBusinessFunds: Number(money(totalBusinessFunds)),
    sealedInventoryCost: Number(money(sealedInventoryCost)),
    sealedInventoryOnHandCost: Number(money(sealedInventoryOnHandCost)),
    sealedInventoryInboundCost: Number(money(sealedInventoryInboundCost)),
    sealedExpectedRetail: Number(money(sealedExpectedRetail)),
    expectedPricingComplete: missingExpectedPriceProducts === 0,
    missingExpectedPriceProducts,
    missingExpectedPriceUnits,
    singlesInventoryValue: valuation ? Number(money(valuation.value)) : null,
    singlesValuationRecordedAt: valuation?.recordedAt ?? null, singlesValuationSource: valuation?.source ?? null,
    totalBusinessValue: totalBusinessValue === null ? null : Number(money(totalBusinessValue)),
  };
}

export async function captureBusinessPositionSnapshot(now = new Date()) {
  const position = await calculateBusinessPosition();
  const snapshotDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const data = {
    snapshotAt: now,
    totalBusinessFunds: money(position.totalBusinessFunds), sealedFunds: money(position.sealedFunds), singlesFunds: money(position.singlesFunds),
    sealedInventoryCost: money(position.sealedInventoryCost),
    sealedInventoryOnHandCost: money(position.sealedInventoryOnHandCost),
    sealedInventoryInboundCost: money(position.sealedInventoryInboundCost),
    singlesInventoryValue: position.singlesInventoryValue === null ? null : money(position.singlesInventoryValue),
    totalBusinessValue: position.totalBusinessValue === null ? null : money(position.totalBusinessValue), sealedExpectedRetail: money(position.sealedExpectedRetail),
    expectedPricingComplete: position.expectedPricingComplete,
    missingExpectedPriceProducts: position.missingExpectedPriceProducts,
    missingExpectedPriceUnits: position.missingExpectedPriceUnits,
  };
  return prisma.businessPositionSnapshot.upsert({ where: { snapshotDate }, create: { snapshotDate, ...data }, update: data });
}
