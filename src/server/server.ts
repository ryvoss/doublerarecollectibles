import express from "express";

import productsRouter from "./routes/products";
import ordersRouter from "./routes/orders";
import inventoryRouter from "./routes/inventory";
import salesRouter from "./routes/sales";
import showsRouter from "./routes/shows";
import fundsRouter from "./routes/funds";
import reportsRouter from "./routes/reports";
import whatIfScenariosRouter from "./routes/whatIfScenarios";
import publicRouter from "./routes/public";
import siteRouter from "./routes/site";
import packPoolsRouter from "./routes/packPools";
import { assertDatabaseEnvironment } from "./environment";
import { TEST_DATABASE_NAME } from "./environment";
import { prisma } from "./prisma";
import { captureBusinessPositionSnapshot } from "./services/businessPosition";

const app = express();
const environment = assertDatabaseEnvironment();
const PORT = environment === "TEST" ? 3003 : 3002;

// ---------------------------------------------------------
// MIDDLEWARE
// ---------------------------------------------------------

app.use(express.json());

// Refresh today's reporting snapshot after successful business mutations.
// This runs after the response completes and cannot participate in or alter
// the transactional workflow that produced the business change.
app.use((req, res, next) => {
  const isPublicMerchandisingUpdate =
    req.path === "/api/products/public-listings" ||
    /^\/api\/products\/\d+\/image$/.test(req.path);
  const capturesPosition = !isPublicMerchandisingUpdate && req.method !== "GET" &&
    ["/api/orders", "/api/sales", "/api/shows", "/api/funds", "/api/products", "/api/pack-pools"]
      .some(prefix => req.path.startsWith(prefix));
  if (capturesPosition) res.on("finish", () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      void captureBusinessPositionSnapshot().catch(error => console.error("Post-transaction business position snapshot failed:", error));
    }
  });
  next();
});

// ---------------------------------------------------------
// HEALTH
// ---------------------------------------------------------

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    message: "Double Rare Collectibles API is running",
  });
});

// ---------------------------------------------------------
// ROUTES
// ---------------------------------------------------------

app.use("/api/products", productsRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/sales", salesRouter);
app.use("/api/shows", showsRouter);
app.use("/api/funds", fundsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/what-if-scenarios", whatIfScenariosRouter);
app.use("/api/site", siteRouter);
app.use("/api/public", publicRouter);
app.use("/api/pack-pools", packPoolsRouter);

// ---------------------------------------------------------
// SERVER
// ---------------------------------------------------------

async function start() {
  if (environment === "TEST") {
    const connected = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
    if (connected[0]?.name !== TEST_DATABASE_NAME) throw new Error(`TEST API connected to ${connected[0]?.name ?? "unknown"}, not ${TEST_DATABASE_NAME}; refusing to start.`);
  }
  await captureBusinessPositionSnapshot();
  const snapshotTimer = setInterval(() => {
    void captureBusinessPositionSnapshot().catch(error => console.error("Scheduled business position snapshot failed:", error));
  }, 60 * 60 * 1000);
  snapshotTimer.unref();
  app.listen(PORT, () => console.log(`API running at http://localhost:${PORT}`));
}

start().catch(error => { console.error(error); process.exitCode = 1; void prisma.$disconnect(); });
