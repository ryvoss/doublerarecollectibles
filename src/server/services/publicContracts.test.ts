import assert from "node:assert/strict";
import test from "node:test";
import { PUBLIC_SITE_DEFAULTS } from "../../shared/publicSite";
import { toPublicInventoryItem, toPublicSiteSettings } from "./publicContracts";

test("public inventory mapping returns only the customer contract", () => {
  const source = {
    id: 7,
    name: "Internal canonical name",
    displayName: "Customer name",
    shortDescription: "Customer description",
    imageKey: "products/7/private-key.png",
    publicPrice: null,
    expectedSalePrice: 49.99,
    featured: true,
    landedCost: 21.25,
    cogs: 18.5,
    margin: 0.6,
    orderId: 91,
    inventoryBatches: [{ quantityReceived: 3, quantitySold: 1, quantityConverted: 0, unitCost: 21.25 }],
  };
  const result = toPublicInventoryItem(source, "/api/public/product-images/7/image.png");

  assert.deepEqual(Object.keys(result).sort(), [
    "availability", "displayPrice", "featured", "id", "imageUrl", "name", "shortDescription",
  ]);
  assert.equal(result.name, "Customer name");
  assert.equal(result.displayPrice, 49.99);
  assert.equal(result.availability, "LOW_STOCK");
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /canonical|landedCost|cogs|margin|orderId|inventoryBatches|unitCost|imageKey/);
});

test("public site settings mapping exposes exactly the intended content fields", () => {
  const source = {
    ...PUBLIC_SITE_DEFAULTS,
    id: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    internalNotes: "never public",
  };
  const result = toPublicSiteSettings(source);
  assert.deepEqual(Object.keys(result).sort(), Object.keys(PUBLIC_SITE_DEFAULTS).sort());
  assert.doesNotMatch(JSON.stringify(result), /internalNotes|createdAt|updatedAt/);
});
