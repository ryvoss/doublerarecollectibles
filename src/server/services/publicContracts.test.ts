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
    inventoryBatches: [{ quantityPurchased: 5, quantityReceived: 3, quantitySold: 1, quantityConverted: 0, unitCost: 21.25 }],
  };
  const result = toPublicInventoryItem(source, "/api/public/product-images/7/image.png");

  assert.deepEqual(Object.keys(result).sort(), [
    "availability", "displayPrice", "featured", "id", "imageUrl", "moreArrivingSoon", "name", "shortDescription",
  ]);
  assert.equal(result.name, "Customer name");
  assert.equal(result.displayPrice, 49.99);
  assert.equal(result.availability, "LOW_STOCK");
  assert.equal(result.moreArrivingSoon, true);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /canonical|landedCost|cogs|margin|orderId|inventoryBatches|unitCost|imageKey/);
});

test("public availability reports inbound-only inventory as Coming Soon without quantities", () => {
  const result = toPublicInventoryItem({
    id: 8,
    name: "Future product",
    displayName: null,
    shortDescription: null,
    publicPrice: null,
    expectedSalePrice: 25,
    featured: false,
    inventoryBatches: [{
      quantityPurchased: 4,
      quantityReceived: 0,
      quantitySold: 0,
      quantityConverted: 0,
    }],
  }, null);
  assert.equal(result.availability, "COMING_SOON");
  assert.equal(result.moreArrivingSoon, false);
  assert.doesNotMatch(JSON.stringify(result), /quantityPurchased|quantityReceived|unitsInbound|inventoryBatches/i);
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
