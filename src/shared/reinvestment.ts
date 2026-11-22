export type PlanningHorizon = 30 | 45 | 60;
export type InvestmentAction = "BUY NOW" | "REORDER" | "BUY MODESTLY" | "WAIT - STOCK INBOUND" | "HOLD" | "DO NOT REORDER" | "OVERSTOCK RISK" | "NEW / INSUFFICIENT DATA";
export type InvestmentGrade = "A" | "B" | "C" | "D" | "F";
export type InvestmentTrend = "Growing" | "Stable" | "Declining" | "New demand" | "No sales";
export type InvestmentReason = "RECENT_DEMAND" | "GOOD_MARGIN" | "LOW_MARGIN" | "HIGH_SELL_THROUGH" | "LOW_STOCK" | "NO_INBOUND" | "INBOUND_COVERS_NEED" | "PARTIAL_INBOUND" | "OVERSTOCK" | "SLOW_MOVING" | "HIGH_MARGIN_SLOW" | "INSUFFICIENT_HISTORY" | "COST_REVIEW" | "STOCK_COVERS_NEED" | "WEAK_PERFORMANCE";
export const investmentReasons: Record<InvestmentReason, string> = {
  RECENT_DEMAND: "Recent sales support another purchase.", GOOD_MARGIN: "Healthy recorded gross margin.", LOW_MARGIN: "Gross margin is below 10%; review pricing and purchase cost.",
  HIGH_SELL_THROUGH: "At least half of recent available stock has sold.", LOW_STOCK: "Less than 14 days of on-hand supply.", NO_INBOUND: "No restock is inbound.",
  INBOUND_COVERS_NEED: "Inbound stock covers the planning target; wait for it to arrive.", PARTIAL_INBOUND: "Inbound stock helps, but does not cover the planning target.",
  OVERSTOCK: "Projected stock exceeds 90 days of recent demand.", SLOW_MOVING: "Fewer than two units sold in the last 30 days.",
  HIGH_MARGIN_SLOW: "High margin, but slow turnover: fewer than two units sold recently.", INSUFFICIENT_HISTORY: "Less than 14 days of observed history and fewer than five units sold in 90 days.",
  COST_REVIEW: "Recorded costs need review before recommending a purchase.", STOCK_COVERS_NEED: "Current stock covers the planning target.", WEAK_PERFORMANCE: "Recent performance does not support a restock yet.",
};
export type ReinvestmentItem = {
  productId: number; productName: string; itemId: string; grade: InvestmentGrade | null; score: number; eligible: boolean;
  action: InvestmentAction; actionable: boolean; reasons: InvestmentReason[];
  scoreBreakdown: { velocity: number; profitEfficiency: number; sellThrough: number; stockNeed: number; recency: number };
  projectedStockNeed: number; onHand: number; inbound: number; reorderPoint: number;
  units30: number; unitsPrevious60: number; revenue: number; cogs: number; grossProfit: number; grossMargin: number | null; profitEfficiency: number | null;
  dailyVelocity30: number; dailyVelocityPrevious60: number; trendRatio: number | null; trend: InvestmentTrend; sellThrough: number;
  daysOnHand: number | null; projectedDaysSupply: number | null; daysSinceLastSale: number | null; transactions30: number; sellingDays30: number; historyDays: number | null;
  forecast: number; safetyStock: number; targetStock: number; calculatedNeed: number; recommendedUnits: number; buyRange: { min: number; max: number };
  caseNote: { cases: number; units: number; unitsPerCase: number } | null;
};
export type ReinvestmentReport = { asOf: string; currentFrom: string; previousFrom: string; horizon: PlanningHorizon; items: ReinvestmentItem[]; topOpportunities: ReinvestmentItem[] };
export type InvestmentFilter = "All" | "Buy Now" | "Wait / Inbound" | "Hold" | "Avoid Restocking";
export function filterInvestments(items: ReinvestmentItem[], filter: InvestmentFilter) {
  return items.filter(item => filter === "All" || (filter === "Buy Now" ? item.actionable : filter === "Wait / Inbound" ? item.action === "WAIT - STOCK INBOUND" : filter === "Hold" ? ["HOLD", "OVERSTOCK RISK", "NEW / INSUFFICIENT DATA"].includes(item.action) : item.action === "DO NOT REORDER"));
}
