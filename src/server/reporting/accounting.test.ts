import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "../../generated/prisma/client";
import { loadAccounting } from "./accounting";
import { accountingDates, selectLedger } from "../../shared/accounting";
const d=(n:number)=>new Prisma.Decimal(n), date=new Date("2026-11-23");
function fixture(){
 const funds=[{id:1,amount:d(5000),saleId:1,transactionDate:date},{id:2,amount:d(-2000),orderId:2,order:{orderNumber:"ORD-0002",status:"FINALIZED",creditApplications:[]},transactionDate:date},{id:3,amount:d(-500),businessExpenseId:1,transactionDate:date}].map(f=>({source:"SEALED",location:null,note:null,type:"ORDER_PURCHASE",createdAt:date,...f}));
 return {sale:{findMany:async()=>[{id:1,saleNumber:"SALE-0001",saleDate:date,createdAt:date,showVisitId:4,paymentMethod:"CASH",lines:[{quantity:2,revenue:d(5000),cogs:d(9999),allocations:[{quantity:2,totalCost:d(3000)}]}]}]},fundEntry:{findMany:async()=>funds},businessExpense:{findMany:async()=>[{id:1,date,createdAt:date,description:"Booth",category:"Show / Booth",amount:d(500),paidFrom:"SEALED",version:1}]},orderAmendment:{findMany:async()=>[]},funds};
}
test("ledger derives Sales, Orders, and a single expense without writes; profitability never deducts inventory purchases",async()=>{
 const data=fixture();const report=await loadAccounting(data as unknown as Prisma.TransactionClient,"2026-11-01","2026-11-30");
 assert.deepEqual(report.summary,{revenue:"5000.00",cogs:"3000.00",grossProfit:"2000.00",expenses:"500.00",netOperatingProfit:"1500.00",inventoryPurchases:"2000.00",inventoryCashPaid:"2000.00",netCashMovement:"2500.00"});
 assert.equal(report.rows.length,3);assert.equal(report.rows.filter(r=>r.sourceType==="SALE").length,1);assert.equal(report.rows.filter(r=>r.expense).length,1);
});
test("credit-funded acquisitions retain full basis while only new cash contributes to cash paid",async()=>{
 const data=fixture();data.funds[1].amount=d(-2350);data.funds[1].order!.creditApplications.push({amountApplied:d(1030)} as never);
 const report=await loadAccounting(data as unknown as Prisma.TransactionClient,"","");assert.equal(report.summary.inventoryPurchases,"3380.00");assert.equal(report.summary.inventoryCashPaid,"2350.00");assert.equal(report.summary.revenue,"5000.00");
});
test("supplier-credit creation reduces acquisition value without cash or revenue; other Funds movements stay separate",async()=>{
 const data=fixture();data.orderAmendment.findMany=async()=>[{id:9,orderId:2,createdAt:date,settlementAmount:d(100),reason:"Cancellation",order:{orderNumber:"ORD-0002"}}] as never;
 data.funds.push({...data.funds[0],id:4,saleId:undefined,amount:d(200),type:"PERSONAL_CONTRIBUTION"} as never);
 const report=await loadAccounting(data as unknown as Prisma.TransactionClient,"","");assert.equal(report.summary.inventoryPurchases,"1900.00");assert.equal(report.summary.netCashMovement,"2700.00");assert.equal(report.summary.revenue,"5000.00");assert.equal(report.rows.find(r=>r.id==="CREDIT-9")?.amount,"0.00");
});
test("date ranges cover month/year boundaries and reject invalid custom dates",()=>{
 assert.deepEqual(accountingDates("This Month","2026-11-23"),{from:"2026-11-01",to:"2026-11-30"});assert.deepEqual(accountingDates("Last Month","2026-01-02"),{from:"2025-12-01",to:"2025-12-31"});assert.deepEqual(accountingDates("This Year","2026-11-23"),{from:"2026-01-01",to:"2026-12-31"});assert.deepEqual(accountingDates("All Time","2026-11-23"),{from:"",to:""});assert.deepEqual(accountingDates("Custom","2026-11-23","2026-01-01","2026-02-01"),{from:"2026-01-01",to:"2026-02-01"});assert.throws(()=>accountingDates("Custom","2026-11-23","2026-02-30","2026-03-01"));
});
test("ledger filtering and sorting are deterministic on ties",async()=>{
 const report=await loadAccounting(fixture() as unknown as Prisma.TransactionClient,"","");const rows=report.rows;
 assert.deepEqual(selectLedger([...rows].reverse()).map(r=>r.id),selectLedger(rows).map(r=>r.id));assert.equal(selectLedger(rows,"Operating Expense").length,1);assert.equal(selectLedger(rows,"All","Inventory").length,1);
 const later={...rows[0],id:"LATER",date:"2026-11-24"};assert.equal(selectLedger([...rows,later])[0].id,"LATER");assert.equal(selectLedger([...rows,later],"All","All",true).at(-1)?.id,"LATER");
});


test("Show-sale correction postings fold into current revenue exactly once",async()=>{
 const data=fixture();data.funds[0].amount=d(4800);
 data.funds.push({...data.funds[0],id:4,saleId:undefined,amount:d(200),type:"MANUAL_ADJUSTMENT",note:"Corrected SALE-0001 (Sale ID 1): revenue 4800.00 -> 5000.00"} as never);
 const report=await loadAccounting(data as unknown as Prisma.TransactionClient,"","");assert.equal(report.rows.length,3);assert.equal(report.summary.revenue,"5000.00");assert.equal(report.summary.netCashMovement,"2500.00");
});
test("missing allocation quantities fail closed instead of inventing zero COGS",async()=>{
 const data=fixture();const sales=await data.sale.findMany();sales[0].lines[0].allocations=[];data.sale.findMany=async()=>sales;
 await assert.rejects(()=>loadAccounting(data as unknown as Prisma.TransactionClient,"",""),/incomplete/);
});
