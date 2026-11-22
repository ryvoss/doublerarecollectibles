/** Admin-only planning state. Does not change public availability or accounting. */
export const DEFAULT_INVENTORY_FILTER = "all";
export const DEFAULT_INVENTORY_SORT = "onHandDesc";
export const MAX_REORDER_POINT = 1_000_000;
export type InventoryFilter = "all" | "reorder" | "inbound" | "out";
export type InventorySort = "onHandDesc" | "onHandAsc" | "name" | "value" | "priority";
export type InventoryState = { productId: number; productName: string; itemId: string; unitsOnHand: number; unitsInbound: number; reorderPoint: number; inventoryValue: number };
export function validReorderPoint(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_REORDER_POINT;
}
export function stockStatus(item: Pick<InventoryState, "unitsOnHand" | "unitsInbound" | "reorderPoint">) {
  if (item.unitsOnHand === 0 && item.unitsInbound === 0) return "Out of Stock";
  if (item.unitsOnHand <= item.reorderPoint) return item.unitsInbound > 0 ? "Restock On The Way" : "Reorder Recommended";
  return "Healthy";
}
export function needsReorder(item: Pick<InventoryState, "unitsOnHand" | "unitsInbound" | "reorderPoint">) {
  // At the threshold is still a shortage; inbound must take stock above it.
  return item.unitsOnHand <= item.reorderPoint && item.unitsOnHand + item.unitsInbound <= item.reorderPoint;
}
export function reorderPriority(item: InventoryState) {
  return ["Out of Stock", "Reorder Recommended", "Restock On The Way", "Healthy"].indexOf(stockStatus(item));
}
export function selectInventory<T extends InventoryState>(items: T[], filter: InventoryFilter = DEFAULT_INVENTORY_FILTER, sort: InventorySort = DEFAULT_INVENTORY_SORT, search = ""): T[] {
  const query = search.trim().toLowerCase();
  return items.filter(item => `${item.itemId} ${item.productName}`.toLowerCase().includes(query) &&
    (filter === "all" || (filter === "reorder" ? needsReorder(item) : filter === "inbound" ? item.unitsInbound > 0 : item.unitsOnHand === 0)))
    .sort((a, b) => {
      const difference = sort === "onHandDesc" ? b.unitsOnHand - a.unitsOnHand
        : sort === "onHandAsc" ? a.unitsOnHand - b.unitsOnHand
        : sort === "value" ? b.inventoryValue - a.inventoryValue
        : sort === "priority" ? reorderPriority(a) - reorderPriority(b) || a.unitsOnHand - b.unitsOnHand
        : a.productName.localeCompare(b.productName, "en");
      return difference || a.productId - b.productId;
    });
}
