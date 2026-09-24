# Isolated TEST environment

The same React app, Express routes, Prisma schema, and business logic run in both environments. `npm run dev` proxies `/api` to port 3002 and has no TEST banner. `npm run dev:test` uses port 5174, proxies `/api` only to port 3003, and displays **TEST ENVIRONMENT — DISPOSABLE DATA** on every page. The TEST API refuses to start unless `APP_ENV=TEST` and `DIRECT_DATABASE_URL` names `double_rare_collectibles_test`. The REAL API refuses a TEST database name.

## Windows PowerShell: REAL

Use the existing `.env` for the real PostgreSQL connection. Start the existing database service if it is not already running.

Terminal 2:

```powershell
npx tsx src/server/server.ts
```

Terminal 3:

```powershell
npm run dev
```

Open `http://localhost:5173`. The REAL API is on port 3002.

## Windows PowerShell: TEST

The one-time setup command creates ignored `.env.test` using the same local PostgreSQL credentials as `.env`, with the database name changed to `double_rare_collectibles_test`. Inspect `.env.test` privately if your PostgreSQL setup requires a different host or port. [`.env.test.example`](.env.test.example) shows the required keys. The TEST database must be reachable as an actual separate PostgreSQL database; the reset refuses a connection that lands in another database.

Terminal 1, one time:

```powershell
npm run test:setup
npm run test:reset
```

Terminal 2:

```powershell
npm run server:test
```

Terminal 3:

```powershell
npm run dev:test
```

Open `http://localhost:5174`. The TEST API is on port 3003. To restore the same disposable scenario later, stop the TEST API and run `npm run test:reset`, then restart the TEST API.

`test:reset` verifies `APP_ENV=TEST`, the exact URL database name, that it differs from `.env`, and `SELECT current_database()` before applying migrations or deleting records. It creates the named TEST database if needed, applies existing migrations to it, truncates only TEST business tables, and seeds deterministic data. Migration history and the REAL database are untouched. The old `scripts/reset-business-data.ts` is a separate, explicitly confirmed real-data reset and is not called by TEST scripts.

The seed includes sealed products and a case catalog entry, three finalized orders and one draft, nine sales across May–September 2026, two recurring Shows with four finalized visits, Cash and Digital Singles snapshots and fund entries, FIFO sale allocations, and current stock including a sold-out product. Reports trends and comparisons use these real records.

**Current local PostgreSQL limitation:** This workspace's existing `localhost:51214` endpoint reports `template1` even when the connection URL names `double_rare_collectibles_test`. The reset guard therefore stops before migrations or seed. Configure `.env.test` to use a PostgreSQL listener that honors the database name, then rerun `npm run test:reset`. Do not bypass the guard or point `.env.test` at `template1`.
