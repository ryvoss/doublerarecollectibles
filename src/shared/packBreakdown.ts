import { simulateFifoConsumption } from "./fifoSimulation";
import type { FifoBatchInput, FifoSimulationAllocation } from "./fifoSimulation";

export class PackBreakdownPlanError extends Error {
  readonly availableBoxes: number | undefined;

  constructor(message: string, availableBoxes?: number) {
    super(message);
    this.availableBoxes = availableBoxes;
  }
}

export type PackBreakdownConfiguration = {
  packsPerBox: number;
  packDisplayName: string;
  defaultPackPrice: number | null;
  needsSave: boolean;
};

export function resolvePackBreakdownConfiguration(
  sourceBox: { packsPerBox: number | null; packDisplayName: string | null; defaultPackPrice: unknown | null },
  requested?: { packsPerBox?: unknown; packDisplayName?: unknown; defaultPackPrice?: unknown },
): PackBreakdownConfiguration {
  const configured = Number.isSafeInteger(sourceBox.packsPerBox) && Number(sourceBox.packsPerBox) > 0 &&
    typeof sourceBox.packDisplayName === "string" && sourceBox.packDisplayName.trim().length > 0;
  if (configured) {
    return {
      packsPerBox: sourceBox.packsPerBox!,
      packDisplayName: sourceBox.packDisplayName!.trim(),
      defaultPackPrice: sourceBox.defaultPackPrice == null ? null : Number(sourceBox.defaultPackPrice),
      needsSave: false,
    };
  }

  const packsPerBox = requested?.packsPerBox;
  const packDisplayName = requested?.packDisplayName;
  const defaultPackPrice = requested?.defaultPackPrice;
  if (typeof packsPerBox !== "number" || !Number.isSafeInteger(packsPerBox) || packsPerBox <= 0) {
    throw new PackBreakdownPlanError("Packs per box must be a positive whole number.");
  }
  if (typeof packDisplayName !== "string" || !packDisplayName.trim() || packDisplayName.trim().length > 160) {
    throw new PackBreakdownPlanError("Pack display name is required and must be 160 characters or fewer.");
  }
  if (defaultPackPrice !== undefined && defaultPackPrice !== null &&
      (typeof defaultPackPrice !== "number" || !Number.isFinite(defaultPackPrice) || defaultPackPrice < 0 || defaultPackPrice > 99999999.99)) {
    throw new PackBreakdownPlanError("Default pack price must be a valid non-negative amount.");
  }
  return {
    packsPerBox,
    packDisplayName: packDisplayName.trim(),
    defaultPackPrice: defaultPackPrice === undefined || defaultPackPrice === null ? null : defaultPackPrice,
    needsSave: true,
  };
}

export type PackBreakdownPlan = {
  boxesConsumed: number;
  packsCreated: number;
  totalCostBasis: string;
  costPerPack: string;
  allocations: FifoSimulationAllocation[];
};

// Breakdown delegates FIFO selection and final-batch cost reconciliation to the
// same pure utility used by sealed sales. The caller applies this plan atomically.
export function planPackBreakdown(
  batches: FifoBatchInput[],
  boxesRequested: number,
  packsPerBox: number,
): PackBreakdownPlan {
  if (!Number.isSafeInteger(boxesRequested) || boxesRequested <= 0) {
    throw new PackBreakdownPlanError("Box quantity must be a positive whole number.");
  }
  if (!Number.isSafeInteger(packsPerBox) || packsPerBox <= 0) {
    throw new PackBreakdownPlanError("Packs per box must be a positive whole number.");
  }

  const packsCreated = boxesRequested * packsPerBox;
  if (!Number.isSafeInteger(packsCreated) || packsCreated > 2147483647) {
    throw new PackBreakdownPlanError("The resulting pack quantity is too large.");
  }

  const fifo = simulateFifoConsumption(batches, boxesRequested);
  if (!fifo.fulfilled) {
    throw new PackBreakdownPlanError(
      `Insufficient box inventory. Requested ${boxesRequested}; ${fifo.availableQuantity} available.`,
      fifo.availableQuantity,
    );
  }

  return {
    boxesConsumed: boxesRequested,
    packsCreated,
    totalCostBasis: fifo.cogs,
    costPerPack: (Number(fifo.cogs) / packsCreated).toFixed(6),
    allocations: fifo.allocations,
  };
}
