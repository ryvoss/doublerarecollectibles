import { Router } from "express";
import type { PrismaClient } from "../../generated/prisma/client";
import { calculateOrderWhatIf, parseOrderWhatIf, strictRecord, OrderWhatIfValidationError } from "../../shared/orderWhatIf";
import { logServerError } from "../security/logging";

// The only persistence capability this router receives is the planning delegate.
// No operational ledger, order, product, inventory or snapshot API is available.
type Database = Pick<PrismaClient, "orderWhatIfScenario">;
const include = { lines: { orderBy: { sortOrder: "asc" as const } } };
function idFrom(value: unknown) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new OrderWhatIfValidationError("Invalid scenario ID.");
  return Number(value);
}
function revision(value: unknown): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw new OrderWhatIfValidationError("The saved scenario version is required. Reopen the scenario.");
  return new Date(value);
}
type Saved = Awaited<ReturnType<Database["orderWhatIfScenario"]["findMany"]>>[number] & { lines: Array<{ description: string; quantity: number; totalProductCost: unknown; sellingPriceOverride: unknown }> };
function serialize(row: Saved) {
  const input = parseOrderWhatIf({ name: row.name, supplier: row.supplier, notes: row.notes, shippingCost: String(row.shippingCost), tariffCost: String(row.tariffCost), targetMargin: String(row.targetMargin),
    lines: row.lines.map(line => ({ description: line.description, quantity: line.quantity, totalProductCost: String(line.totalProductCost), sellingPriceOverride: line.sellingPriceOverride === null ? null : String(line.sellingPriceOverride) })) });
  return { ...input, id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt, results: calculateOrderWhatIf(input) };
}
export function createOrderWhatIfRouter(db: Database) {
  const router = Router();
  router.get("/", async (_req, res) => {
    try { res.json((await db.orderWhatIfScenario.findMany({ include, orderBy: [{ updatedAt: "desc" }, { id: "desc" }] })).map(serialize)); }
    catch (error) { fail(error, res); }
  });
  router.get("/:scenarioId", async (req, res) => {
    try {
      const row = await db.orderWhatIfScenario.findUnique({ where: { id: idFrom(req.params.scenarioId) }, include });
      if (!row) { res.status(404).json({ error: "Order scenario not found." }); return; }
      res.json(serialize(row));
    } catch (error) { fail(error, res); }
  });
  router.post("/", async (req, res) => {
    try {
      const { lines, ...input } = parseOrderWhatIf(req.body);
      const row = await db.orderWhatIfScenario.create({ data: { ...input, lines: { create: lines.map((line, sortOrder) => ({ ...line, sortOrder })) } }, include });
      res.status(201).json(serialize(row));
    } catch (error) { fail(error, res); }
  });
  router.patch("/:scenarioId", async (req, res) => {
    try {
      const raw = strictRecord(req.body, ["name", "supplier", "notes", "shippingCost", "tariffCost", "targetMargin", "lines", "updatedAt"], "scenario");
      const { updatedAt, ...body } = raw;
      const { lines, ...input } = parseOrderWhatIf(body);
      // A nested write replaces lines atomically. The version check prevents
      // a stale editor overwriting a more recent save in another tab.
      const row = await db.orderWhatIfScenario.update({ where: { id: idFrom(req.params.scenarioId), updatedAt: revision(updatedAt) },
        data: { ...input, lines: { deleteMany: {}, create: lines.map((line, sortOrder) => ({ ...line, sortOrder })) } }, include });
      res.json(serialize(row));
    } catch (error) { fail(error, res); }
  });
  router.delete("/:scenarioId", async (req, res) => {
    try {
      const raw = strictRecord(req.body, ["updatedAt"], "delete request");
      const result = await db.orderWhatIfScenario.deleteMany({ where: { id: idFrom(req.params.scenarioId), updatedAt: revision(raw.updatedAt) } });
      if (result.count !== 1) { res.status(409).json({ error: "Scenario changed or was deleted. Reload before deleting." }); return; }
      res.status(204).end();
    } catch (error) { fail(error, res); }
  });
  return router;
}
function fail(error: unknown, res: import("express").Response) {
  if (error instanceof OrderWhatIfValidationError) { res.status(400).json({ error: error.message }); return; }
  if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") { res.status(409).json({ error: "Scenario changed or was deleted. Reopen it before saving." }); return; }
  logServerError("Order What-If request failed", error);
  res.status(500).json({ error: "Order scenario could not be loaded or saved. Please try again." });
}
