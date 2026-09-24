import express from "express";

import productsRouter from "./routes/products";
import ordersRouter from "./routes/orders";
import inventoryRouter from "./routes/inventory";
import salesRouter from "./routes/sales";
import showsRouter from "./routes/shows";
import fundsRouter from "./routes/funds";
import reportsRouter from "./routes/reports";
import { assertDatabaseEnvironment } from "./environment";
import { TEST_DATABASE_NAME } from "./environment";
import { prisma } from "./prisma";

const app = express();
const environment = assertDatabaseEnvironment();
const PORT = environment === "TEST" ? 3003 : 3002;

// ---------------------------------------------------------
// MIDDLEWARE
// ---------------------------------------------------------

app.use(express.json());

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

// ---------------------------------------------------------
// SERVER
// ---------------------------------------------------------

async function start() {
  if (environment === "TEST") {
    const connected = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
    if (connected[0]?.name !== TEST_DATABASE_NAME) throw new Error(`TEST API connected to ${connected[0]?.name ?? "unknown"}, not ${TEST_DATABASE_NAME}; refusing to start.`);
  }
  app.listen(PORT, () => console.log(`API running at http://localhost:${PORT}`));
}

start().catch(error => { console.error(error); process.exitCode = 1; void prisma.$disconnect(); });
