const toCents = (value: string | number) => Math.round(Number(value) * 100);
const money = (cents: number) => (cents / 100).toFixed(2);

export class ShowPackTrackingError extends Error {}

export type AvailablePackPool = {
  id: number;
  createdAt: Date;
  packsRemaining: number;
  remainingCostBasis: string | number;
  reservedQuantity: number;
  reservedCostBasis: string | number;
};

export type PackPoolReservation = {
  packPoolId: number;
  quantity: number;
  costBasis: string;
};

export function planPackPoolReservations(pools: AvailablePackPool[], requestedQuantity?: number) {
  const availableQuantity = pools.reduce(
    (sum, pool) => sum + Math.max(0, pool.packsRemaining - pool.reservedQuantity),
    0,
  );
  const quantity = requestedQuantity ?? availableQuantity;
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new ShowPackTrackingError("Pack quantity must be a positive whole number.");
  }
  if (quantity > availableQuantity) {
    throw new ShowPackTrackingError(`Insufficient unallocated pack inventory. Requested ${quantity}; ${availableQuantity} available.`);
  }

  let needed = quantity;
  const reservations: PackPoolReservation[] = [];
  for (const pool of [...pools].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id)) {
    if (needed === 0) break;
    const poolAvailable = pool.packsRemaining - pool.reservedQuantity;
    if (poolAvailable <= 0) continue;
    const take = Math.min(poolAvailable, needed);
    const availableCostCents = toCents(pool.remainingCostBasis) - toCents(pool.reservedCostBasis);
    const costCents = take === poolAvailable
      ? availableCostCents
      : Math.round((take * availableCostCents) / poolAvailable);
    reservations.push({ packPoolId: pool.id, quantity: take, costBasis: money(costCents) });
    needed -= take;
  }

  return {
    availableQuantity,
    quantity,
    costBasis: money(reservations.reduce((sum, item) => sum + toCents(item.costBasis), 0)),
    reservations,
  };
}

export type ShowPackResultInput = {
  startingPacks: number;
  addedPacks: number;
  endingPacks: number;
  giveaways: number;
  damaged: number;
  declaredValuePerPack: string | number;
  actualRevenue: string | number | null;
  actualCashRevenue: string | number | null;
  actualDigitalRevenue: string | number | null;
};

export function calculateShowPackResult(input: ShowPackResultInput) {
  for (const [label, value] of Object.entries({ endingPacks: input.endingPacks, giveaways: input.giveaways, damaged: input.damaged })) {
    if (!Number.isSafeInteger(value) || value < 0) throw new ShowPackTrackingError(`${label} must be a non-negative whole number.`);
  }
  const packsSold = input.startingPacks + input.addedPacks - input.endingPacks - input.giveaways - input.damaged;
  if (packsSold < 0) throw new ShowPackTrackingError("Packs Sold cannot be negative. Review ending packs, giveaways, and damaged packs.");

  const declaredValueCents = toCents(input.declaredValuePerPack);
  if (!Number.isFinite(declaredValueCents) || declaredValueCents < 0) {
    throw new ShowPackTrackingError("Declared value per pack must be non-negative.");
  }
  const actualEntered = input.actualRevenue !== null;
  if (!actualEntered && (input.actualCashRevenue !== null || input.actualDigitalRevenue !== null)) {
    throw new ShowPackTrackingError("Pack Cash and Digital must be blank when Actual Pack Revenue is blank.");
  }
  const actualRevenueCents = actualEntered ? toCents(input.actualRevenue!) : 0;
  const cashCents = actualEntered ? toCents(input.actualCashRevenue ?? 0) : 0;
  const digitalCents = actualEntered ? toCents(input.actualDigitalRevenue ?? 0) : 0;
  if (actualEntered && (actualRevenueCents < 0 || cashCents < 0 || digitalCents < 0 || cashCents + digitalCents !== actualRevenueCents)) {
    throw new ShowPackTrackingError("Pack Cash plus Digital must equal Actual Pack Revenue.");
  }

  return {
    packsSold,
    declaredSalesValue: money(packsSold * declaredValueCents),
    actualRevenue: actualEntered ? money(actualRevenueCents) : null,
    actualCashRevenue: actualEntered ? money(cashCents) : null,
    actualDigitalRevenue: actualEntered ? money(digitalCents) : null,
  };
}

export type ShowPackAllocationForConsumption = {
  id: number;
  packPoolId: number;
  createdAt: Date;
  quantityAllocated: number;
  costBasisAllocated: string | number;
  quantityConsumed: number;
  costBasisConsumed: string | number;
};

export function planShowPackConsumption(
  allocations: ShowPackAllocationForConsumption[],
  quantities: { sold: number; giveaways: number; damaged: number },
) {
  const ordered = [...allocations].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id);
  const state = new Map(ordered.map(item => [item.id, {
    item,
    quantityAvailable: item.quantityAllocated - item.quantityConsumed,
    costAvailableCents: toCents(item.costBasisAllocated) - toCents(item.costBasisConsumed),
    quantityTaken: 0,
    costTakenCents: 0,
  }]));

  const takeCategory = (requested: number) => {
    let needed = requested;
    let categoryCost = 0;
    for (const allocation of ordered) {
      if (needed === 0) break;
      const current = state.get(allocation.id)!;
      if (current.quantityAvailable <= 0) continue;
      const take = Math.min(current.quantityAvailable, needed);
      const cost = take === current.quantityAvailable
        ? current.costAvailableCents
        : Math.round((take * current.costAvailableCents) / current.quantityAvailable);
      current.quantityAvailable -= take;
      current.costAvailableCents -= cost;
      current.quantityTaken += take;
      current.costTakenCents += cost;
      categoryCost += cost;
      needed -= take;
    }
    if (needed > 0) throw new ShowPackTrackingError("Show pack allocations no longer cover the ending snapshot.");
    return categoryCost;
  };

  const soldCostCents = takeCategory(quantities.sold);
  const giveawayCostCents = takeCategory(quantities.giveaways);
  const damagedCostCents = takeCategory(quantities.damaged);
  const allocationUpdates = [...state.values()].filter(item => item.quantityTaken > 0).map(item => ({
    allocationId: item.item.id,
    packPoolId: item.item.packPoolId,
    quantityConsumed: item.quantityTaken,
    costBasisConsumed: money(item.costTakenCents),
  }));
  const poolUpdates = new Map<number, { quantityConsumed: number; costBasisConsumedCents: number }>();
  for (const update of allocationUpdates) {
    const current = poolUpdates.get(update.packPoolId) ?? { quantityConsumed: 0, costBasisConsumedCents: 0 };
    current.quantityConsumed += update.quantityConsumed;
    current.costBasisConsumedCents += toCents(update.costBasisConsumed);
    poolUpdates.set(update.packPoolId, current);
  }

  return {
    estimatedCogs: money(soldCostCents),
    giveawayCostBasis: money(giveawayCostCents),
    damagedCostBasis: money(damagedCostCents),
    allocationUpdates,
    poolUpdates: [...poolUpdates].map(([packPoolId, update]) => ({
      packPoolId,
      quantityConsumed: update.quantityConsumed,
      costBasisConsumed: money(update.costBasisConsumedCents),
    })),
  };
}
