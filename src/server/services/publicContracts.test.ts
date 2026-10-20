import assert from "node:assert/strict";
import test from "node:test";
import { PUBLIC_SITE_DEFAULTS } from "../../shared/publicSite";
import { normalizeHomepageSections, toPublicInventoryItem, toPublicSiteSettings } from "./publicContracts";

test("public inventory mapping returns only the customer contract", () => {
  const source = {
    id: 7,
    name: "Internal canonical name",
    displayName: "Customer name",
    shortDescription: "Customer description",
    imageKey: "products/7/private-key.png",
    publicPrice: null,
    compareAtPrice: null,
    priceUpdatedAt: null,
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
    "availability", "compareAtPrice", "displayPrice", "featured", "id", "imageUrl", "moreArrivingSoon", "name", "recentPriceDrop", "shortDescription",
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
    compareAtPrice: null,
    priceUpdatedAt: null,
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

test("public availability stays In Stock when on-hand and inbound inventory both exist", () => {
  const result = toPublicInventoryItem({
    id: 10,
    name: "Restocking product",
    displayName: null,
    shortDescription: null,
    publicPrice: 30,
    compareAtPrice: null,
    priceUpdatedAt: null,
    expectedSalePrice: 30,
    featured: false,
    inventoryBatches: [{
      quantityPurchased: 8,
      quantityReceived: 4,
      quantitySold: 0,
      quantityConverted: 0,
    }],
  }, null);
  assert.equal(result.availability, "IN_STOCK");
  assert.equal(result.moreArrivingSoon, true);
  assert.doesNotMatch(JSON.stringify(result), /unitsInbound|quantityPurchased|quantityReceived/i);
});

test("public inventory derives and expires a safe recent price-drop flag", () => {
  const now = new Date("2026-10-14T12:00:00.000Z");
  const source = {
    id: 9,
    name: "Price drop product",
    displayName: null,
    shortDescription: null,
    publicPrice: 39,
    compareAtPrice: 45,
    priceUpdatedAt: new Date("2026-10-01T12:00:00.000Z"),
    expectedSalePrice: 45,
    featured: false,
    inventoryBatches: [{ quantityPurchased: 2, quantityReceived: 2, quantitySold: 0, quantityConverted: 0 }],
  };
  const result = toPublicInventoryItem(source, null, now);
  assert.equal(result.displayPrice, 39);
  assert.equal(result.compareAtPrice, 45);
  assert.equal(result.recentPriceDrop, true);
  assert.doesNotMatch(JSON.stringify(result), /priceUpdatedAt/);

  const expired = toPublicInventoryItem({
    ...source,
    priceUpdatedAt: new Date("2026-08-01T12:00:00.000Z"),
  }, null, now);
  assert.equal(expired.recentPriceDrop, false);
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

test("homepage section normalization preserves valid ordering and restores missing safe defaults", () => {
  const sections = normalizeHomepageSections([
    { key: "CONTACT", visible: false },
    { key: "HERO", visible: true },
    { key: "NOT_REAL", visible: true },
  ]);
  assert.deepEqual(sections.slice(1, 3), [
    { key: "CONTACT", visible: false },
    { key: "HERO", visible: true },
  ]);
  assert.deepEqual(sections[0], { key: "UPDATES", visible: true });
  assert.equal(sections.length, 7);
  assert.equal(new Set(sections.map((section) => section.key)).size, 7);
});

test("the legacy default layout upgrades to inventory-first while preserving visibility", () => {
  const sections = normalizeHomepageSections([
    { key: "HERO", visible: false }, { key: "MERCHANDISING", visible: true },
    { key: "COMING_SOON", visible: false }, { key: "NEXT_SHOW", visible: true },
    { key: "BUY_SELL_TRADE", visible: true }, { key: "CONTACT", visible: false },
  ]);
  assert.deepEqual(sections.map((section) => section.key), ["UPDATES", "MERCHANDISING", "COMING_SOON", "NEXT_SHOW", "BUY_SELL_TRADE", "HERO", "CONTACT"]);
  assert.equal(sections.find((section) => section.key === "HERO")?.visible, false);
  assert.equal(sections.find((section) => section.key === "CONTACT")?.visible, false);
});
