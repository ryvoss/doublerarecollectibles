import { Router } from "express";
import type { PrismaClient } from "../../generated/prisma/client";
import { accountingDates } from "../../shared/accounting";
import { businessDate } from "../reporting/loadReinvestment";
import { loadAccounting } from "../reporting/accounting";
import { ExpenseError, saveExpense } from "../services/businessExpenses";
import { logServerError } from "../security/logging";
export function createAccountingRouter(database: PrismaClient) {
  const router=Router();
  const handleError=(error:unknown,res:import("express").Response)=>{
    if(error instanceof ExpenseError) return res.status(error.status).json({error:error.message});
    if ((error as {code?:string})?.code === "P2034") return res.status(409).json({error:"Funds or expense changed. Refresh and retry."});
    logServerError("Accounting request failed",error);return res.status(500).json({error:"Accounting is unavailable. Please try again."});
  };
  for (const path of ["/ledger","/summary"]) router.get(path,async(req,res)=>{
    try {
      if (Object.keys(req.query).some(key=>!["range","from","to"].includes(key)) || Object.values(req.query).some(value=>typeof value !== "string")) throw new ExpenseError("Invalid accounting filters.");
      let dates;try {dates=accountingDates(String(req.query.range ?? "This Month"),businessDate(),String(req.query.from ?? ""),String(req.query.to ?? ""));} catch(error) {throw new ExpenseError((error as Error).message);}
      const report=await database.$transaction(tx=>loadAccounting(tx,dates.from,dates.to),{isolationLevel:"RepeatableRead"});
      res.json(path === "/summary" ? report.summary : report);
    } catch(error) {handleError(error,res);}
  });
  router.get("/expenses/:id/history",async(req,res)=>{try {
    const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<=0) throw new ExpenseError("Invalid expense ID.");
    const expense=await database.businessExpense.findUnique({where:{id},include:{revisions:{orderBy:{id:"asc"}},fundEntries:{orderBy:{id:"asc"}}}});
    if(!expense) throw new ExpenseError("Expense not found.",404);res.json(expense);
  } catch(error){handleError(error,res);}});
  for(const method of ["post","patch","delete"] as const) router[method](method === "post" ? "/expenses" : "/expenses/:id",async(req,res)=>{
    try {
      const id=method === "post" ? undefined : Number((req.params as {id:string}).id);
      if(id!==undefined && (!Number.isSafeInteger(id)||id<=0)) throw new ExpenseError("Invalid expense ID.");
      const expense=await database.$transaction(tx=>saveExpense(tx,req.body,id,method === "delete"),{isolationLevel:"Serializable"});
      res.status(method === "post" ? 201 : 200).json(expense);
    } catch(error){handleError(error,res);}
  });
  return router;
}
