import "dotenv/config";

import { access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import express from "express";
import type { ErrorRequestHandler } from "express";
import { passport } from "./auth/passport";
import { requireAdmin, requireAdminPage } from "./auth/authorization";
import { adminSessionPool, createAdminSessionMiddleware } from "./auth/session";

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
import { createAuthRouter } from "./routes/auth";
import { mountApiRoutes } from "./routes/mountApiRoutes";
import {
  assertDatabaseEnvironment,
  databaseName,
  runtimeDatabaseUrl,
  TEST_DATABASE_NAME,
} from "./environment";
import { prisma } from "./prisma";
import { captureBusinessPositionSnapshot } from "./services/businessPosition";

const app = express();
const environment = assertDatabaseEnvironment();
const production = process.env.NODE_ENV === "production";
const defaultPort = environment === "TEST" ? 3003 : 3002;
const port = process.env.PORT === undefined ? defaultPort : Number(process.env.PORT);
const frontendDistPath = path.resolve(process.cwd(), "dist");
const frontendIndexPath = path.join(frontendDistPath, "index.html");

if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) {
  throw new Error("PORT must be a whole number between 1 and 65535.");
}

// ---------------------------------------------------------
// MIDDLEWARE
// ---------------------------------------------------------

app.disable("x-powered-by");
if (production) {
  // Railway terminates TLS at its edge and forwards to one application hop.
  // A numeric hop count is intentionally narrower than trusting all proxies.
  app.set("trust proxy", 1);
}
app.use(express.json());
app.use(createAdminSessionMiddleware(production));
app.use(passport.initialize());
app.use(passport.session());

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

const authRouter = createAuthRouter({
  adminPassport: passport,
  production,
  onSuccessfulLogin: async (user) => {
    await prisma.adminUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
  },
});

mountApiRoutes(app, {
  auth: authRouter,
  funds: fundsRouter,
  inventory: inventoryRouter,
  orders: ordersRouter,
  packPools: packPoolsRouter,
  products: productsRouter,
  public: publicRouter,
  reports: reportsRouter,
  sales: salesRouter,
  shows: showsRouter,
  site: siteRouter,
  whatIfScenarios: whatIfScenariosRouter,
}, requireAdmin);

// In production this redirects before the admin SPA is served. The React gate
// applies the same behavior during Vite development, where Vite serves HTML.
app.use("/admin", requireAdminPage);

if (production) {
  app.use(express.static(frontendDistPath, {
    index: false,
    maxAge: "1h",
  }));

  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    res.set("Cache-Control", "no-cache");
    return res.sendFile(frontendIndexPath);
  });
}

const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  void _next;
  console.error(`Unhandled request error for ${req.method} ${req.originalUrl}:`, error);
  if (res.headersSent) return;
  if (req.originalUrl.startsWith("/api/")) {
    res.status(500).json({ error: "Internal server error" });
    return;
  }
  res.status(500).type("text").send("Internal server error");
};
app.use(errorHandler);

// ---------------------------------------------------------
// SERVER
// ---------------------------------------------------------

async function start() {
  const connected = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  const connectedDatabase = connected[0]?.name;
  const configuredDatabase = databaseName(runtimeDatabaseUrl());
  if (connectedDatabase !== configuredDatabase) {
    throw new Error(`Connected database ${connectedDatabase ?? "unknown"} does not match the configured database; refusing to start.`);
  }
  if (environment === "TEST" && connectedDatabase !== TEST_DATABASE_NAME) {
    throw new Error(`TEST API connected to ${connectedDatabase ?? "unknown"}, not ${TEST_DATABASE_NAME}; refusing to start.`);
  }
  if (production) await access(frontendIndexPath);

  await captureBusinessPositionSnapshot();
  const snapshotTimer = setInterval(() => {
    void captureBusinessPositionSnapshot().catch(error => console.error("Scheduled business position snapshot failed:", error));
  }, 60 * 60 * 1000);
  snapshotTimer.unref();

  const server = app.listen(port, () => {
    console.log(`Double Rare Collectibles listening on port ${port} (${environment}).`);
  });

  const shutdown = (signal: string) => {
    console.log(`${signal} received; shutting down.`);
    server.close(() => {
      void Promise.all([
        prisma.$disconnect(),
        adminSessionPool.end(),
      ]).finally(() => process.exit(0));
    });
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(path.resolve(entryPath)).href) {
  start().catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown startup error";
    console.error(`Server startup failed: ${message}`);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
}

export { app, start };
