import type { Prisma } from "../../generated/prisma/client";

export type ShowPackFinalizationDatabase = Pick<
  Prisma.TransactionClient,
  "showPackPoolAllocation" | "packPool" | "showPackSnapshot" | "fundEntry"
>;

export type ShowPackFinalizationWrite = {
  snapshotId: number;
  packDisplayName: string;
  endingPacks: number;
  packsSold: number;
  declaredSalesValue: string;
  estimatedCogs: string;
  giveawayCostBasis: string;
  damagedCostBasis: string;
  actualRevenue: string | null;
  actualCashRevenue: string | null;
  actualDigitalRevenue: string | null;
  allocationUpdates: Array<{ allocationId: number; quantityConsumed: number; costBasisConsumed: string }>;
  poolUpdates: Array<{ packPoolId: number; quantityConsumed: number; costBasisConsumed: string }>;
};

const toCents = (value: string | number) => Math.round(Number(value) * 100);
const money = (cents: number) => (cents / 100).toFixed(2);

// All pack inventory, finalized analytics, and optional SEALED revenue writes
// are applied through this boundary inside the caller's Show transaction.
export async function persistShowPackFinalizations(
  database: ShowPackFinalizationDatabase,
  visit: { id: number; visitDate: Date; showName: string },
  finalizedAt: Date,
  finalizations: ShowPackFinalizationWrite[],
) {
  for (const item of finalizations) {
    for (const allocation of item.allocationUpdates) {
      await database.showPackPoolAllocation.update({
        where: { id: allocation.allocationId },
        data: {
          quantityConsumed: { increment: allocation.quantityConsumed },
          costBasisConsumed: { increment: allocation.costBasisConsumed },
        },
      });
    }
    for (const pool of item.poolUpdates) {
      await database.packPool.update({
        where: { id: pool.packPoolId },
        data: {
          packsRemaining: { decrement: pool.quantityConsumed },
          remainingCostBasis: { decrement: pool.costBasisConsumed },
        },
      });
    }

    const grossProfitCents = item.actualRevenue === null ? null : toCents(item.actualRevenue) - toCents(item.estimatedCogs);
    await database.showPackSnapshot.update({
      where: { id: item.snapshotId },
      data: {
        endingPacks: item.endingPacks,
        packsSold: item.packsSold,
        declaredSalesValue: item.declaredSalesValue,
        estimatedCogs: item.estimatedCogs,
        giveawayCostBasis: item.giveawayCostBasis,
        damagedCostBasis: item.damagedCostBasis,
        actualRevenue: item.actualRevenue,
        actualCashRevenue: item.actualCashRevenue,
        actualDigitalRevenue: item.actualDigitalRevenue,
        actualGrossProfit: grossProfitCents === null ? null : money(grossProfitCents),
        actualGrossMargin: grossProfitCents === null
          ? null
          : (toCents(item.actualRevenue!) > 0 ? grossProfitCents / toCents(item.actualRevenue!) : 0).toFixed(6),
        finalizedAt,
      },
    });

    if (item.actualRevenue !== null) {
      await database.fundEntry.createMany({
        data: [
          {
            source: "SEALED",
            location: "CASH",
            type: "PACK_SHOW_REVENUE",
            amount: item.actualCashRevenue!,
            transactionDate: visit.visitDate,
            showVisitId: visit.id,
            showPackSnapshotId: item.snapshotId,
            note: `Pack cash revenue - ${item.packDisplayName} - ${visit.showName}`,
          },
          {
            source: "SEALED",
            location: "DIGITAL",
            type: "PACK_SHOW_REVENUE",
            amount: item.actualDigitalRevenue!,
            transactionDate: visit.visitDate,
            showVisitId: visit.id,
            showPackSnapshotId: item.snapshotId,
            note: `Pack digital revenue - ${item.packDisplayName} - ${visit.showName}`,
          },
        ],
      });
    }
  }
}
