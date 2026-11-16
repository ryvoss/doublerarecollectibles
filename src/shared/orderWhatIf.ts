// Amounts cross the API as decimal strings. Integer cents and rational BigInt
// arithmetic keep allocation, whole-dollar rounding and projected totals exact.
export type OrderWhatIfInput = {
  name: string; supplier: string | null; notes: string | null;
  shippingCost: string; tariffCost: string; targetMargin: string;
  lines: Array<{ description: string; quantity: number; totalProductCost: string; sellingPriceOverride: string | null }>;
};
export class OrderWhatIfValidationError extends Error {}
function invalid(message: string): never { throw new OrderWhatIfValidationError(message); }
export function strictRecord(value: unknown, allowed: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid(`${label} is required.`);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !allowed.includes(key))) return invalid(`Unknown ${label} field.`);
  return record;
}
function text(value: unknown, label: string, max: number, optional = false): string | null {
  if (optional && (value === null || value === undefined || value === "")) return null;
  if (typeof value !== "string" || value.trim().length > max || (!optional && !value.trim())) return invalid(`${label} must contain ${optional ? "at most" : "1 to"} ${max} characters.`);
  return value.trim() || null;
}
export const moneyFromCents = (value: bigint) => `${value < 0n ? "-" : ""}${(value < 0n ? -value : value) / 100n}.${((value < 0n ? -value : value) % 100n).toString().padStart(2, "0")}`;
const cents = (value: string) => { const [whole, fraction = ""] = value.split("."); return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")); };
function amount(value: unknown, label: string, maximum = 9999999999n): string {
  if ((typeof value !== "string" && typeof value !== "number") || !/^\d{1,8}(\.\d{1,2})?$/.test(String(value))) return invalid(`${label} must be a non-negative amount with at most two decimal places.`);
  const parsed = cents(String(value));
  if (parsed > maximum) return invalid(`${label} is too large.`);
  return moneyFromCents(parsed);
}
export function parseOrderWhatIf(value: unknown): OrderWhatIfInput {
  const raw = strictRecord(value, ["name", "supplier", "notes", "shippingCost", "tariffCost", "targetMargin", "lines"], "scenario");
  if (!Array.isArray(raw.lines) || raw.lines.length < 1 || raw.lines.length > 100) return invalid("Include between 1 and 100 items.");
  const targetMargin = amount(raw.targetMargin, "Target margin", 9999n);
  if (cents(targetMargin) === 0n) return invalid("Target margin must be greater than 0% and less than 100%.");
  const result: OrderWhatIfInput = {
    name: text(raw.name, "Scenario name", 100)!, supplier: text(raw.supplier, "Supplier", 160, true), notes: text(raw.notes, "Notes", 2000, true),
    shippingCost: amount(raw.shippingCost ?? "0", "Shipping"), tariffCost: amount(raw.tariffCost ?? "0", "Tariff"), targetMargin,
    lines: raw.lines.map((value, index) => {
      const line = strictRecord(value, ["description", "quantity", "totalProductCost", "sellingPriceOverride"], `item ${index + 1}`);
      if (!Number.isSafeInteger(line.quantity) || Number(line.quantity) <= 0 || Number(line.quantity) > 1000000) return invalid(`Item ${index + 1}: quantity must be a whole number from 1 to 1,000,000.`);
      return { description: text(line.description, `Item ${index + 1} description`, 200)!, quantity: Number(line.quantity),
        totalProductCost: amount(line.totalProductCost, `Item ${index + 1} product cost`),
        sellingPriceOverride: line.sellingPriceOverride === null || line.sellingPriceOverride === undefined ? null : amount(line.sellingPriceOverride, `Item ${index + 1} selling price`) };
    }),
  };
  if (result.lines.every(line => cents(line.totalProductCost) === 0n) && (cents(result.shippingCost) + cents(result.tariffCost) > 0n)) return invalid("Enter a positive product cost before allocating shipping or tariff by value.");
  return result;
}
function roundRatio(numerator: bigint, denominator: bigint) {
  const sign = numerator < 0n ? -1n : 1n;
  const absolute = numerator * sign;
  return sign * ((absolute * 2n + denominator) / (denominator * 2n));
}
function decimalRatio(numerator: bigint, denominator: bigint, places = 8): string | null {
  if (!denominator) return null;
  const scale = 10n ** BigInt(places), rounded = roundRatio(numerator * scale, denominator), absolute = rounded < 0n ? -rounded : rounded;
  return `${rounded < 0n ? "-" : ""}${absolute / scale}.${(absolute % scale).toString().padStart(places, "0")}`;
}
// Largest remainder allocation: exact independent shipping/tariff totals,
// non-negative shares, and stable item order breaks fractional-cent ties.
function allocate(total: bigint, weights: bigint[]) {
  const sum = weights.reduce((a, b) => a + b, 0n);
  if (!sum) return weights.map(() => 0n);
  const shares = weights.map(weight => total * weight / sum);
  const ranked = weights.map((weight, index) => ({ index, remainder: total * weight % sum }))
    .sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  const remainder = Number(total - shares.reduce((a, b) => a + b, 0n));
  for (let i = 0; i < remainder; i++) shares[ranked[i].index] += 1n;
  return shares;
}
export function calculateOrderWhatIf(input: OrderWhatIfInput) {
  const costs = input.lines.map(line => cents(line.totalProductCost));
  const totalProduct = costs.reduce((a, b) => a + b, 0n);
  const shipping = cents(input.shippingCost), tariff = cents(input.tariffCost), marginBasisPoints = cents(input.targetMargin);
  const shippingShares = allocate(shipping, costs), tariffShares = allocate(tariff, costs);
  let revenueTotal = 0n;
  const lines = input.lines.map((line, index) => {
    const quantity = BigInt(line.quantity), landed = costs[index] + shippingShares[index] + tariffShares[index];
    // Round directly from the exact fraction to whole dollars, never from a
    // display-rounded unit cost or a previously rounded raw recommendation.
    const denominator = quantity * (10000n - marginBasisPoints) * 100n;
    const recommended = roundRatio(landed * 10000n, denominator) * 100n;
    const selected = line.sellingPriceOverride === null ? recommended : cents(line.sellingPriceOverride);
    const revenue = selected * quantity, profit = revenue - landed;
    revenueTotal += revenue;
    return { description: line.description, quantity: line.quantity,
      allocationWeight: decimalRatio(costs[index], totalProduct) ?? "0.00000000",
      productCostPerItem: decimalRatio(costs[index], quantity * 100n)!,
      allocatedShipping: moneyFromCents(shippingShares[index]), allocatedTariff: moneyFromCents(tariffShares[index]),
      landedCost: moneyFromCents(landed), landedCostPerItem: decimalRatio(landed, quantity * 100n)!,
      recommendedPriceRaw: decimalRatio(landed * 10000n, denominator)!, recommendedPrice: moneyFromCents(recommended),
      selectedSellingPrice: moneyFromCents(selected), expectedRevenue: moneyFromCents(revenue), expectedProfit: moneyFromCents(profit), actualMargin: decimalRatio(profit, revenue) };
  });
  const toDoor = totalProduct + shipping + tariff, profit = revenueTotal - toDoor;
  return { totalProductCost: moneyFromCents(totalProduct), totalAdditionalCost: moneyFromCents(shipping + tariff), totalCostToDoor: moneyFromCents(toDoor),
    expectedRevenue: moneyFromCents(revenueTotal), expectedProfit: moneyFromCents(profit), expectedMargin: decimalRatio(profit, revenueTotal), targetMargin: input.targetMargin, lines };
}
export type OrderWhatIfResults = ReturnType<typeof calculateOrderWhatIf>;
export type SavedOrderWhatIf = OrderWhatIfInput & { id: number; createdAt: string; updatedAt: string; results: OrderWhatIfResults };
