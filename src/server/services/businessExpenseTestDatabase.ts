import { Prisma } from "../../generated/prisma/client";
import type { PrismaClient } from "../../generated/prisma/client";
export function expenseTestDatabase() {
  let current:any=null;const postings:any[]=[];const revisions:any[]=[];
  const tx:any={
    $executeRaw:async()=>0,
    businessExpense:{findUnique:async()=>current,create:async({data}:any)=>current={id:1,version:1,voidedAt:null,...data,amount:new Prisma.Decimal(data.amount)},update:async({data}:any)=>current={...current,...data,version:current.version+1,amount:new Prisma.Decimal(data.amount)}},
    fundEntry:{create:async({data}:any)=>{postings.push(data);return data;}},
    businessExpenseRevision:{create:async({data}:any)=>{revisions.push(data);return data;}},
  };
  const db={$transaction:async(work:any)=>{const old=current,postCount=postings.length,revCount=revisions.length;try{return await work(tx);}catch(error){current=old;postings.length=postCount;revisions.length=revCount;throw error;}},businessExpense:tx.businessExpense} as unknown as PrismaClient;
  return {db,tx,postings,revisions,get current(){return current;}};
}
