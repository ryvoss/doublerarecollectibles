// Run with: node --env-file=.env.test scripts/verify-storefront-migration.mjs
// All DDL and fixtures live in a unique test schema inside a rolled-back transaction.
import { Client } from "pg";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

const expectedDatabase = "double_rare_collectibles_test";
const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (process.env.APP_ENV !== "TEST" || !connectionString || decodeURIComponent(new URL(connectionString).pathname.slice(1)) !== expectedDatabase) {
  throw new Error("Verification requires APP_ENV=TEST and the explicitly named isolated test database.");
}
const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });
await client.connect();
try {
  const connected = await client.query("SELECT current_database() AS name");
  assert.equal(connected.rows[0].name, expectedDatabase, "Connected database identity does not match TEST; refusing DDL.");
  const schema = `storefront_qa_${randomUUID().replaceAll("-", "")}`;
  await client.query("BEGIN");
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET LOCAL search_path TO "${schema}"`);
  await client.query('CREATE TABLE "Product" ("id" INTEGER PRIMARY KEY, "name" TEXT NOT NULL)');
  const sql = await readFile(new URL("../prisma/migrations/20261019120000_storefront_editorial/migration.sql", import.meta.url), "utf8");
  await client.query(sql);
  await client.query('INSERT INTO "Product" VALUES (1, $1), (2, $2)', ["Fixture one", "Fixture two"]);
  await client.query('INSERT INTO "StorefrontCategory" ("name", "slug", "visible", "sortOrder") VALUES ($1, $2, true, 0)', ["Boxes", "boxes"]);
  await client.query('INSERT INTO "StorefrontCategoryProduct" VALUES (1, 1), (1, 2)');
  assert.equal((await client.query('SELECT * FROM "StorefrontCategoryProduct"')).rowCount, 2);
  await client.query('DELETE FROM "StorefrontCategory" WHERE "id" = 1');
  assert.equal((await client.query('SELECT * FROM "StorefrontCategoryProduct"')).rowCount, 0);
  assert.equal((await client.query('SELECT * FROM "Product"')).rowCount, 2);
  await client.query('INSERT INTO "StorefrontNewsPost" ("title", "slug", "summary", "body", "publishAt") VALUES ($1, $2, $3, $4, now())', ["Draft", "draft", "Summary", "Plain text"]);
  assert.equal((await client.query('SELECT "published" FROM "StorefrontNewsPost"')).rows[0].published, false);
  await client.query('INSERT INTO "StorefrontAnnouncement" ("type", "title", "summary", "destination") VALUES ($1, $2, $3, $4)', ["NEWS", "Update", "Summary", "INVENTORY"]);
  assert.equal((await client.query('SELECT "published" FROM "StorefrontAnnouncement"')).rows[0].published, false);
  await client.query("ROLLBACK");
  assert.equal((await client.query("SELECT 1 FROM information_schema.schemata WHERE schema_name = $1", [schema])).rowCount, 0);
  console.log("PASS: migration SQL, category cascades, retained Products, draft defaults, and full rollback verified on isolated TEST database.");
} finally {
  await client.query("ROLLBACK").catch(() => undefined);
  await client.end();
}
