import type { Prisma, PrismaClient } from "../../generated/prisma/client";

export const packPerformanceSnapshotSelect = {
  id: true,
  showVisitId: true,
  sourceBoxProductId: true,
  packDisplayName: true,
  startingPacks: true,
  addedPacks: true,
  endingPacks: true,
  giveaways: true,
  damaged: true,
  packsSold: true,
  declaredValuePerPack: true,
  declaredSalesValue: true,
  estimatedCogs: true,
  giveawayCostBasis: true,
  damagedCostBasis: true,
  actualRevenue: true,
  actualCashRevenue: true,
  actualDigitalRevenue: true,
  actualGrossProfit: true,
  actualGrossMargin: true,
  finalizedAt: true,
  sourceBoxProduct: {
    select: {
      id: true,
      itemId: true,
      name: true,
      defaultPackPrice: true,
    },
  },
  showVisit: {
    select: {
      showId: true,
      visitDate: true,
      show: { select: { name: true } },
    },
  },
} satisfies Prisma.ShowPackSnapshotSelect;

export const packPerformancePoolSelect = {
  sourceBoxProductId: true,
  packsRemaining: true,
  remainingCostBasis: true,
} satisfies Prisma.PackPoolSelect;

export type PackPerformanceSnapshot = Prisma.ShowPackSnapshotGetPayload<{
  select: typeof packPerformanceSnapshotSelect;
}>;
export type PackPerformancePool = Prisma.PackPoolGetPayload<{
  select: typeof packPerformancePoolSelect;
}>;

type PackPerformanceDatabase = Pick<PrismaClient, "showPackSnapshot" | "packPool">;

type PackPerformanceFilters = {
  visitId?: number;
  showId?: number;
  productId?: number;
  from?: Date;
  toExclusive?: Date;
};

const toCents = (value: unknown) => Math.round(Number(value ?? 0) * 100);
const fromCents = (value: number) => Number((value / 100).toFixed(2));

export type PackPerformanceSummary = {
  snapshotCount: number;
  productCount: number;
  packsSold: number;
  declaredSalesValue: number;
  cogs: number;
  giveawayCost: number;
  damagedCost: number;
  actualRevenue: number | null;
  cashRevenue: number | null;
  digitalRevenue: number | null;
  grossProfit: number | null;
  grossMargin: number | null;
  actualRevenueCount: number;
  declaredOnlyCount: number;
  actualRevenueComplete: boolean;
  revenueMode: "ACTUAL" | "DECLARED_ONLY" | "MIXED";
};

export function emptyPackPerformanceSummary(): PackPerformanceSummary {
  return {
    snapshotCount: 0,
    productCount: 0,
    packsSold: 0,
    declaredSalesValue: 0,
    cogs: 0,
    giveawayCost: 0,
    damagedCost: 0,
    actualRevenue: null,
    cashRevenue: null,
    digitalRevenue: null,
    grossProfit: null,
    grossMargin: null,
    actualRevenueCount: 0,
    declaredOnlyCount: 0,
    actualRevenueComplete: false,
    revenueMode: "DECLARED_ONLY",
  };
}

export function aggregatePackPerformance(
  snapshots: PackPerformanceSnapshot[],
  pools: PackPerformancePool[] = [],
) {
  const remainingByProduct = new Map<number, { packs: number; costCents: number }>();
  for (const pool of pools) {
    const remaining = remainingByProduct.get(pool.sourceBoxProductId) ?? { packs: 0, costCents: 0 };
    remaining.packs += pool.packsRemaining;
    remaining.costCents += toCents(pool.remainingCostBasis);
    remainingByProduct.set(pool.sourceBoxProductId, remaining);
  }

  type ProductAccumulator = {
    sourceBoxProductId: number;
    sourceItemId: string;
    sourceBoxProductName: string;
    packDisplayName: string;
    defaultPackPrice: number | null;
    latestDeclaredValuePerPack: number;
    latestVisitTime: number;
    snapshotCount: number;
    visitIds: Set<number>;
    startingPacks: number;
    addedPacks: number;
    endingPacks: number;
    giveaways: number;
    damaged: number;
    packsSold: number;
    declaredSalesCents: number;
    cogsCents: number;
    giveawayCostCents: number;
    damagedCostCents: number;
    actualRevenueCents: number;
    cashRevenueCents: number;
    digitalRevenueCents: number;
    grossProfitCents: number;
    actualRevenueCount: number;
  };

  const grouped = new Map<number, ProductAccumulator>();
  for (const snapshot of snapshots) {
    const visitTime = snapshot.showVisit.visitDate.getTime();
    let product = grouped.get(snapshot.sourceBoxProductId);
    if (!product) {
      product = {
        sourceBoxProductId: snapshot.sourceBoxProductId,
        sourceItemId: snapshot.sourceBoxProduct.itemId,
        sourceBoxProductName: snapshot.sourceBoxProduct.name,
        packDisplayName: snapshot.packDisplayName,
        defaultPackPrice: snapshot.sourceBoxProduct.defaultPackPrice === null
          ? null
          : Number(snapshot.sourceBoxProduct.defaultPackPrice),
        latestDeclaredValuePerPack: Number(snapshot.declaredValuePerPack),
        latestVisitTime: visitTime,
        snapshotCount: 0,
        visitIds: new Set(),
        startingPacks: 0,
        addedPacks: 0,
        endingPacks: 0,
        giveaways: 0,
        damaged: 0,
        packsSold: 0,
        declaredSalesCents: 0,
        cogsCents: 0,
        giveawayCostCents: 0,
        damagedCostCents: 0,
        actualRevenueCents: 0,
        cashRevenueCents: 0,
        digitalRevenueCents: 0,
        grossProfitCents: 0,
        actualRevenueCount: 0,
      };
      grouped.set(snapshot.sourceBoxProductId, product);
    }
    if (visitTime >= product.latestVisitTime) {
      product.latestVisitTime = visitTime;
      product.latestDeclaredValuePerPack = Number(snapshot.declaredValuePerPack);
    }
    product.snapshotCount += 1;
    product.visitIds.add(snapshot.showVisitId);
    product.startingPacks += snapshot.startingPacks;
    product.addedPacks += snapshot.addedPacks;
    product.endingPacks += snapshot.endingPacks ?? 0;
    product.giveaways += snapshot.giveaways;
    product.damaged += snapshot.damaged;
    product.packsSold += snapshot.packsSold ?? 0;
    product.declaredSalesCents += toCents(snapshot.declaredSalesValue);
    product.cogsCents += toCents(snapshot.estimatedCogs);
    product.giveawayCostCents += toCents(snapshot.giveawayCostBasis);
    product.damagedCostCents += toCents(snapshot.damagedCostBasis);
    if (snapshot.actualRevenue !== null) {
      product.actualRevenueCount += 1;
      product.actualRevenueCents += toCents(snapshot.actualRevenue);
      product.cashRevenueCents += toCents(snapshot.actualCashRevenue);
      product.digitalRevenueCents += toCents(snapshot.actualDigitalRevenue);
      product.grossProfitCents += toCents(snapshot.actualGrossProfit);
    }
  }

  const products = [...grouped.values()].map((product) => {
    const remaining = remainingByProduct.get(product.sourceBoxProductId) ?? { packs: 0, costCents: 0 };
    const retailUnitValue = product.defaultPackPrice ?? product.latestDeclaredValuePerPack;
    const remainingRetailCents = Math.round(retailUnitValue * remaining.packs * 100);
    const actualRevenue = product.actualRevenueCount > 0 ? fromCents(product.actualRevenueCents) : null;
    const grossProfit = product.actualRevenueCount > 0 ? fromCents(product.grossProfitCents) : null;
    const declaredOnlyCount = product.snapshotCount - product.actualRevenueCount;
    return {
      sourceBoxProductId: product.sourceBoxProductId,
      sourceItemId: product.sourceItemId,
      sourceBoxProductName: product.sourceBoxProductName,
      packDisplayName: product.packDisplayName,
      snapshotCount: product.snapshotCount,
      visitCount: product.visitIds.size,
      startingPacks: product.startingPacks,
      addedPacks: product.addedPacks,
      endingPacks: product.endingPacks,
      giveaways: product.giveaways,
      damaged: product.damaged,
      packsSold: product.packsSold,
      declaredValuePerPack: product.latestDeclaredValuePerPack,
      declaredSalesValue: fromCents(product.declaredSalesCents),
      cogs: fromCents(product.cogsCents),
      giveawayCost: fromCents(product.giveawayCostCents),
      damagedCost: fromCents(product.damagedCostCents),
      actualRevenue,
      cashRevenue: product.actualRevenueCount > 0 ? fromCents(product.cashRevenueCents) : null,
      digitalRevenue: product.actualRevenueCount > 0 ? fromCents(product.digitalRevenueCents) : null,
      grossProfit,
      grossMargin: product.actualRevenueCount > 0
        ? (product.actualRevenueCents > 0 ? product.grossProfitCents / product.actualRevenueCents : 0)
        : null,
      actualRevenueCount: product.actualRevenueCount,
      declaredOnlyCount,
      actualRevenueComplete: product.actualRevenueCount === product.snapshotCount,
      revenueMode: product.actualRevenueCount === 0
        ? "DECLARED_ONLY" as const
        : declaredOnlyCount === 0 ? "ACTUAL" as const : "MIXED" as const,
      remaining: {
        packs: remaining.packs,
        costBasis: fromCents(remaining.costCents),
        retailUnitValue,
        retailValueSource: product.defaultPackPrice !== null ? "DEFAULT_PACK_PRICE" as const : "LATEST_DECLARED_VALUE" as const,
        retailValue: fromCents(remainingRetailCents),
        potentialGrossProfit: fromCents(remainingRetailCents - remaining.costCents),
      },
    };
  }).sort((a, b) => a.packDisplayName.localeCompare(b.packDisplayName) || a.sourceBoxProductId - b.sourceBoxProductId);

  const snapshotCount = snapshots.length;
  const actualRevenueCount = products.reduce((sum, product) => sum + product.actualRevenueCount, 0);
  const actualRevenueCents = products.reduce((sum, product) => sum + toCents(product.actualRevenue), 0);
  const grossProfitCents = products.reduce((sum, product) => sum + toCents(product.grossProfit), 0);
  const declaredOnlyCount = snapshotCount - actualRevenueCount;
  const summary: PackPerformanceSummary = {
    snapshotCount,
    productCount: products.length,
    packsSold: products.reduce((sum, product) => sum + product.packsSold, 0),
    declaredSalesValue: fromCents(products.reduce((sum, product) => sum + toCents(product.declaredSalesValue), 0)),
    cogs: fromCents(products.reduce((sum, product) => sum + toCents(product.cogs), 0)),
    giveawayCost: fromCents(products.reduce((sum, product) => sum + toCents(product.giveawayCost), 0)),
    damagedCost: fromCents(products.reduce((sum, product) => sum + toCents(product.damagedCost), 0)),
    actualRevenue: actualRevenueCount > 0 ? fromCents(actualRevenueCents) : null,
    cashRevenue: actualRevenueCount > 0
      ? fromCents(products.reduce((sum, product) => sum + toCents(product.cashRevenue), 0))
      : null,
    digitalRevenue: actualRevenueCount > 0
      ? fromCents(products.reduce((sum, product) => sum + toCents(product.digitalRevenue), 0))
      : null,
    grossProfit: actualRevenueCount > 0 ? fromCents(grossProfitCents) : null,
    grossMargin: actualRevenueCents > 0 ? grossProfitCents / actualRevenueCents : actualRevenueCount > 0 ? 0 : null,
    actualRevenueCount,
    declaredOnlyCount,
    actualRevenueComplete: snapshotCount > 0 && actualRevenueCount === snapshotCount,
    revenueMode: actualRevenueCount === 0
      ? "DECLARED_ONLY"
      : declaredOnlyCount === 0 ? "ACTUAL" : "MIXED",
  };

  return { summary, products };
}

export async function loadPackPerformance(
  database: PackPerformanceDatabase,
  filters: PackPerformanceFilters,
) {
  const snapshots = await database.showPackSnapshot.findMany({
    where: {
      finalizedAt: { not: null },
      ...(filters.visitId ? { showVisitId: filters.visitId } : {}),
      ...(filters.productId ? { sourceBoxProductId: filters.productId } : {}),
      showVisit: {
        status: "FINALIZED",
        ...(filters.showId ? { showId: filters.showId } : {}),
        ...(filters.from || filters.toExclusive ? {
          visitDate: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.toExclusive ? { lt: filters.toExclusive } : {}),
          },
        } : {}),
      },
    },
    select: packPerformanceSnapshotSelect,
    orderBy: [{ showVisit: { visitDate: "asc" } }, { id: "asc" }],
  });
  const productIds = [...new Set(snapshots.map((snapshot) => snapshot.sourceBoxProductId))];
  const pools = productIds.length === 0 ? [] : await database.packPool.findMany({
    where: { sourceBoxProductId: { in: productIds } },
    select: packPerformancePoolSelect,
  });
  return { ...aggregatePackPerformance(snapshots, pools), snapshots, pools };
}
