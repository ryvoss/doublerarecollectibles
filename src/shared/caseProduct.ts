// Naming is a convenience for explicitly selected CASE products.
// Inventory conversion still uses saved product IDs, never product names.
export function matchingBoxName(caseName: string): string {
  return `${caseName.trim().replace(/\s+case$/i, "")} Box`;
}
