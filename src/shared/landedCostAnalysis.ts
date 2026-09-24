export type LandedCostMethod = "STORED" | "BLEND" | "QUANTITY";

export type LandedCostAnalysisOrder = {
  shippingCost: string | number;
  tariffCost: string | number;
  otherCost: string | number;
  adjustment: string | number;
  lines: Array<{
    id: number;
    productCost: string | number;
    sellableQuantity: number;
    landedCost: string | number | null;
    landedUnitCost: string | number | null;
  }>;
};

export type LandedCostAnalysisLine = {
  lineId: number;
  allocatedShipping: number;
  allocatedTariff: number;
  allocatedOther: number;
  allocatedAdjustment: number;
  landedCost: number;
  landedUnitCost: number;
  storedLandedUnitCost: number | null;
  differenceFromStoredUnitCost: number | null;
};

export type LandedCostAnalysis = {
  method: LandedCostMethod;
  lines: LandedCostAnalysisLine[];
  expectedTotal: number;
  calculatedTotal: number;
  reconciliationDifference: number;
  reconciled: boolean;
};

const toCents = (value: string | number) => Math.round(Number(value) * 100);
const fromCents = (value: number) => value / 100;

// Round each allocation to cents and give the final line the remainder. This
// makes every analytical component reconcile to its order-level source value.
function allocateCents(totalCents: number, weights: number[]): number[] {
  if (!weights.length) return [];
  let allocated = 0;
  return weights.map((weight, index) => {
    const amount = index === weights.length - 1
      ? totalCents - allocated
      : Math.round(totalCents * weight);
    allocated += amount;
    return amount;
  });
}

export function analyzeLandedCosts(
  order: LandedCostAnalysisOrder,
  method: LandedCostMethod
): LandedCostAnalysis {
  const productCents = order.lines.map(line => toCents(line.productCost));
  const totalProductCents = productCents.reduce((sum, value) => sum + value, 0);
  const totalQuantity = order.lines.reduce((sum, line) => sum + line.sellableQuantity, 0);
  const valueWeights = productCents.map(value => totalProductCents > 0 ? value / totalProductCents : 0);
  const quantityWeights = order.lines.map(line => totalQuantity > 0 ? line.sellableQuantity / totalQuantity : 0);
  const shippingWeights = method === "QUANTITY"
    ? quantityWeights
    : method === "BLEND"
      ? valueWeights.map((weight, index) => (weight + quantityWeights[index]) / 2)
      : valueWeights;
  const shipping = allocateCents(toCents(order.shippingCost), shippingWeights);
  const tariff = allocateCents(toCents(order.tariffCost), valueWeights);
  const other = allocateCents(toCents(order.otherCost), valueWeights);
  const adjustment = allocateCents(toCents(order.adjustment), valueWeights);

  const lines = order.lines.map((line, index) => {
    const storedUnit = line.landedUnitCost === null ? null : Number(line.landedUnitCost);
    const analyticalCents = productCents[index] + shipping[index] + tariff[index] + other[index] + adjustment[index];
    const storedCents = line.landedCost === null ? analyticalCents : toCents(line.landedCost);
    const landedCents = method === "STORED" ? storedCents : analyticalCents;
    // Stored unit cost is read exactly from the finalized record. Analytical
    // unit costs derive from the cent-reconciled line total.
    const landedUnitCost = method === "STORED" && storedUnit !== null
      ? storedUnit
      : line.sellableQuantity > 0 ? fromCents(landedCents) / line.sellableQuantity : 0;
    return {
      lineId: line.id,
      allocatedShipping: fromCents(shipping[index]),
      allocatedTariff: fromCents(tariff[index]),
      allocatedOther: fromCents(other[index]),
      allocatedAdjustment: fromCents(adjustment[index]),
      landedCost: fromCents(landedCents),
      landedUnitCost,
      storedLandedUnitCost: storedUnit,
      differenceFromStoredUnitCost: method === "STORED" || storedUnit === null ? null : landedUnitCost - storedUnit,
    };
  });
  const expectedCents = totalProductCents + toCents(order.shippingCost) + toCents(order.tariffCost) + toCents(order.otherCost) + toCents(order.adjustment);
  const calculatedCents = lines.reduce((sum, line) => sum + toCents(line.landedCost), 0);
  const difference = calculatedCents - expectedCents;
  return {
    method,
    lines,
    expectedTotal: fromCents(expectedCents),
    calculatedTotal: fromCents(calculatedCents),
    reconciliationDifference: fromCents(difference),
    reconciled: difference === 0,
  };
}
