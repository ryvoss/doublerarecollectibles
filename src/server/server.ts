import express from "express";

import productsRouter from "./routes/products";
import ordersRouter from "./routes/orders";
import inventoryRouter from "./routes/inventory";
import salesRouter from "./routes/sales";
import showsRouter from "./routes/shows";

const app = express();
const PORT = 3002;

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

// ---------------------------------------------------------
// SERVER
// ---------------------------------------------------------

app.listen(PORT, () => {
  console.log(`API running at http://localhost:${PORT}`);
});