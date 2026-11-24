import type { Prisma } from "../../generated/prisma/client";
import type { AccountingReport, Expense, LedgerRow, PaidFrom } from "../../shared/accounting";
import { paidFromLabels, selectLedger } from "../../shared/accounting";
// Monetary sums stay in integer cents; no price-based COGS reconstruction.
const cents = (value: {toString():string} | string) => BigInt(value.toString().replace(/^(.*?)(?:\.(\d{1,2}))?$/, (_all,whole,frac) => whole + (frac ?? "").padEnd(2,"0")));
const money = (value: bigint) => `${value < 0n ? "-" : ""}${(value < 0n ? -value : value)/100n}.${String((value < 0n ? -value : value)%100n).padStart(2,"0")}`;
export async function loadAccounting(tx: Prisma.TransactionClient, from: string, to: string): Promise<AccountingReport> {
  const dates = {...(from ? {gte:new Date(from)} : {}),...(to ? {lt:new Date(Date.parse(to)+86400000)} : {})};
  const [sales, funds, expenses, creditAmendments] = await Promise.all([
    tx.sale.findMany({where:{saleDate:dates},include:{lines:{include:{allocations:true}}}}),
    tx.fundEntry.findMany({where:{transactionDate:dates},include:{order:{include:{creditApplications:true}},orderCorrection:true,orderAmendment:true}}),
    tx.businessExpense.findMany({where:{date:dates,voidedAt:null}}),
    tx.orderAmendment.findMany({where:{createdAt:dates,settlementType:"SUPPLIER_CREDIT"},include:{order:true}}),
  ]);
  const rows: LedgerRow[] = [];
  // Show-sale corrections retain the original posting and append a documented delta.
  // Fold those deltas into the current Revenue row only when they reconcile exactly.
  const foldedCorrections = new Set<number>();
  const originals = new Map(funds.filter(fund=>fund.saleId !== null).map(fund=>[fund.saleId,fund]));
  const correctionsBySale = new Map<number, typeof funds>();
  for (const fund of funds) {
    const match = fund.type === "MANUAL_ADJUSTMENT" ? /^Corrected SALE-\d+ \(Sale ID (\d+)\): revenue /.exec(fund.note ?? "") : null;
    if (match) {const id=Number(match[1]);const group=correctionsBySale.get(id) ?? [];group.push(fund);correctionsBySale.set(id,group);}
  }
  for (const sale of sales) {
    const original = originals.get(sale.id);
    const corrections = (correctionsBySale.get(sale.id) ?? []).filter(fund=>fund.note?.startsWith(`Corrected ${sale.saleNumber} (Sale ID ${sale.id}): revenue `));
    const currentRevenue = sale.lines.reduce((n,line)=>n+cents(line.revenue),0n);
    if (original && cents(original.amount)+corrections.reduce((n,fund)=>n+cents(fund.amount),0n) === currentRevenue) corrections.forEach(fund=>foldedCorrections.add(fund.id));
  }
  let revenue=0n,cogs=0n,expenseTotal=0n,inventoryPurchases=0n,inventoryCashPaid=0n,netCashMovement=0n;
  for (const sale of sales) {
    const amount=sale.lines.reduce((n,line)=>n+cents(line.revenue),0n);
    if (sale.lines.some(line=>line.allocations.reduce((n,allocation)=>n+allocation.quantity,0) !== line.quantity)) throw new Error("Sale allocation history is incomplete; accounting cannot report reliable COGS.");
    revenue+=amount; cogs+=sale.lines.reduce((n,line)=>n+line.allocations.reduce((a,allocation)=>a+cents(allocation.totalCost),0n),0n);
    rows.push({id:`SALE-${sale.id}`,sourceType:"SALE",sourceId:sale.id,date:sale.saleDate.toISOString().slice(0,10),createdAt:sale.createdAt.toISOString(),type:"Revenue",description:sale.saleNumber,category:"Sales",amount:money(amount),paymentMethod:sale.paymentMethod,referenceLabel:sale.saleNumber,detail:"Recorded sale revenue. Cost of goods sold is included only in profitability totals."});
  }
  for (const fund of funds) {
    const amount=cents(fund.amount); netCashMovement+=amount;
    if (fund.saleId || fund.businessExpenseId || foldedCorrections.has(fund.id)) continue;
    const orderId=fund.orderId ?? fund.orderCorrection?.orderId ?? fund.orderAmendment?.orderId;
    const credit=fund.order?.creditApplications.reduce((n,application)=>n+cents(application.amountApplied),0n) ?? 0n;
    const acquired=orderId ? -amount+credit : 0n;
    if (orderId) {inventoryPurchases+=acquired;inventoryCashPaid-=amount;}
    rows.push({id:`FUND-${fund.id}`,sourceType:orderId ? "ORDER" : "FUNDS",sourceId:orderId ?? fund.id,date:fund.transactionDate.toISOString().slice(0,10),createdAt:fund.createdAt.toISOString(),type:orderId ? "Inventory Purchase" : "Other Cash Movement",description:fund.note ?? fund.type.replaceAll("_"," "),category:orderId ? "Inventory" : fund.type.replaceAll("_"," "),amount:money(amount),paymentMethod:`${fund.source}${fund.location ? " / "+fund.location : ""}`,referenceLabel:fund.order?.orderNumber ?? (orderId ? `Order #${orderId}` : `Funds #${fund.id}`),detail:orderId ? `Acquisition change $${money(acquired)}; supplier credit applied $${money(credit)}; cash movement $${money(amount)}.` : "Existing Funds movement; excluded from sealed-sale profitability."});
  }
  // A credit settlement removes acquisition value but moves no cash and is never revenue.
  for (const amendment of creditAmendments) {
    inventoryPurchases-=cents(amendment.settlementAmount);
    rows.push({id:`CREDIT-${amendment.id}`,sourceType:"ORDER",sourceId:amendment.orderId,date:amendment.createdAt.toISOString().slice(0,10),createdAt:amendment.createdAt.toISOString(),type:"Inventory Purchase",description:`${amendment.order.orderNumber}: inventory returned to supplier credit`,category:"Inventory",amount:"0.00",paymentMethod:"Supplier credit",referenceLabel:amendment.order.orderNumber,detail:`Acquisition reduced $${amendment.settlementAmount}; cash unchanged. ${amendment.reason}`});
  }
  for (const expense of expenses) {
    expenseTotal+=cents(expense.amount);
    const facts: Expense={id:expense.id,date:expense.date.toISOString().slice(0,10),description:expense.description,category:expense.category,amount:expense.amount.toFixed(2),paidFrom:expense.paidFrom as PaidFrom,version:expense.version,voidedAt:null};
    rows.push({id:`EXPENSE-${expense.id}`,sourceType:"BUSINESS_EXPENSE",sourceId:expense.id,date:facts.date,createdAt:expense.createdAt.toISOString(),type:"Operating Expense",description:expense.description,category:expense.category,amount:money(-cents(expense.amount)),paymentMethod:paidFromLabels[facts.paidFrom],referenceLabel:`Expense #${expense.id}`,detail:`Current expense facts, revision ${expense.version}. Original postings and revisions are retained.`,expense:facts});
  }
  return {rows:selectLedger(rows),from,to,summary:{revenue:money(revenue),cogs:money(cogs),grossProfit:money(revenue-cogs),expenses:money(expenseTotal),netOperatingProfit:money(revenue-cogs-expenseTotal),inventoryPurchases:money(inventoryPurchases),inventoryCashPaid:money(inventoryCashPaid),netCashMovement:money(netCashMovement)}};
}
