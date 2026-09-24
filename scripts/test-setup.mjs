import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { parse } from "dotenv";

const TEST_DATABASE = "double_rare_collectibles_test";
if (existsSync(".env.test")) {
  console.log(".env.test already exists; leaving it unchanged.");
  process.exit(0);
}
const real = parse(readFileSync(".env"));
const direct = real.DIRECT_DATABASE_URL;
if (!direct) throw new Error(".env must contain DIRECT_DATABASE_URL.");
const url = new URL(direct);
const realName = decodeURIComponent(url.pathname.slice(1));
if (!realName || realName === TEST_DATABASE || /(^|_)test($|_)/i.test(realName)) throw new Error("The REAL database URL does not identify a safe non-TEST database.");
url.pathname = `/${TEST_DATABASE}`;
const quote = value => JSON.stringify(value);
writeFileSync(".env.test", `APP_ENV=TEST\nDIRECT_DATABASE_URL=${quote(url.toString())}\n`, { mode: 0o600, flag: "wx" });
console.log(`Created .env.test for isolated database ${TEST_DATABASE}.`);
