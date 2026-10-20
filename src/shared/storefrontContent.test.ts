import assert from "node:assert/strict";
import test from "node:test";
import { contentDestinationPath, filterStorefrontInventory, inventoryBrowseState, publicEditorial, publishedNews, toPublicNews, validateContent, validEditorialImage, validStorefrontSlug, type StorefrontContent, type StorefrontAnnouncement, type StorefrontNewsPost } from "./storefrontContent";
import { upcomingPublicShows } from "./publicSite";
import { publicAvailabilityForUnits, selectHomepageMerchandise, type PublicInventoryItem } from "./publicInventory";

const now = new Date("2026-10-19T12:00:00Z");
const post: StorefrontNewsPost = { id: 1, title: "At the table", slug: "at-the-table", summary: "Collector news", body: "Plain text.", imageUrl: null, published: true, publishAt: "2026-10-18T12:00:00Z" };
const announcement: StorefrontAnnouncement = { id: 1, title: "Hello collectors", summary: "Read our update", type: "NEWS", imageUrl: null, published: true, sortOrder: 0, startsAt: null, endsAt: null, destination: "NEWS", destinationSlug: post.slug };
const content: StorefrontContent = { news: [post], categories: [
  { id: 1, name: "Boxes", slug: "boxes", visible: true, sortOrder: 2, productIds: [1, 99] },
  { id: 2, name: "Accessories", slug: "accessories", visible: true, sortOrder: 0, productIds: [2] },
  { id: 3, name: "Private", slug: "private", visible: false, sortOrder: 1, productIds: [99] },
], announcements: [announcement] };

test("category visibility, explicit ordering, and assignments expose only public products", () => {
  const result = publicEditorial(content, [1, 2], now);
  assert.deepEqual(result.categories, [{ name: "Accessories", slug: "accessories", productIds: [2] }, { name: "Boxes", slug: "boxes", productIds: [1] }]);
  assert.doesNotMatch(JSON.stringify(result), /sortOrder|published|destinationSlug|99|Private/);
  assert.deepEqual(Object.keys(result.announcements[0]!).sort(), ["date", "href", "imageUrl", "summary", "title", "type"]);
});

test("announcements honor publication and exact schedule boundaries", () => {
  const select = (change: Partial<StorefrontAnnouncement>) => publicEditorial({ ...content, announcements: [{ ...announcement, ...change }] }, [1], now).announcements;
  assert.equal(select({ published: false }).length, 0);
  assert.equal(select({ startsAt: "2026-10-20T12:00:00Z" }).length, 0);
  assert.equal(select({ startsAt: now.toISOString() }).length, 1);
  assert.equal(select({ endsAt: now.toISOString() }).length, 0);
  assert.equal(select({ endsAt: "2026-10-20T12:00:00Z" }).length, 1);
  const ordered = publicEditorial({ ...content, announcements: [{ ...announcement, id: 2, sortOrder: 5 }, announcement] }, [1], now);
  assert.equal(ordered.announcements.length, 2);
});

test("announcements never lead to hidden, deleted, draft, or future destinations", () => {
  assert.equal(publicEditorial({ ...content, news: [{ ...post, published: false }] }, [1], now).announcements.length, 0);
  assert.equal(publicEditorial({ ...content, news: [{ ...post, publishAt: "2026-10-20T12:00:00Z" }] }, [1], now).announcements.length, 0);
  assert.equal(publicEditorial({ ...content, news: [] }, [1], now).announcements.length, 0);
  const toCategory = { ...announcement, destination: "CATEGORY" as const, destinationSlug: "boxes" };
  assert.equal(publicEditorial({ ...content, announcements: [toCategory] }, [1], now).announcements[0]?.href, "/inventory?category=boxes");
  assert.equal(publicEditorial({ ...content, announcements: [{ ...toCategory, destinationSlug: "private" }] }, [1], now).announcements.length, 0);
});

test("news drafts and scheduled posts stay private, with deterministic newest-first order", () => {
  const posts = publishedNews([{ ...post, id: 2, published: false }, { ...post, id: 3, publishAt: "2027-01-01T00:00:00Z" }, post, { ...post, id: 4, slug: "today", publishAt: now.toISOString() }], now);
  assert.deepEqual(posts.map((item) => item.slug), ["today", post.slug]);
  assert.deepEqual(Object.keys(toPublicNews({ ...post, internalNotes: "private" } as StorefrontNewsPost)).sort(), ["body", "imageUrl", "publishAt", "slug", "summary", "title"]);
});

test("destinations are controlled routes with URL-encoded slugs", () => {
  assert.equal(contentDestinationPath("RECENT_DROPS", null), "/inventory?view=recent-drops");
  assert.equal(contentDestinationPath("NEWS", "a/b"), "/news/a%2Fb");
  for (const path of [contentDestinationPath("INVENTORY", null), contentDestinationPath("SHOWS", null), contentDestinationPath("BUY_SELL_TRADE", null), contentDestinationPath("CONTACT", null)]) assert.match(path, /^\/[a-z-]+$/);
});

test("content validation rejects unknown fields, unsafe slugs, media, destinations, and schedules", () => {
  const { id: _categoryId, ...category } = content.categories[0]!;
  const { id: _postId, ...news } = post;
  const { id: _announcementId, ...update } = announcement;
  assert.equal(typeof validateContent("categories", category), "object");
  assert.equal(typeof validateContent("news", news), "object");
  assert.equal(typeof validateContent("announcements", update), "object");
  for (const slug of ["../admin", "Bad slug", "-start", "two--dashes", "javascript:alert(1)", "a/../b"]) assert.equal(validStorefrontSlug(slug), false);
  assert.equal(validStorefrontSlug("booster-boxes-2026"), true);
  for (const image of ["https://tracker.example/a.png", "javascript:alert(1)", "/api/public/product-images/1/../secret.png", "data:image/svg+xml,test"]) assert.equal(validEditorialImage(image), false);
  assert.equal(validEditorialImage("/api/public/product-images/1/abcd-1234.png"), true);
  for (const change of [{ productIds: [0] }, { productIds: [-1] }, { visible: "true" }, { sortOrder: -1 }, { extra: true }, { slug: "bad slug" }]) assert.equal(typeof validateContent("categories", { ...category, ...change }), "string");
  assert.equal(typeof validateContent("news", { ...news, publishAt: "2026-01-01" }), "string");
  for (const change of [{ destination: "javascript:alert(1)" }, { destination: "CATEGORY", destinationSlug: null }, { startsAt: "2026-10-20T00:00:00Z", endsAt: "2026-10-19T00:00:00Z" }, { imageUrl: "https://external.example/a.png" }, { type: "FAKE" }]) assert.equal(typeof validateContent("announcements", { ...update, ...change }), "string");
});

test("category assignments are deduplicated without changing products", () => {
  const { id: _id, ...category } = content.categories[0]!;
  const result = validateContent("categories", { ...category, productIds: [1, 1, 2] });
  assert.ok(typeof result !== "string" && "productIds" in result);
  assert.deepEqual(result.productIds, [1, 2]);
});

const products: PublicInventoryItem[] = [1, 2, 3].map((id) => ({ id, name: `Box ${id}`, shortDescription: null, imageUrl: null, displayPrice: 45, compareAtPrice: null, recentPriceDrop: id === 2, featured: id === 1, availability: id === 3 ? "COMING_SOON" : "IN_STOCK", moreArrivingSoon: false }));
test("All Inventory resets every filter; categories, search, drops, and availability combine", () => {
  const categories = publicEditorial(content, [1, 2], now).categories;
  const all = inventoryBrowseState("");
  assert.deepEqual(filterStorefrontInventory(products, all, categories), products);
  assert.deepEqual(filterStorefrontInventory(products, inventoryBrowseState("?view=recent-drops"), categories).map((product) => product.id), [2]);
  assert.deepEqual(filterStorefrontInventory(products, inventoryBrowseState("?category=boxes"), categories).map((product) => product.id), [1]);
  assert.deepEqual(filterStorefrontInventory(products, inventoryBrowseState("?category=accessories&q=BOX%202&view=recent-drops"), categories).map((product) => product.id), [2]);
  assert.deepEqual(filterStorefrontInventory(products, inventoryBrowseState("?availability=COMING_SOON"), categories).map((product) => product.id), [3]);
  assert.deepEqual(filterStorefrontInventory(products, inventoryBrowseState("?category=missing"), categories), []);
  assert.equal(publicAvailabilityForUnits(0, 2), "COMING_SOON");
  assert.equal(publicAvailabilityForUnits(0, 0), "SOLD_OUT");
  assert.equal(publicAvailabilityForUnits(4, 10), "IN_STOCK");
});

test("public Shows are chronological and homepage merchandise excludes separately displayed inbound products", () => {
  const base = { venue: null, location: null, boothInfo: null, note: null };
  assert.deepEqual(upcomingPublicShows([{ ...base, name: "Later", date: "2026-11-01T00:00:00Z" }, { ...base, name: "Today", date: "2026-10-19T00:00:00Z" }, { ...base, name: "Past", date: "2026-10-18T00:00:00Z" }], now).map((show) => show.name), ["Today", "Later"]);
  const selected = selectHomepageMerchandise(products, { limit: 8, prioritizeRecentDrops: true, includeFeatured: true, includeComingSoon: false, fallback: "AVAILABLE" });
  assert.equal(selected.some((product) => product.availability === "COMING_SOON"), false);
  assert.equal(new Set(selected.map((product) => product.id)).size, selected.length);
});

test("homepage rotates sources so numerous price drops do not monopolize the feed", () => {
  const drops = Array.from({ length: 8 }, (_, index) => ({ ...products[1]!, id: 10 + index }));
  const result = selectHomepageMerchandise([...drops, products[0]!, products[2]!], 4);
  assert.deepEqual(result.map((product) => product.id), [10, 1, 3, 11]);
});
