import type { RequestHandler } from "express";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";

const lineSelect = {
  productId: true,
  saleId: true,
  quantity: true,
  revenue: true,
  cogs: true,
  grossProfit: true,
  product: { select: { itemId: true, name: true } },
} satisfies Prisma.SaleLineSelect;

type ReportLine = Prisma.SaleLineGetPayload<{ select: typeof lineSelect }>;
type ReportDatabase = Pick<PrismaClient, "show" | "showVisit" | "saleLine">;

function cents(value: Prisma.Decimal): bigint {
  // Stored SaleLine money has exactly two decimal places in PostgreSQL.
  return BigInt(value.toFixed(2).replace(".", ""));
}

function money(value: bigint): string {
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

export function aggregateShowProductPerformance(lines: ReportLine[]) {
  const groups = new Map<number, {
    productId: number;
    itemId: string;
    productName: string;
    unitsSold: number;
    revenue: bigint;
    cogs: bigint;
    grossProfit: bigint;
    saleLineCount: number;
    saleIds: Set<number>;
  }>();

  for (const line of lines) {
    let group = groups.get(line.productId);
    if (!group) {
      group = {
        productId: line.productId,
        itemId: line.product.itemId,
        productName: line.product.name,
        unitsSold: 0,
        revenue: 0n,
        cogs: 0n,
        grossProfit: 0n,
        saleLineCount: 0,
        saleIds: new Set(),
      };
      groups.set(line.productId, group);
    }
    group.unitsSold += line.quantity;
    group.revenue += cents(line.revenue);
    group.cogs += cents(line.cogs);
    // Preserve the stored profit even if historical values do not reconcile.
    group.grossProfit += cents(line.grossProfit);
    group.saleLineCount += 1;
    group.saleIds.add(line.saleId);
  }

  const totals = [...groups.values()].sort((a, b) => a.productId - b.productId);
  const products = totals.map((group) => ({
    productId: group.productId,
    itemId: group.itemId,
    productName: group.productName,
    unitsSold: group.unitsSold,
    revenue: money(group.revenue),
    cogs: money(group.cogs),
    grossProfit: money(group.grossProfit),
    grossMargin: group.revenue === 0n ? 0 : Number(group.grossProfit) / Number(group.revenue),
    saleLineCount: group.saleLineCount,
    transactionCount: group.saleIds.size,
  }));

  type Total = (typeof totals)[number];
  function winner(isBetter: (candidate: Total, current: Total) => boolean, eligible = totals) {
    let best: Total | undefined;
    for (const candidate of eligible) {
      // Input is sorted by ID; retaining the first equal value breaks ties.
      if (!best || isBetter(candidate, best)) best = candidate;
    }
    return products.find((product) => product.productId === best?.productId) ?? null;
  }

  return {
    products,
    rankings: {
      bestSeller: winner((a, b) => a.unitsSold > b.unitsSold),
      highestRevenue: winner((a, b) => a.revenue > b.revenue),
      highestGrossProfit: winner((a, b) => a.grossProfit > b.grossProfit),
      // Cross multiplication compares exact ratios without rounding or division.
      highestGrossMargin: winner(
        (a, b) => a.grossProfit * b.revenue > b.grossProfit * a.revenue,
        totals.filter((product) => product.revenue > 0n),
      ),
    },
  };
}

export function createShowProductPerformanceHandler(
  database: ReportDatabase,
  level: "visit" | "show",
): RequestHandler {
  return async (req, res) => {
    const rawId = req.params[level === "visit" ? "visitId" : "showId"];
    const id = Number(rawId);
    if (typeof rawId !== "string" || !/^\d+$/.test(rawId) || !Number.isSafeInteger(id) || id < 1 || id > 2147483647) {
      res.status(400).json({ error: `Invalid ${level} ID` });
      return;
    }

    try {
      const visit = level === "visit" ? await database.showVisit.findUnique({
        where: { id },
        select: { id: true, showId: true, finalizedAt: true },
      }) : null;
      const show = level === "show" ? await database.show.findUnique({
        where: { id }, select: { id: true },
      }) : null;
      if (!visit && !show) {
        res.status(404).json({ error: `${level === "visit" ? "Visit" : "Show"} not found` });
        return;
      }

      const lines = await database.saleLine.findMany({
        where: {
          // Technical debt: historical classification still uses current Product.type.
          product: { type: "SEALED" },
          sale: visit
            ? { showVisitId: visit.id }
            : { showVisit: { showId: id, finalizedAt: { not: null } } },
        },
        select: lineSelect,
      });
      res.json({
        scope: {
          type: level,
          showId: visit ? visit.showId : id,
          ...(visit ? { visitId: visit.id, finalizedAt: visit.finalizedAt } : {}),
          finalizedOnly: level === "show",
          provisional: visit ? visit.finalizedAt === null : false,
        },
        ...aggregateShowProductPerformance(lines),
      });
    } catch (error) {
      console.error("Failed to load show product performance:", error);
      res.status(500).json({ error: "Failed to load show product performance" });
    }
  };
}
