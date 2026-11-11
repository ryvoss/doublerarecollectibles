import type { Prisma } from "../../generated/prisma/client";

export class PurchasingError extends Error {}
export const cents = (value: unknown) => Math.round(Number(value) * 100);
export const dollars = (value: number) => (value / 100).toFixed(2);
export function supplierIdentity(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 160) throw new PurchasingError("Enter a supplier name (1?160 characters).");
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
export function parseCreditApplications(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100) throw new PurchasingError("Invalid supplier credit applications.");
  const result = value.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new PurchasingError("Invalid supplier credit application.");
    const { supplierCreditId, amountApplied } = item as Record<string, unknown>;
    if (!Number.isSafeInteger(supplierCreditId) || Number(supplierCreditId) <= 0 ||
        !["string", "number"].includes(typeof amountApplied) || !/^\d+(\.\d{1,2})?$/.test(String(amountApplied)) ||
        !Number.isSafeInteger(cents(amountApplied)) || cents(amountApplied) <= 0) throw new PurchasingError("Credit amounts must be positive amounts with at most two decimals.");
    return { supplierCreditId: Number(supplierCreditId), amountApplied: dollars(cents(amountApplied)) };
  });
  if (new Set(result.map(item => item.supplierCreditId)).size !== result.length) throw new PurchasingError("Do not repeat a supplier credit.");
  return result.sort((a, b) => a.supplierCreditId - b.supplierCreditId);
}

// Called inside the same transaction as batches, the order lock and cash posting.
export async function applySupplierCredits(tx: Prisma.TransactionClient, orderId: number, supplier: string | null, totalCents: number, input: unknown) {
  const applications = parseCreditApplications(input);
  const appliedCents = applications.reduce((sum, item) => sum + cents(item.amountApplied), 0);
  if (appliedCents > totalCents) throw new PurchasingError("Supplier credit exceeds the order funding requirement.");
  for (const application of applications) {
    const credit = await tx.supplierCredit.findUnique({ where: { id: application.supplierCreditId } });
    if (!credit || !supplier || credit.supplierName !== supplierIdentity(supplier)) throw new PurchasingError("Credit must belong to this order's supplier.");
    // Conditional decrement locks the row and prevents concurrent overspending.
    const changed = await tx.supplierCredit.updateMany({
      where: { id: credit.id, remainingAmount: { gte: application.amountApplied } },
      data: { remainingAmount: { decrement: application.amountApplied } },
    });
    if (changed.count !== 1) throw new PurchasingError("Supplier credit balance changed or is insufficient. Refresh and review funding.");
    await tx.supplierCreditApplication.create({ data: { ...application, orderId } });
  }
  return totalCents - appliedCents;
}
