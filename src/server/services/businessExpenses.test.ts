import assert from "node:assert/strict";
import test from "node:test";
import { expenseTestDatabase } from "./businessExpenseTestDatabase";
import { parseExpense, saveExpense } from "./businessExpenses";
export const expenseInput={date:"2026-11-23",description:"Booth fee",category:"Show / Booth",amount:"75.00",paidFrom:"SINGLES_CASH"};
test("expense validation requires all five fields and rejects invalid amounts/categories/sources",()=>{
  assert.deepEqual(parseExpense(expenseInput),expenseInput);
  for(const field of Object.keys(expenseInput)){const body:any={...expenseInput};delete body[field];assert.throws(()=>parseExpense(body));}
  for(const amount of [0,-1,"1.001","NaN",true,"1e3","100000000000"] )assert.throws(()=>parseExpense({...expenseInput,amount}));
  for(const change of [{date:"2026-02-30"},{description:" "},{category:"Inventory"},{paidFrom:"CASH"},{unknown:1}])assert.throws(()=>parseExpense({...expenseInput,...change}));
});
test("create, edit, source change and void append linked Funds postings and retain revisions",async()=>{
  const store=expenseTestDatabase();const balance=(location:string|null)=>store.postings.filter(p=>p.location===location).reduce((n,p)=>n+Number(p.amount),0);
  await store.db.$transaction(tx=>saveExpense(tx,expenseInput));assert.equal(balance("CASH"),-75);assert.equal(store.postings[0].businessExpenseId,1);
  await store.db.$transaction(tx=>saveExpense(tx,{...expenseInput,amount:"90.00",version:1},1));assert.equal(balance("CASH"),-90);assert.equal(store.postings.length,3);
  await store.db.$transaction(tx=>saveExpense(tx,{...expenseInput,paidFrom:"SINGLES_DIGITAL",version:2},1));assert.equal(balance("CASH"),0);assert.equal(balance("DIGITAL"),-75);
  await assert.rejects(()=>store.db.$transaction(tx=>saveExpense(tx,{...expenseInput,version:1},1)),/changed/);
  await store.db.$transaction(tx=>saveExpense(tx,{version:3},1,true));assert.equal(balance("DIGITAL"),0);assert.ok(store.current.voidedAt);assert.equal(store.revisions.length,4);
  assert.deepEqual(store.revisions.map(r=>r.action),["CREATE","EDIT","EDIT","VOID"]);assert.equal(Number(store.postings[0].amount),-75);
  await assert.rejects(()=>store.db.$transaction(tx=>saveExpense(tx,{version:4},1,true)),/voided/);
});
test("Sealed expenses use the existing unlocated Sealed balance, and failed posting rolls back facts",async()=>{
  const store=expenseTestDatabase();await store.db.$transaction(tx=>saveExpense(tx,{...expenseInput,paidFrom:"SEALED"}));assert.equal(store.postings[0].source,"SEALED");assert.equal(store.postings[0].location,null);
  store.tx.fundEntry.create=async()=>{throw new Error("post failed");};await assert.rejects(()=>store.db.$transaction(tx=>saveExpense(tx,{...expenseInput,version:1},1)),/post failed/);assert.equal(store.current.version,1);
});
test("date edits reverse the original effective date and post to the corrected date",async()=>{
  const store=expenseTestDatabase();await store.db.$transaction(tx=>saveExpense(tx,expenseInput));await store.db.$transaction(tx=>saveExpense(tx,{...expenseInput,date:"2026-10-23",version:1},1));
  assert.equal(store.postings[1].transactionDate.toISOString().slice(0,10),"2026-11-23");assert.equal(store.postings[2].transactionDate.toISOString().slice(0,10),"2026-10-23");
});
