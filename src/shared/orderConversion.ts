type ConversionProduct = {
  id: number;
  name: string;
  type: "SEALED" | "SINGLE";
  unitType: "CASE" | "BOX" | "ITEM";
  active: boolean;
  sellable: boolean;
  parentProductId: number | null;
  quantityPerParent: number | null;
};

// Shared for the UI preview and API validation. The API always resolves
// against its own catalog data instead of trusting the submitted preview.
export function resolveOrderInventory<T extends ConversionProduct>(
  products: T[], purchasedProductId: number, quantityPurchased: number
): { product: T; quantity: number } {
  if (!Number.isSafeInteger(quantityPurchased) || quantityPurchased <= 0) {
    throw new Error("Purchased quantity must be a positive whole number.");
  }
  let product = products.find((item) => item.id === purchasedProductId);
  let quantity = quantityPurchased;
  const visited = new Set<number>();

  while (product) {
    if (visited.has(product.id)) {
      throw new Error("Product conversion contains a cycle. Correct the catalog first.");
    }
    visited.add(product.id);
    if (!product.active || product.type !== "SEALED") {
      throw new Error(`${product.name} must be an active sealed product.`);
    }
    const parentId = product.id;
    const children = products.filter((item) => item.parentProductId === parentId);
    if (product.unitType === "CASE" &&
        (children.length !== 1 || children[0].unitType !== "BOX" || !children[0].sellable)) {
      throw new Error(`${product.name} needs one matching sellable Box. Edit the Case in Products and enter boxes per case.`);
    }
    if (children.length === 0) {
      if (!product.sellable) {
        throw new Error(`${product.name} needs a sellable product conversion in Products.`);
      }
      return { product, quantity };
    }
    if (children.length !== 1) {
      throw new Error(`${product.name} has multiple contained products. Configure one conversion for this MVP.`);
    }
    const child = children[0];
    if (!Number.isSafeInteger(child.quantityPerParent) || (child.quantityPerParent ?? 0) <= 0) {
      throw new Error(`${child.name} needs a positive whole-number quantity per parent.`);
    }
    quantity *= child.quantityPerParent!;
    if (!Number.isSafeInteger(quantity) || quantity > 2147483647) {
      throw new Error("Converted inventory quantity is too large.");
    }
    product = child;
  }
  throw new Error("Select an existing purchased product.");
}
