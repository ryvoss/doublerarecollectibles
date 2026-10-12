import type { Application, RequestHandler, Router } from "express";

export type ApiRouters = {
  auth: Router;
  funds: Router;
  inventory: Router;
  orders: Router;
  packPools: Router;
  products: Router;
  public: Router;
  reports: Router;
  sales: Router;
  shows: Router;
  site: Router;
  whatIfScenarios: Router;
};

export function mountApiRoutes(
  app: Application,
  routers: ApiRouters,
  adminGuard: RequestHandler,
  security: {
    authenticatedApiLimiter: RequestHandler;
    csrfProtection: RequestHandler;
    noStore: RequestHandler;
    originProtection: RequestHandler;
    publicApiLimiter: RequestHandler;
    publicImageLimiter: RequestHandler;
  },
) {
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      message: "Double Rare Collectibles API is running",
    });
  });

  // Public and authentication routes must stay above the admin guard.
  app.use("/api/public/product-images", security.publicImageLimiter);
  app.use("/api/public/site-assets", security.publicImageLimiter);
  app.use("/api/public", security.publicApiLimiter);
  app.use("/api/auth", security.noStore);
  app.use("/api/public", routers.public);
  app.use("/api/auth", routers.auth);

  // Every API mounted after this guard is private business functionality.
  app.use("/api", adminGuard);
  app.use("/api", security.noStore);
  app.use("/api", security.authenticatedApiLimiter);
  app.use("/api", security.originProtection);
  app.use("/api", security.csrfProtection);
  app.use("/api/products", routers.products);
  app.use("/api/orders", routers.orders);
  app.use("/api/inventory", routers.inventory);
  app.use("/api/sales", routers.sales);
  app.use("/api/shows", routers.shows);
  app.use("/api/funds", routers.funds);
  app.use("/api/reports", routers.reports);
  app.use("/api/what-if-scenarios", routers.whatIfScenarios);
  app.use("/api/site", routers.site);
  app.use("/api/pack-pools", routers.packPools);

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API endpoint not found" });
  });
}
