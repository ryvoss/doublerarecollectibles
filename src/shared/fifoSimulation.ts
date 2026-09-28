export type FifoBatchInput = {
  id: number;
  orderDate: Date;
  quantityReceived: number;
  quantitySold: number;
  landedCost: string | number;
  landedUnitCost: string | number;
  previouslyAllocatedCost: string | number;
};

export type FifoSimulationAllocation = {
  inventoryBatchId: number;
  quantity: number;
  unitCost: string;
  totalCost: string;
};

const toCents = (value: string | number) => Math.round(Number(value) * 100);
const centsToMoney = (value: number) => (value / 100).toFixed(2);

// Pure read-only implementation of the same FIFO rules used by finalized
// sales. It never receives a Prisma client and therefore cannot mutate stock.
export function simulateFifoConsumption(batches: FifoBatchInput[], requestedQuantity: number) {
  const ordered = [...batches].sort((a, b) => {
    const dateDifference = a.orderDate.getTime() - b.orderDate.getTime();
    return dateDifference !== 0 ? dateDifference : a.id - b.id;
  });
  const availableQuantity = ordered.reduce(
    (total, batch) => total + Math.max(0, batch.quantityReceived - batch.quantitySold),
    0
  );
  let quantityRemaining = requestedQuantity;
  const allocations: FifoSimulationAllocation[] = [];
  for (const batch of ordered) {
    if (quantityRemaining === 0) break;
    const batchAvailable = batch.quantityReceived - batch.quantitySold;
    if (batchAvailable <= 0) continue;
    const quantity = Math.min(batchAvailable, quantityRemaining);
    const remainingBatchCostCents = toCents(batch.landedCost) - toCents(batch.previouslyAllocatedCost);
    const totalCostCents = quantity === batchAvailable
      ? remainingBatchCostCents
      : Math.round(quantity * Number(batch.landedUnitCost) * 100);
    allocations.push({
      inventoryBatchId: batch.id,
      quantity,
      unitCost: Number(batch.landedUnitCost).toFixed(6),
      totalCost: centsToMoney(totalCostCents),
    });
    quantityRemaining -= quantity;
  }
  return {
    availableQuantity,
    fulfilled: quantityRemaining === 0,
    quantityUnfilled: quantityRemaining,
    allocations,
    cogs: centsToMoney(allocations.reduce((sum, allocation) => sum + toCents(allocation.totalCost), 0)),
  };
}
