import { logServerError } from "../security/logging";
import { Router } from "express";
import { prisma } from "../prisma";
import { splitRemainingBatchCost } from "../services/inventoryCost";

const router = Router();

type ScenarioLineInput = {
  productId: number;
  quantity: number;
  unitSalePrice: number;
};

function parseScenarioId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parseName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name.length > 0 && name.length <= 100 ? name : null;
}

function parseLines(value: unknown): ScenarioLineInput[] | null {
  if (!Array.isArray(value)) return null;
  const ids = new Set<number>();
  const lines: ScenarioLineInput[] = [];
  for (const candidate of value) {
    if (typeof candidate !== "object" || candidate === null) return null;
    const raw = candidate as Record<string, unknown>;
    const productId = Number(raw.productId);
    const quantity = Number(raw.quantity);
    const unitSalePrice = Number(raw.unitSalePrice);
    if (
      !Number.isSafeInteger(productId) || productId <= 0 ||
      ids.has(productId) ||
      !Number.isSafeInteger(quantity) || quantity < 0 ||
      !Number.isFinite(unitSalePrice) || unitSalePrice < 0 || unitSalePrice > 99999999.99
    ) return null;
    ids.add(productId);
    lines.push({ productId, quantity, unitSalePrice: Math.round(unitSalePrice * 100) / 100 });
  }
  return lines;
}

const scenarioSelect = {
  id: true,
  name: true,
  baseSource: true,
  createdAt: true,
  updatedAt: true,
  lines: {
    select: {
      id: true,
      productId: true,
      quantity: true,
      unitSalePrice: true,
    },
    orderBy: { id: "asc" as const },
  },
} as const;

async function validateCurrentInventory(lines: ScenarioLineInput[]): Promise<string | null> {
  if (!lines.length) return null;
  const products = await prisma.product.findMany({
    where: { id: { in: lines.map(line => line.productId) } },
    include: { inventoryBatches: true },
  });
  if (products.length !== lines.length) return "One or more scenario products no longer exist.";
  for (const line of lines) {
    const product = products.find(item => item.id === line.productId)!;
    if (!product.active || !product.sellable || product.type !== "SEALED" || product.unitType === "CASE") {
      return `${product.name} is not currently available sealed inventory.`;
    }
    const available = product.inventoryBatches.reduce(
      (total, batch) => total + batch.quantityReceived - batch.quantitySold - batch.quantityConverted,
      0
    );
    if (line.quantity > available) {
      return `${product.name} has ${available} units available; adjust the hypothetical quantity.`;
    }
  }
  return null;
}

router.get("/inventory", async (_req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: {
        active: true,
        sellable: true,
        type: "SEALED",
        unitType: { not: "CASE" },
        inventoryBatches: { some: {} },
      },
      include: {
        inventoryBatches: {
          include: {
            saleAllocations: true,
            packPoolAllocations: true,
            orderLine: { include: { order: true } },
          },
        },
      },
      orderBy: { name: "asc" },
    });
    const inventory = products.map(product => {
      const batches = product.inventoryBatches.map(batch => ({
        id: batch.id,
        orderDate: batch.orderLine.order.orderDate,
        quantityPurchased: batch.quantityPurchased,
        quantityReceived: batch.quantityReceived,
        quantitySold: batch.quantitySold,
        quantityConverted: batch.quantityConverted,
        landedCost: Number(batch.landedCost),
        landedUnitCost: Number(batch.landedUnitCost),
        previouslyAllocatedCost: [...batch.saleAllocations, ...batch.packPoolAllocations].reduce(
          (total, allocation) => total + Number(allocation.totalCost),
          0
        ),
      }));
      const availableQuantity = batches.reduce(
        (total, batch) => total + batch.quantityReceived - batch.quantitySold - batch.quantityConverted,
        0
      );
      const inventoryCost = product.inventoryBatches.reduce(
        (total, batch) => total + splitRemainingBatchCost(batch).onHandCost,
        0,
      );
      return {
        productId: product.id,
        itemId: product.itemId,
        productName: product.name,
        expectedSalePrice: product.expectedSalePrice === null ? null : Number(product.expectedSalePrice),
        availableQuantity,
        inventoryCost: Number(inventoryCost.toFixed(2)),
        batches,
      };
    });
    res.json(inventory);
  } catch (error) {
    logServerError("Failed to load What-If inventory:", error);
    res.status(500).json({ error: "What-If inventory could not be loaded." });
  }
});

router.get("/", async (_req, res) => {
  try {
    const scenarios = await prisma.whatIfScenario.findMany({
      select: scenarioSelect,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
    res.json(scenarios);
  } catch (error) {
    logServerError("Failed to load What-If scenarios:", error);
    res.status(500).json({ error: "What-If scenarios could not be loaded." });
  }
});

router.post("/", async (req, res) => {
  try {
    const name = parseName(req.body?.name);
    const lines = parseLines(req.body?.lines ?? []);
    if (!name || !lines) {
      res.status(400).json({ error: "A valid scenario name and product assumptions are required." });
      return;
    }
    const inventoryError = await validateCurrentInventory(lines);
    if (inventoryError) {
      res.status(409).json({ error: inventoryError });
      return;
    }
    const scenario = await prisma.whatIfScenario.create({
      data: {
        name,
        lines: {
          create: lines.map(line => ({
            productId: line.productId,
            quantity: line.quantity,
            unitSalePrice: line.unitSalePrice.toFixed(2),
          })),
        },
      },
      select: scenarioSelect,
    });
    res.status(201).json(scenario);
  } catch (error) {
    logServerError("Failed to create What-If scenario:", error);
    res.status(500).json({ error: "What-If scenario could not be saved." });
  }
});

router.patch("/:scenarioId", async (req, res) => {
  try {
    const id = parseScenarioId(req.params.scenarioId);
    const name = parseName(req.body?.name);
    const lines = parseLines(req.body?.lines);
    if (!id || !name || !lines) {
      res.status(400).json({ error: "A valid scenario ID, name, and product assumptions are required." });
      return;
    }
    const inventoryError = await validateCurrentInventory(lines);
    if (inventoryError) {
      res.status(409).json({ error: inventoryError });
      return;
    }
    const exists = await prisma.whatIfScenario.findUnique({ where: { id }, select: { id: true } });
    if (!exists) {
      res.status(404).json({ error: "What-If scenario not found." });
      return;
    }
    const scenario = await prisma.$transaction(async tx => {
      await tx.whatIfScenarioLine.deleteMany({ where: { scenarioId: id } });
      await tx.whatIfScenario.update({
        where: { id },
        data: {
          name,
          lines: {
            create: lines.map(line => ({
              productId: line.productId,
              quantity: line.quantity,
              unitSalePrice: line.unitSalePrice.toFixed(2),
            })),
          },
        },
      });
      return tx.whatIfScenario.findUnique({ where: { id }, select: scenarioSelect });
    });
    res.json(scenario);
  } catch (error) {
    logServerError("Failed to update What-If scenario:", error);
    res.status(500).json({ error: "What-If scenario could not be updated." });
  }
});

router.delete("/:scenarioId", async (req, res) => {
  try {
    const id = parseScenarioId(req.params.scenarioId);
    if (!id) {
      res.status(400).json({ error: "A valid scenario ID is required." });
      return;
    }
    const result = await prisma.whatIfScenario.deleteMany({ where: { id } });
    if (result.count !== 1) {
      res.status(404).json({ error: "What-If scenario not found." });
      return;
    }
    res.status(204).end();
  } catch (error) {
    logServerError("Failed to delete What-If scenario:", error);
    res.status(500).json({ error: "What-If scenario could not be deleted." });
  }
});

export default router;
