import assert from "node:assert/strict";
import test from "node:test";
import {
  isRecentPriceDrop,
  primaryMerchandisingBadge,
  resolvePublicPriceUpdate,
  selectComingSoonProducts,
  selectHomepageMerchandise,
  suggestedCompareAtPrice,
  type PublicInventoryItem,
} from "./publicInventory";

const now = new Date("2026-10-14T12:00:00.000Z");

function product(
  id: number,
  values: Partial<PublicInventoryItem> = {},
): PublicInventoryItem {
  return {
    id,
    name: `Product ${id}`,
    shortDescription: null,
    imageUrl: null,
    displayPrice: 40,
    compareAtPrice: null,
    recentPriceDrop: false,
    featured: false,
    availability: "IN_STOCK",
    moreArrivingSoon: false,
    ...values,
  };
}

test("recent price drops require a lower public price and a timestamp within 30 days", () => {
  assert.equal(isRecentPriceDrop({
    publicPrice: 39,
    compareAtPrice: 45,
    priceUpdatedAt: new Date("2026-10-01T12:00:00.000Z"),
  }, now), true);
  assert.equal(isRecentPriceDrop({
    publicPrice: 39,
    compareAtPrice: 45,
    priceUpdatedAt: new Date("2026-09-01T12:00:00.000Z"),
  }, now), false);
  assert.equal(isRecentPriceDrop({
    publicPrice: 46,
    compareAtPrice: 45,
    priceUpdatedAt: now,
  }, now), false);
});

test("admin price changes preserve meaningful references and do not badge increases", () => {
  assert.equal(suggestedCompareAtPrice(45, 39, null), 45);
  assert.equal(suggestedCompareAtPrice(45, 39, 50), 50);
  assert.equal(suggestedCompareAtPrice(45, 46, null), null);
  const lowered = resolvePublicPriceUpdate({
    publicPrice: 45,
    compareAtPrice: null,
    priceUpdatedAt: null,
  }, { publicPrice: 39 }, now);
  assert.deepEqual(lowered, {
    publicPrice: 39,
    compareAtPrice: 45,
    priceUpdatedAt: now,
  });

  const preserved = resolvePublicPriceUpdate({
    publicPrice: 45,
    compareAtPrice: 50,
    priceUpdatedAt: null,
  }, { publicPrice: 39 }, now);
  assert.equal(preserved.compareAtPrice, 50);
  assert.equal(preserved.priceUpdatedAt, now);

  const increased = resolvePublicPriceUpdate({
    publicPrice: 39,
    compareAtPrice: 45,
    priceUpdatedAt: new Date("2026-10-10T12:00:00.000Z"),
  }, { publicPrice: 42 }, now);
  assert.equal(increased.compareAtPrice, 45);
  assert.equal(increased.priceUpdatedAt, null);

  const belowFallback = resolvePublicPriceUpdate({
    publicPrice: null,
    compareAtPrice: null,
    priceUpdatedAt: null,
  }, { publicPrice: 39, compareAtPrice: 45 }, now);
  assert.equal(belowFallback.priceUpdatedAt, now);
});

test("Coming Soon wins the single badge when zero-on-hand stock also has a price drop", () => {
  assert.equal(primaryMerchandisingBadge(product(1, {
    availability: "COMING_SOON",
    recentPriceDrop: true,
    featured: true,
  })), "COMING_SOON");
  assert.equal(primaryMerchandisingBadge(product(2, {
    availability: "LOW_STOCK",
    recentPriceDrop: true,
    featured: true,
  })), "RECENT_PRICE_DROP");
  assert.equal(primaryMerchandisingBadge(product(3, {
    featured: true,
  })), "FEATURED");
});

test("homepage prioritizes recent drops, avoids duplicates, and uses sold out only as fallback", () => {
  const drop = product(1, { recentPriceDrop: true });
  const featured = product(2, { featured: true });
  const coming = product(3, { availability: "COMING_SOON" });
  const standard = product(4);
  const soldOutDrop = product(5, { recentPriceDrop: true, availability: "SOLD_OUT" });
  const selected = selectHomepageMerchandise([
    featured,
    soldOutDrop,
    standard,
    drop,
    coming,
    drop,
  ], 4);
  assert.deepEqual(selected.map(item => item.id), [1, 2, 3, 4]);
  assert.equal(new Set(selected.map(item => item.id)).size, selected.length);
});

test("homepage merchandising obeys configurable sources and explicit sold-out fallback", () => {
  const products = [
    product(1, { recentPriceDrop: true }),
    product(2, { featured: true }),
    product(3, { availability: "COMING_SOON" }),
    product(4),
    product(5, { featured: true, availability: "SOLD_OUT" }),
  ];
  assert.deepEqual(selectHomepageMerchandise(products, {
    limit: 6,
    prioritizeRecentDrops: false,
    includeFeatured: true,
    includeComingSoon: false,
    fallback: "NONE",
  }).map((item) => item.id), [2]);
  assert.deepEqual(selectHomepageMerchandise(products, {
    limit: 6,
    prioritizeRecentDrops: true,
    includeFeatured: true,
    includeComingSoon: true,
    fallback: "INCLUDING_SOLD_OUT",
  }).map((item) => item.id), [1, 2, 3, 4, 5]);
});

test("dedicated Coming Soon selection contains only inbound-derived availability", () => {
  assert.deepEqual(selectComingSoonProducts([
    product(1),
    product(2, { availability: "COMING_SOON" }),
    product(3, { availability: "SOLD_OUT" }),
    product(4, { availability: "COMING_SOON" }),
  ], 1).map((item) => item.id), [2]);
});
