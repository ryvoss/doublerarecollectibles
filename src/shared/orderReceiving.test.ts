import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  minimumReceivedForConsumption,
  orderReceivingStatus,
  receivingTotals,
  validateReceiptQuantity,
} from "./orderReceiving";

test("receiving status derives Ordered, On the Way, partial, and delivered from quantities", () => {
  const base = { finalized: true, inTransitAt: null, lines: [{ quantityPurchased: 10, quantityReceived: 0 }] };
  assert.equal(orderReceivingStatus(base), "ORDERED");
  assert.equal(orderReceivingStatus({ ...base, inTransitAt: new Date() }), "ON_THE_WAY");
  assert.equal(orderReceivingStatus({ ...base, lines: [{ quantityPurchased: 10, quantityReceived: 4 }] }), "PARTIALLY_DELIVERED");
  assert.equal(orderReceivingStatus({ ...base, lines: [{ quantityPurchased: 10, quantityReceived: 10 }] }), "DELIVERED");
  assert.deepEqual(receivingTotals([{ quantityPurchased: 10, quantityReceived: 4 }]), {
    purchased: 10, received: 4, inbound: 6,
  });
});

test("receipt validation prevents over-receiving and requires whole quantities", () => {
  const batch = { quantityPurchased: 10, quantityReceived: 4 };
  assert.equal(validateReceiptQuantity(batch, 6), null);
  assert.match(validateReceiptQuantity(batch, 7) ?? "", /cannot exceed/i);
  assert.match(validateReceiptQuantity(batch, 1.5) ?? "", /whole number/i);
});

test("reclassification cannot move received quantity below downstream consumption", () => {
  assert.equal(minimumReceivedForConsumption({ quantitySold: 0, quantityConverted: 0 }), 0);
  assert.equal(minimumReceivedForConsumption({ quantitySold: 2, quantityConverted: 1 }), 3);
});

test("migration backfills historical batches as fully received", () => {
  const sql = readFileSync(
    new URL("../../prisma/migrations/20261013000000_add_order_receiving/migration.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /SET "quantityReceived" = "quantityPurchased"/);
});
