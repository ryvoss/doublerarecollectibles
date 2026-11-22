import type { RequestHandler } from "express";
import type { PlanningHorizon, ReinvestmentReport } from "../../shared/reinvestment";
import { logServerError } from "../security/logging";
export function createReinvestmentHandler(load: (horizon: PlanningHorizon) => Promise<ReinvestmentReport>): RequestHandler {
  return async (req, res) => {
    const horizon = req.query.horizon ?? "30";
    if (typeof horizon !== "string" || !["30", "45", "60"].includes(horizon) || Object.keys(req.query).some(key => key !== "horizon")) {
      res.status(400).json({ error: "Planning horizon must be 30, 45, or 60 days. Performance always uses the latest 30 days." }); return;
    }
    try { res.json(await load(Number(horizon) as PlanningHorizon)); }
    catch (error) { logServerError("Reinvestment insights failed", error); res.status(500).json({ error: "Reinvestment insights could not be loaded." }); }
  };
}
