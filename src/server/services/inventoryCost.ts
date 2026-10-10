type CostAllocation = { totalCost: unknown };

type InventoryBatchState = {
  quantityReceived: number;
  quantitySold: number;
  quantityConverted: number;
  landedCost: unknown;
  saleAllocations: CostAllocation[];
  packPoolAllocations: CostAllocation[];
};

export function remainingBatchQuantity(batch: Pick<InventoryBatchState, "quantityReceived" | "quantitySold" | "quantityConverted">) {
  return batch.quantityReceived - batch.quantitySold - batch.quantityConverted;
}

export function allocatedBatchCost(batch: Pick<InventoryBatchState, "saleAllocations" | "packPoolAllocations">) {
  return [...batch.saleAllocations, ...batch.packPoolAllocations]
    .reduce((total, allocation) => total + Number(allocation.totalCost), 0);
}

export function remainingBatchCost(batch: InventoryBatchState) {
  return Number(batch.landedCost) - allocatedBatchCost(batch);
}
