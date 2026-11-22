import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "../../generated/prisma/client";
import type { PrismaClient } from "../../generated/prisma/client";
import { businessDate, investmentWindow, loadReinvestment } from "./loadReinvestment";
const decimal=(n:number)=>new Prisma.Decimal(n);
const batch={quantityPurchased:30,quantityReceived:20,quantitySold:5,quantityConverted:3,receiptEvents:[{occurredAt:new Date("2026-09-01T12:00:00Z")}]};
const product={id:1,name:"Gem",itemId:"GEM",reorderPoint:4,unitType:"BOX",quantityPerParent:20,parentProduct:{unitType:"CASE",active:true},inventoryBatches:[batch]};
const sale=(date:string,saleId:number,quantity=5)=>({productId:1,saleId,quantity,revenue:decimal(quantity*20),cogs:decimal(quantity*10),grossProfit:decimal(quantity*10),product:{name:"Gem",itemId:"GEM"},sale:{saleDate:new Date(date)},allocations:[{quantity:2,totalCost:decimal(20)},{quantity:quantity-2,totalCost:decimal((quantity-2)*10)}]});
test("windows use business date, exactly 30 current days and 60 preceding days",()=>{
  assert.equal(businessDate(new Date("2026-11-23T02:00:00Z")),"2026-11-22");
  const window=investmentWindow("2026-11-22"); assert.equal(window.start.toISOString(),"2026-10-24T00:00:00.000Z");
  assert.equal((window.start.getTime()-window.previousStart.getTime())/86400000,60); assert.equal((window.endExclusive.getTime()-window.start.getTime())/86400000,30);
});
test("bulk loader reuses recorded revenue, allocation-backed COGS and receiving quantities without double counting sales",async()=>{
  let productQuery:unknown;let saleQuery:unknown;
  const database={product:{findMany:async(query:unknown)=>{productQuery=query;return [product,{...product,id:2,name:"No sales",inventoryBatches:[]}];}},saleLine:{findMany:async(query:unknown)=>{saleQuery=query;return [sale("2026-10-24",7),sale("2026-11-22",7),sale("2026-10-23",8)];}}};
  const report=await loadReinvestment(database as unknown as Pick<PrismaClient,"product"|"saleLine">,30,"2026-11-22");
  const item=report.items.find(item=>item.productId===1)!;
  assert.equal(item.units30,10); assert.equal(item.unitsPrevious60,5);assert.equal(item.revenue,200);assert.equal(item.cogs,100);assert.equal(item.grossProfit,100);
  assert.equal(item.transactions30,1);assert.equal(item.sellingDays30,2); assert.equal(item.onHand,12);assert.equal(item.inbound,10);assert.equal(item.reorderPoint,4);
  assert.equal(report.items.length,2);assert.equal(report.items.find(item=>item.productId===2)?.grade,null);
  assert.match(JSON.stringify(productQuery),/"active":true,"sellable":true,"type":"SEALED"/);
  assert.match(JSON.stringify(saleQuery),/2026-08-25T00:00:00.000Z/);assert.match(JSON.stringify(saleQuery),/2026-11-23T00:00:00.000Z/);
  assert.doesNotMatch(JSON.stringify(saleQuery),/showVisitId|expectedSalePrice|publicPrice|whatIf/);
  assert.ok(report.topOpportunities.every(item=>item.actionable));
});
test("missing FIFO allocations block recommendations without changing stored report totals",async()=>{
  const broken={...sale("2026-11-22",1),allocations:[]};
  const db={product:{findMany:async()=>[product]},saleLine:{findMany:async()=>[broken]}};
  const report=await loadReinvestment(db as unknown as Pick<PrismaClient,"product"|"saleLine">,30,"2026-11-22");
  assert.equal(report.items[0].action,"HOLD");assert.equal(report.items[0].cogs,50);assert.equal(report.items[0].recommendedUnits,0);
});


test("top five contains only actionable products while full ranking keeps inbound and new products", async () => {
  const products = Array.from({length:8}, (_,index) => ({...product,id:index+1,inventoryBatches:[{...batch,quantityPurchased:20,quantityReceived:20,quantitySold:20,quantityConverted:0}]}));
  products.push({...product,id:9,inventoryBatches:[{...batch,quantityPurchased:44,quantityReceived:20,quantitySold:20,quantityConverted:0}]});
  products.push({...product,id:10,inventoryBatches:[]});
  const lines = products.filter(p=>p.id!==10).map(p=>({...sale("2026-11-22",p.id,20),productId:p.id,sale:{saleDate:new Date("2026-11-22"),showVisitId:p.id%2 ? 4 : null}}));
  const db = {product:{findMany:async()=>products},saleLine:{findMany:async()=>lines}};
  const report = await loadReinvestment(db as unknown as Pick<PrismaClient,"product"|"saleLine">,30,"2026-11-22");
  assert.equal(report.items.length,10);
  assert.deepEqual(report.topOpportunities.map(item=>item.productId),[1,2,3,4,5]);
  assert.equal(report.items.find(item=>item.productId===9)?.action,"WAIT - STOCK INBOUND");
  assert.equal(report.items.find(item=>item.productId===10)?.grade,null);
  assert.equal(report.items[0].units30,20);
  assert.equal(report.items[0].revenue,400);
});
