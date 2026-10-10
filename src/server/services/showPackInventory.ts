import type { PrismaClient } from "../../generated/prisma/client";
import { planPackPoolReservations } from "../../shared/showPackTracking";

type PackPoolDatabase = Pick<PrismaClient, "packPool">;

export async function planReservationsForSourceBox(
  database: PackPoolDatabase,
  sourceBoxProductId: number,
  requestedQuantity?: number,
) {
  const pools = await database.packPool.findMany({
    where: { sourceBoxProductId, packsRemaining: { gt: 0 } },
    include: {
      showAllocations: {
        where: { showPackSnapshot: { showVisit: { status: "ACTIVE" } } },
        select: {
          quantityAllocated: true,
          costBasisAllocated: true,
          quantityConsumed: true,
          costBasisConsumed: true,
        },
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  return planPackPoolReservations(pools.map(pool => ({
    id: pool.id,
    createdAt: pool.createdAt,
    packsRemaining: pool.packsRemaining,
    remainingCostBasis: Number(pool.remainingCostBasis),
    reservedQuantity: pool.showAllocations.reduce(
      (sum, allocation) => sum + allocation.quantityAllocated - allocation.quantityConsumed,
      0,
    ),
    reservedCostBasis: pool.showAllocations.reduce(
      (sum, allocation) => sum + Number(allocation.costBasisAllocated) - Number(allocation.costBasisConsumed),
      0,
    ),
  })), requestedQuantity);
}

export async function listAvailablePackInventory(database: PackPoolDatabase) {
  const pools = await database.packPool.findMany({
    where: {
      packsRemaining: { gt: 0 },
      sourceBoxProduct: { active: true, sellable: true, type: "SEALED", unitType: "BOX" },
    },
    select: {
      sourceBoxProductId: true,
      packDisplayName: true,
      sourceBoxProduct: {
        select: { id: true, itemId: true, name: true, packDisplayName: true, defaultPackPrice: true },
      },
    },
    distinct: ["sourceBoxProductId"],
  });

  const products = [];
  for (const row of pools) {
    try {
      const plan = await planReservationsForSourceBox(database, row.sourceBoxProductId);
      if (plan.availableQuantity > 0) {
        products.push({
          sourceBoxProductId: row.sourceBoxProductId,
          sourceItemId: row.sourceBoxProduct.itemId,
          sourceBoxProductName: row.sourceBoxProduct.name,
          packDisplayName: row.sourceBoxProduct.packDisplayName?.trim() || row.packDisplayName,
          defaultPackPrice: row.sourceBoxProduct.defaultPackPrice === null ? null : Number(row.sourceBoxProduct.defaultPackPrice),
          availablePacks: plan.availableQuantity,
          availableCostBasis: Number(plan.costBasis),
          costPerPack: Number(plan.costBasis) / plan.availableQuantity,
        });
      }
    } catch {
      // A pool can become fully reserved between the distinct query and plan.
    }
  }
  return products.sort((a, b) => a.packDisplayName.localeCompare(b.packDisplayName));
}
