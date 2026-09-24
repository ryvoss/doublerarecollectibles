import { Client } from "pg";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";

const TEST_DATABASE = "double_rare_collectibles_test";
const current = process.env.DIRECT_DATABASE_URL;
const real = parse(readFileSync(".env")).DIRECT_DATABASE_URL;
if (process.env.APP_ENV !== "TEST" || !current || !real) throw new Error("Reset requires APP_ENV=TEST, .env.test, and a REAL .env database URL.");
const testUrl = new URL(current), realUrl = new URL(real);
const name = decodeURIComponent(testUrl.pathname.slice(1));
if (name !== TEST_DATABASE) throw new Error(`Reset refuses database ${name}; expected ${TEST_DATABASE}.`);
if (current === real || name === decodeURIComponent(realUrl.pathname.slice(1))) throw new Error("Reset refuses the REAL database.");
if (testUrl.hostname !== realUrl.hostname || testUrl.port !== realUrl.port) throw new Error("TEST database must be on the configured local PostgreSQL server.");
process.env.SHADOW_DATABASE_URL = "";
const admin = new Client({ connectionString: real });
await admin.connect();
try {
  const connected = await admin.query("SELECT current_database() AS name");
  if (connected.rows[0].name === TEST_DATABASE) throw new Error("Admin connection unexpectedly points to TEST.");
  const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [TEST_DATABASE]);
  if (!existing.rowCount) {
    await admin.query(`CREATE DATABASE "${TEST_DATABASE}"`);
    console.log(`Created TEST database ${TEST_DATABASE}.`);
  }
} finally { await admin.end(); }
const target = new Client({ connectionString: current });
await target.connect();
try {
  const connected = await target.query("SELECT current_database() AS name");
  if (connected.rows[0].name !== TEST_DATABASE) throw new Error(`TEST URL connected to ${connected.rows[0].name}, not ${TEST_DATABASE}; refusing migrations and seed.`);
} finally { await target.end(); }
const run = (args) => {
  const result = spawnSync(process.execPath, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) throw new Error(`Command failed with exit code ${result.status}: node ${args.join(" ")}`);
};
run(["node_modules/prisma/build/index.js", "migrate", "deploy"]);
run(["--import", "tsx", "scripts/test-seed.ts"]);
