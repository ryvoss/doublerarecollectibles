import type { Prisma, PrismaClient } from "../../generated/prisma/client";

const packInventorySelect = {
  sourceBoxProductId: true,
  packDisplayName: true,
  packsRemaining: true,
  remainingCostBasis: true,
  sourceBoxProduct: {
    select: {
      id: true,
      itemId: true,
      name: true,
      active: true,
      sellable: true,
      unitType: true,
      packDisplayName: true,
      defaultPackPrice: true,
    },
  },
} satisfies Prisma.PackPoolSelect;

export type PackInventoryPool = Prisma.PackPoolGetPayload<{ select: typeof packInventorySelect }>;
type PackInventoryDatabase = Pick<PrismaClient, "packPool">;

const toCents = (value: unknown) => Math.round(Number(value ?? 0) * 100);
const fromCents = (value: number) => Number((value / 100).toFixed(2));

export function aggregatePackInventory(pools: PackInventoryPool[]) {
  const grouped = new Map<number, {
    sourceBoxProductId: number;
    itemId: string;
    sourceBoxProductName: string;
    packDisplayName: string;
    defaultPackPrice: number | null;
    packsOnHand: number;
    costCents: number;
    poolCount: number;
  }>();

  for (const pool of pools) {
    const source = pool.sourceBoxProduct;
    const row = grouped.get(pool.sourceBoxProductId) ?? {
      sourceBoxProductId: pool.sourceBoxProductId,
      itemId: source.itemId,
      sourceBoxProductName: source.name,
      packDisplayName: source.packDisplayName?.trim() || pool.packDisplayName,
      defaultPackPrice: source.defaultPackPrice === null ? null : Number(source.defaultPackPrice),
      packsOnHand: 0,
      costCents: 0,
      poolCount: 0,
    };
    row.packsOnHand += pool.packsRemaining;
    row.costCents += toCents(pool.remainingCostBasis);
    row.poolCount += 1;
    grouped.set(pool.sourceBoxProductId, row);
  }

  return [...grouped.values()].map((row) => {
    const expectedRetailCents = row.defaultPackPrice === null
      ? null
      : Math.round(row.packsOnHand * row.defaultPackPrice * 100);
    const potentialGrossProfitCents = expectedRetailCents === null ? null : expectedRetailCents - row.costCents;
    return {
      sourceBoxProductId: row.sourceBoxProductId,
      itemId: row.itemId,
      sourceBoxProductName: row.sourceBoxProductName,
      packDisplayName: row.packDisplayName,
      packsOnHand: row.packsOnHand,
      remainingCostBasis: fromCents(row.costCents),
      costPerPack: row.packsOnHand > 0 ? Number((row.costCents / 100 / row.packsOnHand).toFixed(6)) : 0,
      defaultPackPrice: row.defaultPackPrice,
      expectedRetailValue: expectedRetailCents === null ? null : fromCents(expectedRetailCents),
      potentialGrossProfit: potentialGrossProfitCents === null ? null : fromCents(potentialGrossProfitCents),
      potentialGrossMargin: expectedRetailCents && potentialGrossProfitCents !== null
        ? potentialGrossProfitCents / expectedRetailCents
        : expectedRetailCents === null ? null : 0,
      poolCount: row.poolCount,
    };
  }).sort((a, b) => a.packDisplayName.localeCompare(b.packDisplayName) || a.sourceBoxProductId - b.sourceBoxProductId);
}

export async function listPackInventory(database: PackInventoryDatabase) {
  const pools = await database.packPool.findMany({
    where: {
      packsRemaining: { gt: 0 },
      sourceBoxProduct: { active: true, sellable: true, unitType: "BOX" },
    },
    select: packInventorySelect,
  });
  return aggregatePackInventory(pools);
}
