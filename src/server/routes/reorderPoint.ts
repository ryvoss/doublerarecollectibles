import { Router } from "express";
import { MAX_REORDER_POINT, validReorderPoint } from "../../shared/inventoryOperations";
import { logServerError } from "../security/logging";

/** Mounted under /api/inventory after the shared admin, origin, CSRF and no-store guards. */
export function createReorderPointRouter(update: (productId: number, reorderPoint: number) => Promise<boolean>) {
  const router = Router();
  router.patch("/:productId/reorder-point", async (req, res) => {
    const productId = Number(req.params.productId);
    if (!Number.isSafeInteger(productId) || productId <= 0) return res.status(400).json({ error: "Invalid product ID" });
    if (!req.body || Object.keys(req.body).length !== 1 || !validReorderPoint(req.body.reorderPoint)) {
      return res.status(400).json({ error: `Reorder point must be a whole number from 0 to ${MAX_REORDER_POINT}.` });
    }
    try {
      if (!await update(productId, req.body.reorderPoint)) return res.status(404).json({ error: "Active sellable sealed product not found." });
      return res.json({ productId, reorderPoint: req.body.reorderPoint });
    } catch (error) {
      logServerError("Reorder point update failed", error);
      return res.status(500).json({ error: "Reorder point could not be saved." });
    }
  });
  return router;
}
