import { analyzeLandedCosts } from "./landedCostAnalysis";

export type CorrectableOrderLine = {
  id: number;
  productCost: string | number;
  sellableQuantity: number;
  landedCost: string | number;
  landedUnitCost: string | number;
};

export type CorrectableOrder = {
  shippingCost: string | number;
  tariffCost: string | number;
  otherCost: string | number;
  adjustment: string | number;
  lines: CorrectableOrderLine[];
};

export type ProposedOrderCorrection = {
  shippingCost: number;
  tariffCost: number;
  otherCost: number;
  adjustment: number;
  lines: Array<{ orderLineId: number; productCost: number }>;
};

const cents = (value: string | number) => Math.round(Number(value) * 100);
const money = (value: number) => value / 100;

export function orderTotalCents(order: Pick<CorrectableOrder, "shippingCost" | "tariffCost" | "otherCost" | "adjustment" | "lines">) {
  return order.lines.reduce((total, line) => total + cents(line.productCost), 0) +
    cents(order.shippingCost) + cents(order.tariffCost) + cents(order.otherCost) + cents(order.adjustment);
}

export function hasDownstreamInventoryConsumption(batch: {
  quantitySold: number;
  quantityConverted: number;
  saleAllocations?: unknown[];
  packPoolAllocations?: unknown[];
}) {
  return batch.quantitySold > 0 || batch.quantityConverted > 0 ||
    (batch.saleAllocations?.length ?? 0) > 0 || (batch.packPoolAllocations?.length ?? 0) > 0;
}

export function buildOrderCorrectionPreview(
  current: CorrectableOrder,
  proposed: ProposedOrderCorrection,
) {
  const proposedByLine = new Map(proposed.lines.map(line => [line.orderLineId, line.productCost]));
  const correctedLines = current.lines.map(line => ({
    ...line,
    productCost: proposedByLine.get(line.id) ?? Number(line.productCost),
  }));
  const analysis = analyzeLandedCosts({
    shippingCost: proposed.shippingCost,
    tariffCost: proposed.tariffCost,
    otherCost: proposed.otherCost,
    adjustment: proposed.adjustment,
    lines: correctedLines,
  }, "VALUE");
  const oldTotalCents = orderTotalCents(current);
  const newTotalCents = orderTotalCents({ ...proposed, lines: correctedLines });
  return {
    oldProductCost: money(current.lines.reduce((total, line) => total + cents(line.productCost), 0)),
    newProductCost: money(correctedLines.reduce((total, line) => total + cents(line.productCost), 0)),
    oldOrderTotal: money(oldTotalCents),
    newOrderTotal: money(newTotalCents),
    inventoryValueImpact: money(newTotalCents - oldTotalCents),
    // The original purchase entry is immutable. This signed amount brings the
    // SEALED ledger from the old purchase total to the corrected total.
    fundImpact: money(oldTotalCents - newTotalCents),
    lines: current.lines.map((line, index) => ({
      orderLineId: line.id,
      oldProductCost: Number(line.productCost),
      newProductCost: Number(correctedLines[index].productCost),
      oldLandedCost: Number(line.landedCost),
      newLandedCost: analysis.lines[index].landedCost,
      oldLandedUnitCost: Number(line.landedUnitCost),
      newLandedUnitCost: analysis.lines[index].landedUnitCost,
    })),
    reconciled: analysis.reconciled,
  };
}
