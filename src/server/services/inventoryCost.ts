type CostAllocation = { totalCost: unknown };

type InventoryBatchState = {
  quantityPurchased: number;
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

export function inboundBatchQuantity(batch: Pick<InventoryBatchState, "quantityPurchased" | "quantityReceived">) {
  return batch.quantityPurchased - batch.quantityReceived;
}

export function allocatedBatchCost(batch: Pick<InventoryBatchState, "saleAllocations" | "packPoolAllocations">) {
  return [...batch.saleAllocations, ...batch.packPoolAllocations]
    .reduce((total, allocation) => total + Number(allocation.totalCost), 0);
}

export function remainingBatchCost(batch: InventoryBatchState) {
  return Number(batch.landedCost) - allocatedBatchCost(batch);
}

export function splitRemainingBatchCost(batch: InventoryBatchState & { landedUnitCost: unknown }) {
  const total = remainingBatchCost(batch);
  const inboundQuantity = inboundBatchQuantity(batch);
  const onHandQuantity = remainingBatchQuantity(batch);
  if (inboundQuantity <= 0) return { onHandCost: total, inboundCost: 0 };
  if (onHandQuantity <= 0) return { onHandCost: 0, inboundCost: total };
  const inboundCost = Math.min(total, Math.round(inboundQuantity * Number(batch.landedUnitCost) * 100) / 100);
  return { onHandCost: total - inboundCost, inboundCost };
}
