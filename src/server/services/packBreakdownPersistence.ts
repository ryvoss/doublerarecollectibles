import type { Prisma } from "../../generated/prisma/client";
import type { PackBreakdownPlan } from "../../shared/packBreakdown";

export type PackBreakdownPersistenceDatabase = Pick<
  Prisma.TransactionClient,
  "packPool" | "packPoolSourceAllocation" | "inventoryBatch" | "showPackPoolAllocation" | "showPackSnapshot"
>;

type PersistPackBreakdownInput = {
  sourceBoxProductId: number;
  packDisplayName: string;
  showVisitId: number | null;
  showPackSnapshotId: number | null;
  plan: PackBreakdownPlan;
};

export async function persistPackBreakdown(
  database: PackBreakdownPersistenceDatabase,
  input: PersistPackBreakdownInput,
) {
  const created = await database.packPool.create({
    data: {
      sourceBoxProductId: input.sourceBoxProductId,
      packDisplayName: input.packDisplayName,
      showVisitId: input.showVisitId,
      boxesConsumed: input.plan.boxesConsumed,
      packsCreated: input.plan.packsCreated,
      packsRemaining: input.plan.packsCreated,
      totalCostBasis: input.plan.totalCostBasis,
      remainingCostBasis: input.plan.totalCostBasis,
      costPerPack: input.plan.costPerPack,
    },
  });

  for (const allocation of input.plan.allocations) {
    await database.packPoolSourceAllocation.create({
      data: {
        packPoolId: created.id,
        inventoryBatchId: allocation.inventoryBatchId,
        quantityBoxes: allocation.quantity,
        unitCost: allocation.unitCost,
        totalCost: allocation.totalCost,
      },
    });
    await database.inventoryBatch.update({
      where: { id: allocation.inventoryBatchId },
      data: { quantityConverted: { increment: allocation.quantity } },
    });
  }

  if (input.showPackSnapshotId !== null) {
    await database.showPackPoolAllocation.create({
      data: {
        showPackSnapshotId: input.showPackSnapshotId,
        packPoolId: created.id,
        type: "ADDED",
        quantityAllocated: input.plan.packsCreated,
        costBasisAllocated: input.plan.totalCostBasis,
      },
    });
    await database.showPackSnapshot.update({
      where: { id: input.showPackSnapshotId },
      data: {
        addedPacks: { increment: input.plan.packsCreated },
        addedCostBasis: { increment: input.plan.totalCostBasis },
      },
    });
  }

  return created;
}
