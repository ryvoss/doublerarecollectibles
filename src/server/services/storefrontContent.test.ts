import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { prisma } from "../prisma";
import { createStorefrontRepository, StorefrontInputError } from "./storefrontContent";

function setup() {
  const writes: Array<{ action: string; data: unknown }> = [];
  let count = 2;
  const tx = {
    product: { count: async () => count },
    storefrontCategory: {
      create: async (data: unknown) => { writes.push({ action: "category-create", data }); },
      update: async (data: unknown) => { writes.push({ action: "category-update", data }); },
      delete: async (data: unknown) => { writes.push({ action: "category-delete", data }); },
      findUnique: async () => ({ visible: false }),
    },
    storefrontNewsPost: { findUnique: async () => ({ published: false }) },
    storefrontAnnouncement: { create: async () => { writes.push({ action: "announcement-create", data: null }); } },
  };
  const client = { ...tx, $transaction: async (callback: (value: typeof tx) => Promise<void>) => callback(tx) } as unknown as typeof prisma;
  return { repository: createStorefrontRepository(client), writes, setCount: (value: number) => { count = value; } };
}

test("category create/update atomically writes join assignments, and rejects unknown products first", async () => {
  const { repository, writes, setCount } = setup();
  const category = { name: "Boxes", slug: "boxes", visible: true, sortOrder: 0, productIds: [1, 2] };
  await repository.save("categories", null, category);
  assert.deepEqual(writes[0], { action: "category-create", data: { data: { name: "Boxes", slug: "boxes", visible: true, sortOrder: 0, products: { create: [{ productId: 1 }, { productId: 2 }] } } } });
  await repository.save("categories", 5, category);
  assert.deepEqual(writes[1], { action: "category-update", data: { where: { id: 5 }, data: { name: "Boxes", slug: "boxes", visible: true, sortOrder: 0, products: { deleteMany: {}, create: [{ productId: 1 }, { productId: 2 }] } } } });
  setCount(1);
  await assert.rejects(repository.save("categories", 5, category), StorefrontInputError);
  assert.equal(writes.length, 2);
  setCount(0);
  await repository.save("categories", 5, { ...category, productIds: [] });
  assert.deepEqual((writes[2]!.data as { data: { products: unknown } }).data.products, { deleteMany: {}, create: [] });
});

test("deleting a category only deletes the category; migration cascades only assignments", async () => {
  const { repository, writes } = setup();
  await repository.remove("categories", 5);
  assert.deepEqual(writes, [{ action: "category-delete", data: { where: { id: 5 } } }]);
  const sql = readFileSync(new URL("../../../prisma/migrations/20261019120000_storefront_editorial/migration.sql", import.meta.url), "utf8");
  assert.match(sql, /REFERENCES "StorefrontCategory"\("id"\) ON DELETE CASCADE/);
  assert.match(sql, /REFERENCES "Product"\("id"\) ON DELETE CASCADE/);
  assert.doesNotMatch(sql, /DROP |DELETE FROM|UPDATE "Product"|ALTER TABLE "Product"/);
});

test("published announcements reject hidden category and draft news destinations", async () => {
  const { repository, writes } = setup();
  const item = { type: "NEWS" as const, title: "Update", summary: "Summary", imageUrl: null, published: true, sortOrder: 0, startsAt: null, endsAt: null, destination: "NEWS" as const, destinationSlug: "draft" };
  await assert.rejects(repository.save("announcements", null, item), StorefrontInputError);
  await assert.rejects(repository.save("announcements", null, { ...item, destination: "CATEGORY" }), StorefrontInputError);
  assert.equal(writes.length, 0);
  await repository.save("announcements", null, { ...item, published: false });
  assert.equal(writes.length, 1);
});

test("public news queries paginate in PostgreSQL, exclude drafts, and do not fetch listing bodies", async () => {
  const queries: Array<Record<string, unknown>> = [];
  const row = { title: "News", slug: "news", summary: "Summary", imageUrl: null, publishAt: new Date("2026-01-01T00:00:00Z") };
  const repository = createStorefrontRepository({ storefrontNewsPost: {
    findMany: async (query: Record<string, unknown>) => { queries.push(query); return Array.from({ length: 13 }, () => row); },
    findFirst: async (query: Record<string, unknown>) => { queries.push(query); return { ...row, body: "Plain text" }; },
  } } as unknown as typeof prisma);
  const result = await repository.listNewsPage(2);
  assert.equal(result.posts.length, 12); assert.equal(result.hasMore, true);
  assert.equal(queries[0]!.skip, 12); assert.equal(queries[0]!.take, 13);
  assert.equal((queries[0]!.where as { published: boolean }).published, true);
  assert.equal("body" in (queries[0]!.select as object), false);
  const article = await repository.findNewsArticle("news");
  assert.equal(article?.body, "Plain text");
  assert.equal((queries[1]!.where as { slug: string }).slug, "news");
  assert.equal((queries[1]!.where as { published: boolean }).published, true);
});
