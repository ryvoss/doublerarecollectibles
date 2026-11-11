import "dotenv/config";
import { Client } from "pg";
// Check the live connection, not only the name in its URL. Some local Prisma
// runtimes accept arbitrary database names but route every connection to template1.
const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("A PostgreSQL database URL is required.");
const expected = decodeURIComponent(new URL(connectionString).pathname.slice(1));
if (!expected || (process.env.APP_ENV === "TEST" && expected !== "double_rare_collectibles_test")) throw new Error("Unexpected database identity configuration.");
const client = new Client({ connectionString });
try {
  await client.connect();
  const result = await client.query("SELECT current_database() AS name");
  if (result.rows[0]?.name !== expected) throw new Error(`Database identity mismatch: expected ${expected}, connected to ${result.rows[0]?.name}. No migrations executed.`);
  console.log(`Verified database identity: ${expected}`);
} finally { await client.end(); }
