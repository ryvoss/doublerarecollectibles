import assert from "node:assert/strict";
import test from "node:test";
import { gradeForScore, rankInvestments, salesTrend, scoreInvestment } from "./reinvestment";
import type { InvestmentInput } from "./reinvestment";
import { filterInvestments } from "../../shared/reinvestment";
const strong: InvestmentInput = { productId: 1, productName: "Gem", itemId: "GEM", onHand: 0, inbound: 0, reorderPoint: 10,
  units30: 20, unitsPrevious60: 40, revenue: 1500, cogs: 1000, grossProfit: 500, transactions30: 8, sellingDays30: 8,
  daysSinceLastSale: 2, historyDays: 60, costsReconcile: true, unitsPerCase: 20 };
const row = (changes: Partial<InvestmentInput> = {}, horizon: 30 | 45 | 60 = 30) => scoreInvestment({ ...strong, ...changes }, horizon);
test("grade thresholds include every boundary", () => {
  for (const [score, grade] of [[0,"F"],[29,"F"],[30,"D"],[44,"D"],[45,"C"],[64,"C"],[65,"B"],[79,"B"],[80,"A"],[100,"A"]] as const) assert.equal(gradeForScore(score), grade);
});
test("growing, stable, declining and zero-history trends", () => {
  assert.equal(salesTrend(25,40).trend,"Growing"); assert.equal(salesTrend(24,40).trend,"Stable");
  assert.equal(salesTrend(16,40).trend,"Stable"); assert.equal(salesTrend(15,40).trend,"Declining");
  assert.deepEqual(salesTrend(20,0),{trend:"New demand",ratio:null,multiplier:1});
  assert.equal(salesTrend(0,0).trend,"No sales"); assert.equal(salesTrend(0,40).ratio,0);
});
test("score is transparent with capped velocity, efficiency, sell-through, need and recency", () => {
  const result=row(); assert.deepEqual(result.scoreBreakdown,{velocity:23,profitEfficiency:25,sellThrough:20,stockNeed:20,recency:10});
  assert.equal(result.score,98); assert.equal(result.profitEfficiency,.5); assert.equal(result.grossMargin,1/3);
  assert.equal(row({units30:2,unitsPrevious60:4}).scoreBreakdown.velocity,10);
  assert.equal(row({grossProfit:-100}).scoreBreakdown.profitEfficiency,0);
  assert.equal(row({grossProfit:10000}).scoreBreakdown.profitEfficiency,25);
  assert.equal(row({onHand:20}).sellThrough,.5);
});
test("stock need and recency respond to demand and selling days", () => {
  assert.equal(row({onHand:6}).scoreBreakdown.stockNeed,16);
  assert.equal(row({onHand:20}).scoreBreakdown.stockNeed,4);
  assert.equal(row({onHand:40}).scoreBreakdown.stockNeed,0);
  assert.equal(row({daysSinceLastSale:40,sellingDays30:0}).scoreBreakdown.recency,0);
  assert.equal(row({daysSinceLastSale:10,sellingDays30:2}).scoreBreakdown.recency,5);
  assert.ok(row({sellingDays30:8}).score > row({sellingDays30:1}).score);
});
test("strong zero-stock candidate buys now; inbound changes action without lowering grade", () => {
  const buy=row(),wait=row({inbound:24}); assert.equal(buy.action,"BUY NOW"); assert.equal(wait.action,"WAIT - STOCK INBOUND");
  assert.equal(buy.grade,"A"); assert.equal(wait.score,buy.score); assert.equal(wait.recommendedUnits,0);
  assert.ok(wait.projectedStockNeed < buy.projectedStockNeed);
  assert.equal(row({inbound:10}).action,"REORDER"); assert.ok(row({inbound:10}).reasons.includes("PARTIAL_INBOUND"));
});
test("excess supply, slow sales, low margin and bad costs suppress buying", () => {
  assert.equal(row({inbound:100}).action,"OVERSTOCK RISK");
  assert.equal(row({units30:0,revenue:0,cogs:0,grossProfit:0}).action,"DO NOT REORDER");
  assert.equal(row({units30:1}).reasons[0],"HIGH_MARGIN_SLOW");
  assert.equal(row({revenue:1050,grossProfit:50}).reasons[0],"LOW_MARGIN");
  assert.equal(row({costsReconcile:false}).action,"HOLD");
  assert.equal(row({cogs:0}).reasons[0],"COST_REVIEW");
  assert.equal(row({onHand:24}).action,"HOLD");
});
test("new products remain ungraded until 14 observed days or five units sold", () => {
  const fresh={historyDays:13,units30:4,unitsPrevious60:0};
  assert.equal(row(fresh).grade,null); assert.equal(row(fresh).action,"NEW / INSUFFICIENT DATA"); assert.equal(row(fresh).recommendedUnits,0);
  assert.notEqual(row({...fresh,historyDays:14}).grade,null); assert.notEqual(row({...fresh,units30:5}).grade,null);
  const empty=row({units30:0,unitsPrevious60:0,historyDays:null,revenue:0,cogs:0,grossProfit:0});
  assert.equal(empty.daysOnHand,null); assert.equal(empty.profitEfficiency,null); assert.equal(empty.sellThrough,0); assert.ok(!JSON.stringify(empty).includes("NaN"));
});
test("forecast adds safety stock, subtracts both quantities and gives a conservative range", () => {
  const result=row({onHand:2,inbound:3});
  assert.equal(result.forecast,20); assert.equal(result.safetyStock,4); assert.equal(result.targetStock,24);
  assert.equal(result.calculatedNeed,19); assert.deepEqual(result.buyRange,{min:15,max:19});
  assert.equal(row({unitsPrevious60:20}).forecast,24); assert.equal(row({unitsPrevious60:60}).forecast,16);
  assert.equal(row({onHand:100}).calculatedNeed,0); assert.equal(row({onHand:100}).buyRange.max,0);
  assert.equal(row({},60).targetStock,48); assert.equal(row({},45).targetStock,36); assert.equal(row({},60).score,row().score);
  assert.deepEqual(result.caseNote,{cases:1,units:20,unitsPerCase:20}); assert.equal(row({unitsPerCase:null}).caseNote,null);
});
test("C grade buys modestly at half the need and all other weak scores are withheld", () => {
  const modest=row({units30:2,unitsPrevious60:4,revenue:19,cogs:16,grossProfit:3,sellingDays30:1,daysSinceLastSale:25});
  assert.equal(modest.grade,"C"); assert.equal(modest.action,"BUY MODESTLY"); assert.equal(modest.calculatedNeed,3); assert.equal(modest.recommendedUnits,2);
});
test("actionable opportunities rank first, ties use ID, and filters retain every relevant product", () => {
  const wait=row({productId:2,inbound:24}),buy=row({productId:3}),buyFirst=row({productId:1}),fresh=row({productId:4,units30:0,unitsPrevious60:0,historyDays:null});
  const ranked=rankInvestments([wait,buy,fresh,buyFirst]); assert.deepEqual(ranked.map(item=>item.productId),[1,3,2,4]);
  assert.deepEqual(filterInvestments(ranked,"Buy Now").map(item=>item.productId),[1,3]); assert.deepEqual(filterInvestments(ranked,"Wait / Inbound"),[wait]);
  assert.equal(filterInvestments(ranked,"All").length,4); assert.deepEqual(filterInvestments(ranked,"Hold"),[fresh]);
});
