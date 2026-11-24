export const expenseCategories = ["Show / Booth", "Travel", "Lodging", "Shipping", "Packaging / Supplies", "Software", "Advertising", "Processing Fees", "Grading", "Equipment", "Professional Services", "Bank Fees", "Other"] as const;
export const paidFromLabels = { SEALED: "Sealed funds", SINGLES_CASH: "Singles Cash", SINGLES_DIGITAL: "Singles Digital" };
export type PaidFrom = keyof typeof paidFromLabels;
export type ExpenseFacts = { date: string; description: string; category: string; amount: string; paidFrom: PaidFrom };
export type Expense = ExpenseFacts & { id: number; version: number; voidedAt: string | null };
export type LedgerRow = { id: string; sourceType: "SALE" | "ORDER" | "BUSINESS_EXPENSE" | "FUNDS"; sourceId: number; date: string; createdAt: string; type: string; description: string; category: string; amount: string; paymentMethod: string; referenceLabel: string; detail: string; expense?: Expense };
export type AccountingReport = { rows: LedgerRow[]; summary: { revenue: string; cogs: string; grossProfit: string; expenses: string; netOperatingProfit: string; inventoryPurchases: string; inventoryCashPaid: string; netCashMovement: string }; from: string; to: string };
export const ledgerTypes = ["Revenue", "Operating Expense", "Inventory Purchase", "Other Cash Movement"];
export const accountingRanges = ["This Month", "Last Month", "This Year", "All Time", "Custom"] as const;
export function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
export function accountingDates(range: string, today: string, from = "", to = "") {
  const [year, month] = today.split("-").map(Number);
  if (range === "All Time") return {from:"",to:""};
  if (range === "Custom") { if (!validDate(from) || !validDate(to) || from > to) throw new Error("Enter a valid start and end date."); return {from,to}; }
  if (range === "This Month") return {from:today.slice(0,7)+"-01",to:new Date(Date.UTC(year,month,0)).toISOString().slice(0,10)};
  if (range === "Last Month") return {from:new Date(Date.UTC(year,month-2,1)).toISOString().slice(0,10),to:new Date(Date.UTC(year,month-1,0)).toISOString().slice(0,10)};
  if (range === "This Year") return {from:`${year}-01-01`,to:`${year}-12-31`};
  throw new Error("Invalid date range.");
}
export function selectLedger(rows: LedgerRow[], type = "All", category = "All", ascending = false) {
  return rows.filter(row => (type === "All" || row.type === type) && (category === "All" || row.category === category)).sort((a,b) => (ascending ? 1 : -1) * a.date.localeCompare(b.date) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id, undefined, {numeric:true}));
}
