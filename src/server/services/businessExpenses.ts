import type { Prisma } from "../../generated/prisma/client";
import { expenseCategories, paidFromLabels, validDate } from "../../shared/accounting";
import type { ExpenseFacts, PaidFrom } from "../../shared/accounting";
export class ExpenseError extends Error { status: number; constructor(message: string, status = 400) { super(message); this.status = status; } }
export function parseExpense(body: unknown): ExpenseFacts {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ExpenseError("Expense details are required.");
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => !["date","description","category","amount","paidFrom","version"].includes(key))) throw new ExpenseError("Unexpected expense field.");
  if (!validDate(input.date)) throw new ExpenseError("Enter a valid expense date.");
  if (typeof input.description !== "string" || !input.description.trim() || input.description.trim().length > 200) throw new ExpenseError("Description must be 1-200 characters.");
  if (!expenseCategories.includes(input.category as typeof expenseCategories[number])) throw new ExpenseError("Select a valid expense category.");
  if (typeof input.paidFrom !== "string" || !Object.hasOwn(paidFromLabels,input.paidFrom)) throw new ExpenseError("Select an existing Funds balance.");
  if (!["string","number"].includes(typeof input.amount) || !/^\d{1,10}(\.\d{1,2})?$/.test(String(input.amount)) || Number(input.amount) <= 0) throw new ExpenseError("Amount must be positive with at most two decimal places.");
  return {date:input.date,description:input.description.trim(),category:String(input.category),amount:Number(input.amount).toFixed(2),paidFrom:input.paidFrom as PaidFrom};
}
export function expenseBucket(paidFrom: string) {
  return paidFrom === "SEALED" ? {source:"SEALED" as const,location:null} : {source:"SINGLES" as const,location:paidFrom === "SINGLES_CASH" ? "CASH" as const : "DIGITAL" as const};
}
export async function saveExpense(tx: Prisma.TransactionClient, body: unknown, id?: number, voidExpense = false) {
  if (id) await tx.$executeRaw`SELECT pg_advisory_xact_lock(9274, ${id})`;
  const old = id ? await tx.businessExpense.findUnique({where:{id}}) : null;
  if (id && (!old || old.voidedAt)) throw new ExpenseError("Expense is missing or already voided.",404);
  if (old && (body as {version?:unknown})?.version !== old.version) throw new ExpenseError("Expense changed. Refresh before trying again.",409);
  const facts = voidExpense && old ? {date:old.date.toISOString().slice(0,10),description:old.description,category:old.category,amount:old.amount.toFixed(2),paidFrom:old.paidFrom as PaidFrom} : parseExpense(body);
  const expense = old ? await tx.businessExpense.update({where:{id},data:{...facts,date:new Date(facts.date),version:{increment:1},voidedAt:voidExpense ? new Date() : null}}) : await tx.businessExpense.create({data:{...facts,date:new Date(facts.date)}});
  // Restate effective expense dates, retaining original postings and immutable revisions.
  // Reversing before reapplying also handles bucket and date changes without mutating Funds history.
  if (old) await tx.fundEntry.create({data:{businessExpenseId:expense.id,...expenseBucket(old.paidFrom),type:"BUSINESS_EXPENSE",amount:old.amount,transactionDate:old.date,note:`Expense #${expense.id} reversal, revision ${expense.version}`}});
  if (!voidExpense) await tx.fundEntry.create({data:{businessExpenseId:expense.id,...expenseBucket(facts.paidFrom),type:"BUSINESS_EXPENSE",amount:`-${facts.amount}`,transactionDate:new Date(facts.date),note:`Expense #${expense.id}: ${facts.description}, revision ${expense.version}`}});
  await tx.businessExpenseRevision.create({data:{expenseId:expense.id,action:voidExpense ? "VOID" : old ? "EDIT" : "CREATE",facts:{...facts,version:expense.version}}});
  return expense;
}
