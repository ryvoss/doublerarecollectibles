import type { InvestmentGrade, InvestmentReason, InvestmentTrend, PlanningHorizon, ReinvestmentItem } from "../../shared/reinvestment";

export type InvestmentInput = {
  productId: number; productName: string; itemId: string; onHand: number; inbound: number; reorderPoint: number;
  units30: number; unitsPrevious60: number; revenue: number; cogs: number; grossProfit: number;
  transactions30: number; sellingDays30: number; daysSinceLastSale: number | null; historyDays: number | null;
  costsReconcile: boolean; unitsPerCase: number | null;
};
export const gradeForScore = (score: number): InvestmentGrade => score >= 80 ? "A" : score >= 65 ? "B" : score >= 45 ? "C" : score >= 30 ? "D" : "F";
const round = (value: number) => Math.round(value * 100) / 100;
const supplyPoints = (days: number | null) => days === null ? 0 : days < 7 ? 20 : days < 14 ? 16 : days < 30 ? 10 : days < 60 ? 4 : 0;
export function salesTrend(recent: number, previous: number): { trend: InvestmentTrend; ratio: number | null; multiplier: number } {
  if (previous === 0) return { trend: recent > 0 ? "New demand" : "No sales", ratio: null, multiplier: 1 };
  // Algebraically equivalent daily-velocity ratio avoids rounding across the 1.20 boundary.
  const ratio = recent * 2 / previous;
  return { trend: ratio > 1.2 ? "Growing" : ratio < .8 ? "Declining" : "Stable", ratio, multiplier: ratio > 1.2 ? 1.2 : ratio < .8 ? .8 : 1 };
}
export function scoreInvestment(input: InvestmentInput, horizon: PlanningHorizon = 30): ReinvestmentItem {
  const { onHand, inbound, units30, unitsPrevious60, revenue, cogs, grossProfit } = input;
  const dailyVelocity30 = units30 / 30, dailyVelocityPrevious60 = unitsPrevious60 / 60;
  const { trend, ratio: trendRatio, multiplier } = salesTrend(units30, unitsPrevious60);
  const grossMargin = revenue > 0 ? grossProfit / revenue : null;
  const profitEfficiency = cogs > 0 ? grossProfit / cogs : null;
  const sellThrough = units30 + onHand > 0 ? units30 / (units30 + onHand) : 0;
  const daysOnHand = dailyVelocity30 > 0 ? onHand / dailyVelocity30 : null;
  const projectedDaysSupply = dailyVelocity30 > 0 ? (onHand + inbound) / dailyVelocity30 : null;
  const eligible = (input.historyDays ?? 0) >= 14 || units30 + unitsPrevious60 >= 5;
  const age = input.daysSinceLastSale;
  const scoreBreakdown = {
    velocity: round(Math.min(15, units30) + (units30 > 0 ? trend === "Growing" ? 10 : trend === "Stable" ? 8 : trend === "New demand" ? 5 : 2 : 0)),
    profitEfficiency: round(Math.min(25, Math.max(0, profitEfficiency ?? 0) * 50)),
    sellThrough: round(Math.min(20, Math.max(0, sellThrough * 20))),
    // Inbound changes the action, not the grade. Expose projected need separately.
    stockNeed: supplyPoints(daysOnHand),
    recency: (age === null ? 0 : age <= 7 ? 5 : age <= 14 ? 3 : age <= 30 ? 1 : 0) + Math.min(5, input.sellingDays30),
  };
  const score = Math.round(Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0));
  const forecast = round(units30 * multiplier * horizon / 30);
  const safetyStock = round(forecast * .2);
  const targetStock = Math.ceil(round(forecast + safetyStock));
  const calculatedNeed = Math.max(0, targetStock - onHand - inbound);
  const reasons: InvestmentReason[] = [];
  let action: ReinvestmentItem["action"];
  if (!eligible) { action = "NEW / INSUFFICIENT DATA"; reasons.push("INSUFFICIENT_HISTORY"); }
  else if (!input.costsReconcile || (units30 > 0 && (cogs <= 0 || revenue <= 0))) { action = "HOLD"; reasons.push("COST_REVIEW"); }
  else if (units30 < 2) { action = "DO NOT REORDER"; reasons.push((grossMargin ?? 0) >= .3 ? "HIGH_MARGIN_SLOW" : "SLOW_MOVING"); }
  else if ((grossMargin ?? 0) < .1) { action = "DO NOT REORDER"; reasons.push("LOW_MARGIN"); }
  else if (projectedDaysSupply !== null && projectedDaysSupply > 90) { action = "OVERSTOCK RISK"; reasons.push("OVERSTOCK"); }
  else if (inbound > 0 && calculatedNeed === 0 && onHand < targetStock) { action = "WAIT - STOCK INBOUND"; reasons.push("INBOUND_COVERS_NEED"); }
  else if (calculatedNeed === 0) { action = "HOLD"; reasons.push("STOCK_COVERS_NEED"); }
  else if (score >= 65) { action = onHand === 0 && inbound === 0 ? "BUY NOW" : "REORDER"; }
  else if (score >= 45) { action = "BUY MODESTLY"; }
  else { action = "DO NOT REORDER"; reasons.push("WEAK_PERFORMANCE"); }
  const actionable = ["BUY NOW", "REORDER", "BUY MODESTLY"].includes(action);
  if (actionable) {
    reasons.push("RECENT_DEMAND");
    if ((grossMargin ?? 0) >= .2) reasons.push("GOOD_MARGIN");
    if (sellThrough >= .5) reasons.push("HIGH_SELL_THROUGH");
    if (daysOnHand !== null && daysOnHand < 14) reasons.push("LOW_STOCK");
    reasons.push(inbound > 0 ? "PARTIAL_INBOUND" : "NO_INBOUND");
  }
  // C-grade opportunities receive half the calculated need, never more than it.
  const recommendedUnits = actionable ? action === "BUY MODESTLY" ? Math.ceil(calculatedNeed / 2) : calculatedNeed : 0;
  const buyRange = { min: Math.floor(recommendedUnits * .8), max: recommendedUnits };
  const cases = input.unitsPerCase && recommendedUnits > 0 ? Math.ceil(recommendedUnits / input.unitsPerCase) : 0;
  return { ...input, eligible, grade: eligible ? gradeForScore(score) : null, score, action, actionable, reasons, scoreBreakdown,
    projectedStockNeed: supplyPoints(projectedDaysSupply), dailyVelocity30, dailyVelocityPrevious60, trendRatio, trend,
    grossMargin, profitEfficiency, sellThrough, daysOnHand, projectedDaysSupply, forecast, safetyStock, targetStock, calculatedNeed, recommendedUnits, buyRange,
    caseNote: cases && input.unitsPerCase ? { cases, units: cases * input.unitsPerCase, unitsPerCase: input.unitsPerCase } : null };
}
export function rankInvestments(items: ReinvestmentItem[]) {
  return [...items].sort((a, b) => Number(b.actionable) - Number(a.actionable) || Number(b.eligible) - Number(a.eligible) || b.score - a.score || a.productId - b.productId);
}
