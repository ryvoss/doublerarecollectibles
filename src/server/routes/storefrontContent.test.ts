import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import request from "supertest";
import { createPublicEditorialRouter, createStorefrontContentRouter } from "./storefrontContent";
import type { StorefrontRepository } from "../services/storefrontContent";
import { publishedNews, toPublicNews, toPublicNewsSummary, type StorefrontContent } from "../../shared/storefrontContent";
import { safeErrorHandler } from "../security/errorHandler";

const fixture: StorefrontContent = {
  categories: [{ id: 1, name: "Boxes", slug: "boxes", visible: true, sortOrder: 0, productIds: [1, 999] }],
  news: [
    { id: 1, title: "Published", slug: "published", summary: "Summary", body: "Plain body", published: true, publishAt: "2026-01-01T00:00:00Z", imageUrl: null },
    { id: 2, title: "Private draft", slug: "private-draft", summary: "Secret", body: "Secret body", published: false, publishAt: "2026-01-01T00:00:00Z", imageUrl: null },
    { id: 3, title: "Future", slug: "future", summary: "Future", body: "Not yet", published: true, publishAt: "2099-01-01T00:00:00Z", imageUrl: null },
  ],
  announcements: [{ id: 1, title: "Read the news", summary: "News summary", type: "NEWS", imageUrl: null, published: true, sortOrder: 0, startsAt: null, endsAt: null, destination: "NEWS", destinationSlug: "published" }],
};
function setup(content = fixture) {
  const writes: unknown[] = [];
  const repository: StorefrontRepository = {
    read: async () => content,
    listNewsPage: async (page) => {
      const posts = publishedNews(content.news);
      return { posts: posts.slice((page - 1) * 12, page * 12).map(toPublicNewsSummary), hasMore: posts.length > page * 12 };
    },
    findNewsArticle: async (slug) => { const post = publishedNews(content.news).find((post) => post.slug === slug); return post ? toPublicNews(post) : null; },
    save: async (...args) => { writes.push(args); }, remove: async (...args) => { writes.push(args); },
  };
  const app = express(); app.use(express.json());
  app.use("/public", createPublicEditorialRouter(repository, async () => [1]));
  app.use("/content", createStorefrontContentRouter(repository));
  app.use(safeErrorHandler);
  return { app, writes, repository };
}

test("public editorial and news routes exclude draft fields, private assignments, and article bodies in listings", async () => {
  const { app } = setup();
  const editorial = await request(app).get("/public/editorial").expect(200);
  assert.match(editorial.headers["cache-control"], /no-store/);
  assert.deepEqual(editorial.body.categories[0], { name: "Boxes", slug: "boxes", productIds: [1] });
  assert.equal(editorial.body.announcements[0].href, "/news/published");
  assert.doesNotMatch(JSON.stringify(editorial.body), /999|Private draft|Secret body|"published"\s*:|destinationSlug|sortOrder/);
  const news = await request(app).get("/public/news").expect(200);
  assert.equal(news.body.posts.length, 1);
  assert.deepEqual(Object.keys(news.body.posts[0]).sort(), ["imageUrl", "publishAt", "slug", "summary", "title"]);
  await request(app).get("/public/news/private-draft").expect(404);
  await request(app).get("/public/news/future").expect(404);
  const article = await request(app).get("/public/news/published").expect(200);
  assert.equal(article.body.body, "Plain body");
  assert.doesNotMatch(JSON.stringify(article.body), /"id"|"published"\s*:|sortOrder/);
});

test("news pagination is bounded and article paths reject malformed slugs", async () => {
  const news = Array.from({ length: 14 }, (_, index) => ({ ...fixture.news[0]!, id: index + 10, slug: `post-${index}` }));
  const { app } = setup({ ...fixture, news });
  const first = await request(app).get("/public/news").expect(200);
  assert.equal(first.body.posts.length, 12); assert.equal(first.body.hasMore, true);
  const second = await request(app).get("/public/news?page=2").expect(200);
  assert.equal(second.body.posts.length, 2); assert.equal(second.body.hasMore, false);
  await request(app).get("/public/news?page=-1").expect(400);
  await request(app).get("/public/news?page=1.5").expect(400);
  await request(app).get("/public/news/Bad%20Slug").expect(404);
});

test("actual content handlers validate creates, assignment changes, updates, and deletions", async () => {
  const { app, writes } = setup();
  const category = { name: "Booster Boxes", slug: "booster-boxes", visible: false, sortOrder: 2, productIds: [1, 1] };
  await request(app).post("/content/categories").send(category).expect(201);
  assert.deepEqual(writes[0], ["categories", null, { ...category, productIds: [1] }]);
  await request(app).put("/content/categories/1").send({ ...category, productIds: [] }).expect(200);
  assert.deepEqual(writes[1], ["categories", 1, { ...category, productIds: [] }]);
  await request(app).delete("/content/categories/1").expect(200);
  assert.deepEqual(writes[2], ["categories", 1]);
  await request(app).post("/content/categories").send({ ...category, quantityReceived: 99 }).expect(400);
  await request(app).put("/content/categories/not-an-id").send(category).expect(404);
  await request(app).post("/content/unknown").send(category).expect(404);
  assert.equal(writes.length, 3);
});

test("duplicate slugs and missing records produce controlled errors", async () => {
  const { app, repository } = setup();
  const category = { name: "Boxes", slug: "boxes", visible: true, sortOrder: 0, productIds: [] };
  repository.save = async () => { throw Object.assign(new Error("private database details"), { code: "P2002" }); };
  const conflict = await request(app).post("/content/categories").send(category).expect(409);
  assert.doesNotMatch(JSON.stringify(conflict.body), /database/);
  repository.remove = async () => { throw Object.assign(new Error("private database details"), { code: "P2025" }); };
  await request(app).delete("/content/news/1").expect(404);
});
