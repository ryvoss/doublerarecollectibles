export type OrderReceivingStatus =
  | "DRAFT"
  | "ORDERED"
  | "ON_THE_WAY"
  | "PARTIALLY_DELIVERED"
  | "DELIVERED";

export type ReceivingQuantity = {
  quantityPurchased: number;
  quantityReceived: number;
};

export function receivingTotals(lines: ReceivingQuantity[]) {
  return lines.reduce(
    (total, line) => ({
      purchased: total.purchased + line.quantityPurchased,
      received: total.received + line.quantityReceived,
      inbound: total.inbound + line.quantityPurchased - line.quantityReceived,
    }),
    { purchased: 0, received: 0, inbound: 0 },
  );
}

export function orderReceivingStatus(input: {
  finalized: boolean;
  inTransitAt: Date | string | null;
  lines: ReceivingQuantity[];
}): OrderReceivingStatus {
  if (!input.finalized) return "DRAFT";
  const totals = receivingTotals(input.lines);
  if (totals.inbound === 0) return "DELIVERED";
  if (totals.received > 0) return "PARTIALLY_DELIVERED";
  return input.inTransitAt ? "ON_THE_WAY" : "ORDERED";
}

export function validateReceiptQuantity(batch: ReceivingQuantity, receiveNow: number) {
  if (!Number.isSafeInteger(receiveNow) || receiveNow < 0) {
    return "Receive Now must be a non-negative whole number.";
  }
  if (batch.quantityReceived + receiveNow > batch.quantityPurchased) {
    return "Received quantity cannot exceed purchased quantity.";
  }
  return null;
}

export function minimumReceivedForConsumption(batch: {
  quantitySold: number;
  quantityConverted: number;
}) {
  return batch.quantitySold + batch.quantityConverted;
}
