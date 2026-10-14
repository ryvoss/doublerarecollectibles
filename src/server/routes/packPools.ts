import { logServerError } from "../security/logging";
import { Router } from "express";
import type { Prisma } from "../../generated/prisma/client";
import {
  PackBreakdownPlanError,
  planPackBreakdown,
  resolvePackBreakdownConfiguration,
} from "../../shared/packBreakdown";
import { prisma } from "../prisma";
import { persistPackBreakdown } from "../services/packBreakdownPersistence";
import { listPackInventory } from "../services/packInventory";

const router = Router();

class PackPoolRequestError extends Error {
  readonly status: number;
  readonly details: Record<string, number> | undefined;

  constructor(message: string, status = 400, details?: Record<string, number>) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function positiveInteger(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new PackPoolRequestError(`${label} must be a positive whole number.`);
  }
  return value;
}

function requestedConfiguration(body: unknown) {
  if (typeof body !== "object" || body === null) return undefined;
  const value = body as Record<string, unknown>;
  if (value.packsPerBox === undefined && value.packDisplayName === undefined && value.defaultPackPrice === undefined) {
    return undefined;
  }
  return {
    packsPerBox: value.packsPerBox,
    packDisplayName: value.packDisplayName,
    defaultPackPrice: value.defaultPackPrice,
  };
}

const sourceBoxSelect = {
  id: true,
  itemId: true,
  name: true,
  active: true,
  sellable: true,
  type: true,
  unitType: true,
  packsPerBox: true,
  packDisplayName: true,
  defaultPackPrice: true,
} as const;

type PackBreakdownDatabase = Pick<Prisma.TransactionClient, "product" | "inventoryBatch">;

async function preparePackBreakdown(
  database: PackBreakdownDatabase,
  sourceBoxProductId: number,
  quantityBoxes: number,
  requested?: ReturnType<typeof requestedConfiguration>,
) {
  const sourceBoxProduct = await database.product.findUnique({
    where: { id: sourceBoxProductId },
    select: sourceBoxSelect,
  });
  if (!sourceBoxProduct) throw new PackPoolRequestError("Source Box product not found.", 404);
  if (!sourceBoxProduct.active || !sourceBoxProduct.sellable ||
      sourceBoxProduct.type !== "SEALED" || sourceBoxProduct.unitType !== "BOX") {
    throw new PackPoolRequestError("Only an active, sellable sealed Box product can be broken down.");
  }

  let configuration;
  try {
    configuration = resolvePackBreakdownConfiguration(sourceBoxProduct, requested);
  } catch (error) {
    if (error instanceof PackBreakdownPlanError) throw new PackPoolRequestError(error.message);
    throw error;
  }

  const batches = await database.inventoryBatch.findMany({
    where: { sellableProductId: sourceBoxProductId },
    include: {
      saleAllocations: { select: { totalCost: true } },
      packPoolAllocations: { select: { totalCost: true } },
      orderLine: { include: { order: { select: { orderDate: true } } } },
    },
  });
  const batchInputs = batches.map(batch => ({
    id: batch.id,
    orderDate: batch.orderLine.order.orderDate,
    quantityPurchased: batch.quantityPurchased,
    quantityReceived: batch.quantityReceived,
    quantitySold: batch.quantitySold,
    quantityConverted: batch.quantityConverted,
    landedCost: Number(batch.landedCost),
    landedUnitCost: Number(batch.landedUnitCost),
    previouslyAllocatedCost: [...batch.saleAllocations, ...batch.packPoolAllocations]
      .reduce((sum, allocation) => sum + Number(allocation.totalCost), 0),
  }));
  try {
    return {
      sourceBoxProduct,
      configuration,
      availableBoxes: batchInputs.reduce(
        (sum, batch) => sum + Math.max(0, batch.quantityReceived - batch.quantitySold - batch.quantityConverted),
        0,
      ),
      plan: planPackBreakdown(batchInputs, quantityBoxes, configuration.packsPerBox),
    };
  } catch (error) {
    if (error instanceof PackBreakdownPlanError) {
      throw new PackPoolRequestError(error.message, 400, error.availableBoxes === undefined
        ? undefined
        : { requestedQuantity: quantityBoxes, availableQuantity: error.availableBoxes });
    }
    throw error;
  }
}

router.get("/inventory", async (_req, res) => {
  try {
    res.json(await listPackInventory(prisma));
  } catch (error) {
    logServerError("Failed to load pack inventory:", error);
    res.status(500).json({ error: "Pack inventory could not be loaded." });
  }
});

router.post("/break-down-preview", async (req, res) => {
  try {
    const sourceBoxProductId = positiveInteger(req.body?.sourceBoxProductId, "Source Box product ID");
    const quantityBoxes = positiveInteger(req.body?.quantityBoxes, "Box quantity");
    const preview = await prisma.$transaction(tx => preparePackBreakdown(
      tx,
      sourceBoxProductId,
      quantityBoxes,
      requestedConfiguration(req.body),
    ));
    const packPrice = preview.configuration.defaultPackPrice;
    res.json({
      sourceBoxProduct: preview.sourceBoxProduct,
      configured: !preview.configuration.needsSave,
      availableBoxes: preview.availableBoxes,
      quantityBoxes: preview.plan.boxesConsumed,
      packsPerBox: preview.configuration.packsPerBox,
      packDisplayName: preview.configuration.packDisplayName,
      packsCreated: preview.plan.packsCreated,
      transferredCostBasis: Number(preview.plan.totalCostBasis),
      costPerPack: Number(preview.plan.costPerPack),
      defaultPackPrice: packPrice,
      expectedRetailValue: packPrice === null
        ? null
        : Number((preview.plan.packsCreated * packPrice).toFixed(2)),
    });
  } catch (error) {
    if (error instanceof PackPoolRequestError) {
      res.status(error.status).json({ error: error.message, ...error.details });
      return;
    }
    logServerError("Failed to preview Box breakdown:", error);
    res.status(500).json({ error: "Box breakdown preview could not be calculated." });
  }
});

router.get("/", async (_req, res) => {
  try {
    const pools = await prisma.packPool.findMany({
      include: {
        sourceBoxProduct: { select: sourceBoxSelect },
        sourceAllocations: { orderBy: { inventoryBatchId: "asc" } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    res.json(pools);
  } catch (error) {
    logServerError("Failed to load pack pools:", error);
    res.status(500).json({ error: "Pack pools could not be loaded." });
  }
});

router.post("/break-down", async (req, res) => {
  try {
    const sourceBoxProductId = positiveInteger(req.body?.sourceBoxProductId, "Source Box product ID");
    const quantityBoxes = positiveInteger(req.body?.quantityBoxes, "Box quantity");
    const showVisitId = req.body?.showVisitId === undefined || req.body?.showVisitId === null
      ? null
      : positiveInteger(req.body.showVisitId, "Show visit ID");
    const configurationInput = requestedConfiguration(req.body);

    const pool = await prisma.$transaction(async tx => {
      if (showVisitId !== null) await tx.$executeRaw`SELECT pg_advisory_xact_lock(86420932)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7431, ${sourceBoxProductId})`;

      const { sourceBoxProduct, configuration, plan } = await preparePackBreakdown(
        tx,
        sourceBoxProductId,
        quantityBoxes,
        configurationInput,
      );

      if (configuration.needsSave) {
        await tx.product.update({
          where: { id: sourceBoxProductId },
          data: {
            packsPerBox: configuration.packsPerBox,
            packDisplayName: configuration.packDisplayName,
            defaultPackPrice: configuration.defaultPackPrice,
          },
        });
      }

      const showSnapshot = showVisitId === null ? null : await tx.showPackSnapshot.findFirst({
        where: {
          showVisitId,
          sourceBoxProductId,
          finalizedAt: null,
          showVisit: { status: "ACTIVE", finalizedAt: null },
        },
      });
      if (showVisitId !== null && !showSnapshot) {
        throw new PackPoolRequestError(`Packs derived from ${sourceBoxProduct.name} are not tracked on the active Show.`);
      }

      const created = await persistPackBreakdown(tx, {
        sourceBoxProductId,
        packDisplayName: configuration.packDisplayName,
        showVisitId,
        showPackSnapshotId: showSnapshot?.id ?? null,
        plan,
      });

      return tx.packPool.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          sourceBoxProduct: { select: sourceBoxSelect },
          sourceAllocations: { orderBy: { inventoryBatchId: "asc" } },
        },
      });
    }, { isolationLevel: "Serializable" });

    res.status(201).json(pool);
  } catch (error) {
    if (error instanceof PackPoolRequestError) {
      res.status(error.status).json({ error: error.message, ...error.details });
      return;
    }
    logServerError("Failed to break down Box inventory:", error);
    res.status(409).json({ error: "Box inventory changed during breakdown. Review availability and try again." });
  }
});

export default router;
