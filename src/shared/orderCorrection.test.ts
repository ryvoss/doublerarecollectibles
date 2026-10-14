import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildOrderCorrectionPreview, hasDownstreamInventoryConsumption } from "./orderCorrection";

const current = {
  shippingCost: 10,
  tariffCost: 5,
  otherCost: 0,
  adjustment: -5,
  lines: [
    { id: 1, productCost: 60, sellableQuantity: 6, landedCost: 66, landedUnitCost: 11 },
    { id: 2, productCost: 40, sellableQuantity: 4, landedCost: 44, landedUnitCost: 11 },
  ],
};

test("untouched finalized order correction reuses official value allocation", () => {
  const preview = buildOrderCorrectionPreview(current, {
    shippingCost: 20,
    tariffCost: 5,
    otherCost: 0,
    adjustment: -5,
    lines: [{ orderLineId: 1, productCost: 60 }, { orderLineId: 2, productCost: 40 }],
  });
  assert.equal(preview.oldOrderTotal, 110);
  assert.equal(preview.newOrderTotal, 120);
  assert.equal(preview.inventoryValueImpact, 10);
  assert.equal(preview.fundImpact, -10);
  assert.equal(preview.lines.reduce((sum, line) => sum + line.newLandedCost, 0), 120);
  assert.equal(preview.reconciled, true);
});

test("a later correction starts from current corrected values without mutating prior history", () => {
  const preview = buildOrderCorrectionPreview({
    ...current,
    shippingCost: 20,
    lines: current.lines.map((line, index) => ({
      ...line,
      landedCost: index === 0 ? 72 : 48,
      landedUnitCost: 12,
    })),
  }, {
    shippingCost: 15,
    tariffCost: 5,
    otherCost: 0,
    adjustment: -5,
    lines: [{ orderLineId: 1, productCost: 60 }, { orderLineId: 2, productCost: 40 }],
  });
  assert.equal(preview.oldOrderTotal, 120);
  assert.equal(preview.newOrderTotal, 115);
  assert.equal(preview.fundImpact, 5);
});

test("reallocating product cost with the same order total needs no duplicate fund value", () => {
  const preview = buildOrderCorrectionPreview(current, {
    shippingCost: 10,
    tariffCost: 5,
    otherCost: 0,
    adjustment: -5,
    lines: [{ orderLineId: 1, productCost: 55 }, { orderLineId: 2, productCost: 45 }],
  });
  assert.equal(preview.oldOrderTotal, preview.newOrderTotal);
  assert.equal(preview.inventoryValueImpact, 0);
  assert.equal(preview.fundImpact, 0);
  assert.equal("quantityReceived" in preview, false);
});

test("sales and Box conversions conservatively block simple cost reconciliation", () => {
  assert.equal(hasDownstreamInventoryConsumption({ quantitySold: 0, quantityConverted: 0 }), false);
  assert.equal(hasDownstreamInventoryConsumption({ quantitySold: 1, quantityConverted: 0 }), true);
  assert.equal(hasDownstreamInventoryConsumption({ quantitySold: 0, quantityConverted: 1 }), true);
  assert.equal(hasDownstreamInventoryConsumption({ quantitySold: 0, quantityConverted: 0, saleAllocations: [{}] }), true);
});

test("correction migration enforces immutable audit rows and a linked ledger type", () => {
  const sql = readFileSync(
    new URL("../../prisma/migrations/20261013120000_add_finalized_order_corrections/migration.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /ADD VALUE 'ORDER_CORRECTION'/);
  assert.match(sql, /OrderCorrection_immutable/);
  assert.match(sql, /OrderCorrectionChange_immutable/);
  assert.match(sql, /FundEntry_orderCorrectionId_fkey/);
});
