import { Router } from "express";
import { prisma } from "../prisma";
import { calculateBusinessPosition, captureBusinessPositionSnapshot } from "../services/businessPosition";
import { aggregatePackPerformance, emptyPackPerformanceSummary, loadPackPerformance } from "../reporting/packPerformance";

const router = Router();
const cents = (value: number) => Math.round(value * 100) / 100;

router.get("/business-position", async (_req, res) => {
  try { res.json(await calculateBusinessPosition()); }
  catch (error) { console.error("Failed to calculate business position:", error); res.status(500).json({ error: "Failed to calculate business position." }); }
});

router.get("/business-position-snapshots", async (req, res) => {
  try {
    const interval = req.query.interval ?? "weekly";
    if (interval !== "weekly" && interval !== "monthly") { res.status(400).json({ error: "interval must be weekly or monthly." }); return; }
    await captureBusinessPositionSnapshot();
    const snapshots = await prisma.businessPositionSnapshot.findMany({ orderBy: { snapshotDate: "asc" } });
    const grouped = new Map<string, typeof snapshots[number]>();
    for (const snapshot of snapshots) {
      const date = new Date(snapshot.snapshotDate);
      let period: string;
      if (interval === "monthly") period = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      else {
        const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
        monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
        period = monday.toISOString().slice(0, 10);
      }
      grouped.set(period, snapshot);
    }
    res.json([...grouped.entries()].map(([period, snapshot]) => ({
      period, snapshotDate: snapshot.snapshotDate, snapshotAt: snapshot.snapshotAt,
      totalBusinessFunds: Number(snapshot.totalBusinessFunds), sealedFunds: Number(snapshot.sealedFunds), singlesFunds: Number(snapshot.singlesFunds),
      sealedInventoryCost: Number(snapshot.sealedInventoryCost), singlesInventoryValue: snapshot.singlesInventoryValue === null ? null : Number(snapshot.singlesInventoryValue),
      totalBusinessValue: snapshot.totalBusinessValue === null ? null : Number(snapshot.totalBusinessValue), sealedExpectedRetail: Number(snapshot.sealedExpectedRetail),
      expectedPricingComplete: snapshot.expectedPricingComplete,
      missingExpectedPriceProducts: snapshot.missingExpectedPriceProducts,
      missingExpectedPriceUnits: snapshot.missingExpectedPriceUnits,
    })));
  } catch (error) { console.error("Failed to load business position snapshots:", error); res.status(500).json({ error: "Failed to load business position snapshots." }); }
});

router.get("/performance", async (req, res) => {
  try {
    const { from, to, productId, showId, showOnly } = req.query;
    const parseDate = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : null;
    const start = from === undefined ? null : parseDate(from);
    const end = to === undefined ? null : parseDate(to);
    const parseId = (value: unknown) => value === undefined ? null : typeof value === "string" && /^[1-9]\d*$/.test(value) ? Number(value) : NaN;
    const product = parseId(productId);
    const show = parseId(showId);
    if ((from !== undefined && !start) || (to !== undefined && !end) || (start && end && start > end) || Number.isNaN(product) || Number.isNaN(show) || (showOnly !== undefined && showOnly !== "1")) {
      res.status(400).json({ error: "Invalid report filters." });
      return;
    }
    const reportFrom = start ? new Date(`${start}T00:00:00.000Z`) : undefined;
    const reportToExclusive = end ? new Date(Date.parse(`${end}T00:00:00.000Z`) + 86400000) : undefined;
    const [sales, shows, packPerformance] = await Promise.all([
      prisma.sale.findMany({
        where: {
          saleDate: { ...(reportFrom ? { gte: reportFrom } : {}), ...(reportToExclusive ? { lt: reportToExclusive } : {}) },
          ...(show ? { showVisit: { showId: show } } : showOnly ? { showVisitId: { not: null } } : {}),
          ...(product ? { lines: { some: { productId: product } } } : {}),
        },
        include: { lines: { include: { product: { select: { id: true, name: true, itemId: true } } } }, showVisit: { include: { show: { select: { id: true, name: true } } } } },
        orderBy: [{ saleDate: "asc" }, { id: "asc" }],
      }),
      prisma.show.findMany({ include: { visits: { orderBy: { visitDate: "asc" } } }, orderBy: { name: "asc" } }),
      loadPackPerformance(prisma, {
        ...(show ? { showId: show } : {}),
        ...(product ? { productId: product } : {}),
        ...(reportFrom ? { from: reportFrom } : {}),
        ...(reportToExclusive ? { toExclusive: reportToExclusive } : {}),
      }),
    ]);
    const filteredSales = sales.map(sale => ({ ...sale, lines: sale.lines.filter(line => !product || line.productId === product) })).filter(sale => sale.lines.length > 0);
    const totals = { revenue: 0, cogs: 0, grossProfit: 0, unitsSold: 0, saleCount: filteredSales.length, grossMargin: 0 };
    const productMap = new Map<number, { productId: number; productName: string; itemId: string; revenue: number; cogs: number; grossProfit: number; unitsSold: number; saleCount: number; grossMargin: number }>();
    const trendMap = new Map<string, { date: string; revenue: number; cogs: number; grossProfit: number; unitsSold: number; saleCount: number }>();
    const showMap = new Map<number, { showId: number; showName: string; visits: number; revenue: number; cogs: number; grossProfit: number; unitsSold: number; grossMargin: number; singlesInventoryChange: number; singlesFundsChange: number; singlesBusinessValueChange: number }>();
    const visitMap = new Map<number, { visitId: number; showId: number; showName: string; date: string; status: string; revenue: number; cogs: number; grossProfit: number; unitsSold: number; grossMargin: number; singlesInventoryChange: number | null; singlesFundsChange: number | null; singlesBusinessValueChange: number | null }>();
    const includedVisits = shows.flatMap(item => item.visits.map(visit => ({ item, visit }))).filter(({ item, visit }) => (!show || item.id === show) && (!start || visit.visitDate.toISOString().slice(0, 10) >= start) && (!end || visit.visitDate.toISOString().slice(0, 10) <= end));
    for (const { item, visit } of includedVisits) {
      const final = visit.status === "FINALIZED" && visit.endingSinglesValue !== null && visit.endingCash !== null && visit.endingDigital !== null;
      const inventoryChange = final ? cents(Number(visit.endingSinglesValue) - Number(visit.startingSinglesValue)) : null;
      const fundsChange = final ? cents(Number(visit.endingCash) + Number(visit.endingDigital) - Number(visit.startingCash) - Number(visit.startingDigital)) : null;
      const businessChange = final ? cents((inventoryChange ?? 0) + (fundsChange ?? 0)) : null;
      visitMap.set(visit.id, { visitId: visit.id, showId: item.id, showName: item.name, date: visit.visitDate.toISOString().slice(0, 10), status: visit.status, revenue: 0, cogs: 0, grossProfit: 0, unitsSold: 0, grossMargin: 0, singlesInventoryChange: inventoryChange, singlesFundsChange: fundsChange, singlesBusinessValueChange: businessChange });
      const row = showMap.get(item.id) ?? { showId: item.id, showName: item.name, visits: 0, revenue: 0, cogs: 0, grossProfit: 0, unitsSold: 0, grossMargin: 0, singlesInventoryChange: 0, singlesFundsChange: 0, singlesBusinessValueChange: 0 };
      row.visits++;
      row.singlesInventoryChange += inventoryChange ?? 0;
      row.singlesFundsChange += fundsChange ?? 0;
      row.singlesBusinessValueChange += businessChange ?? 0;
      showMap.set(item.id, row);
    }
    for (const sale of filteredSales) {
      const date = sale.saleDate.toISOString().slice(0, 10);
      const trend = trendMap.get(date) ?? { date, revenue: 0, cogs: 0, grossProfit: 0, unitsSold: 0, saleCount: 0 };
      trend.saleCount++;
      trendMap.set(date, trend);
      for (const line of sale.lines) {
        const revenue = Number(line.revenue), cogs = Number(line.cogs), profit = Number(line.grossProfit);
        totals.revenue += revenue; totals.cogs += cogs; totals.grossProfit += profit; totals.unitsSold += line.quantity;
        trend.revenue += revenue; trend.cogs += cogs; trend.grossProfit += profit; trend.unitsSold += line.quantity;
        const row = productMap.get(line.productId) ?? { productId: line.productId, productName: line.product.name, itemId: line.product.itemId, revenue: 0, cogs: 0, grossProfit: 0, unitsSold: 0, saleCount: 0, grossMargin: 0 };
        row.revenue += revenue; row.cogs += cogs; row.grossProfit += profit; row.unitsSold += line.quantity; row.saleCount++;
        productMap.set(line.productId, row);
        if (sale.showVisitId) {
          const visit = visitMap.get(sale.showVisitId);
          if (visit) {
            visit.revenue += revenue; visit.cogs += cogs; visit.grossProfit += profit; visit.unitsSold += line.quantity;
            const showRow = showMap.get(visit.showId)!;
            showRow.revenue += revenue; showRow.cogs += cogs; showRow.grossProfit += profit; showRow.unitsSold += line.quantity;
          }
        }
      }
    }
    totals.revenue = cents(totals.revenue); totals.cogs = cents(totals.cogs); totals.grossProfit = cents(totals.grossProfit); totals.grossMargin = totals.revenue ? totals.grossProfit / totals.revenue : 0;
    const products = [...productMap.values()].map(row => ({ ...row, revenue: cents(row.revenue), cogs: cents(row.cogs), grossProfit: cents(row.grossProfit), grossMargin: row.revenue ? row.grossProfit / row.revenue : 0 })).sort((a, b) => b.revenue - a.revenue);
    const trends = [...trendMap.values()].map(row => ({ ...row, revenue: cents(row.revenue), cogs: cents(row.cogs), grossProfit: cents(row.grossProfit) }));
    const packByShow = new Map<number, ReturnType<typeof emptyPackPerformanceSummary>>();
    const packByVisit = new Map<number, ReturnType<typeof emptyPackPerformanceSummary>>();
    for (const row of showMap.values()) {
      packByShow.set(row.showId, aggregatePackPerformance(
        packPerformance.snapshots.filter(snapshot => snapshot.showVisit.showId === row.showId),
        packPerformance.pools,
      ).summary);
    }
    for (const row of visitMap.values()) {
      packByVisit.set(row.visitId, aggregatePackPerformance(
        packPerformance.snapshots.filter(snapshot => snapshot.showVisitId === row.visitId),
        packPerformance.pools,
      ).summary);
    }
    const showRows = [...showMap.values()].map(row => ({
      ...row,
      revenue: cents(row.revenue),
      cogs: cents(row.cogs),
      grossProfit: cents(row.grossProfit),
      grossMargin: row.revenue ? row.grossProfit / row.revenue : 0,
      pack: packByShow.get(row.showId) ?? emptyPackPerformanceSummary(),
    })).sort((a, b) => b.revenue - a.revenue);
    const visits = [...visitMap.values()].map(row => ({
      ...row,
      revenue: cents(row.revenue),
      cogs: cents(row.cogs),
      grossProfit: cents(row.grossProfit),
      grossMargin: row.revenue ? row.grossProfit / row.revenue : 0,
      pack: packByVisit.get(row.visitId) ?? emptyPackPerformanceSummary(),
    })).sort((a, b) => b.date.localeCompare(a.date));
    res.json({
      totals,
      products,
      trends,
      shows: showRows,
      visits,
      pack: { summary: packPerformance.summary, products: packPerformance.products },
    });
  } catch (error) {
    console.error("Failed to load reports:", error);
    res.status(500).json({ error: "Failed to load reports." });
  }
});

export default router;
