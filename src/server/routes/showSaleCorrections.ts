import { Router } from "express";
import type { PrismaClient } from "../../generated/prisma/client";
import { correctShowSale, parseSaleCorrection, SaleCorrectionError, showSaleCorrectionContext } from "../services/showSaleCorrections";
import { logServerError } from "../security/logging";

export function createShowSaleCorrectionsRouter(database: Pick<PrismaClient, "$transaction" | "sale">) {
  const router = Router();
  for (const method of ["get", "patch", "delete"] as const) {
    router[method]("/:id/correction", async (req, res) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id <= 0) throw new SaleCorrectionError("Invalid sale ID", 400);
        if (method === "get") return res.json(await showSaleCorrectionContext(database, id));
        const deleting = method === "delete";
        return res.json(await correctShowSale(database, id, parseSaleCorrection(req.body, deleting), deleting));
      } catch (error) {
        if (error instanceof SaleCorrectionError) return res.status(error.status).json({ error: error.message });
        const conflict = error as { code?: string; meta?: { code?: string } } | null;
        if (["P2034", "40001", "40P01"].includes(String(conflict?.code)) ||
            ["40001", "40P01"].includes(String(conflict?.meta?.code))) {
          return res.status(409).json({ error: "Inventory or Show changed during this correction. Reopen the sale and try again." });
        }
        logServerError("Show sale correction failed", error);
        return res.status(500).json({ error: "Sale correction failed. No changes were saved." });
      }
    });
  }
  return router;
}
