import { prisma } from "./prisma";
import { matchingBoxName } from "../shared/caseProduct";

export class CaseProductError extends Error {}

export async function saveCaseProduct(input: {
  id?: number;
  itemId: string;
  name: string;
  displayName: string | null;
  shortDescription: string | null;
  type: string;
  active: boolean;
  boxItemId: unknown;
  boxesPerCase: unknown;
  boxExpectedSalePrice: unknown;
  publicVisible: boolean;
  publicPrice: number | null;
  featured: boolean;
}) {
  const quantity = Number(input.boxesPerCase);
  const boxItemId = typeof input.boxItemId === "string" ? input.boxItemId.trim().toUpperCase() : "";
  const boxPrice = input.boxExpectedSalePrice === "" || input.boxExpectedSalePrice == null
    ? null : Number(input.boxExpectedSalePrice);
  if (input.type !== "SEALED" || !boxItemId ||
      !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 2147483647 ||
      (boxPrice !== null && (!Number.isFinite(boxPrice) || boxPrice < 0 || boxPrice > 99999999.99))) {
    throw new CaseProductError("Cases must be sealed and need a Box Item ID, positive boxes-per-case quantity, and valid Box price.");
  }
  if (boxItemId === input.itemId.toUpperCase()) {
    throw new CaseProductError("The Case and Box must have different Item IDs.");
  }

  // Both records and their explicit relationship succeed or fail together.
  return prisma.$transaction(async (tx) => {
    if (input.id !== undefined) {
      const current = await tx.product.findUnique({where: {id: input.id}});
      if (current?.parentProductId !== null) {
        throw new CaseProductError("A contained product cannot become a Case. Create a separate Case product.");
      }
    }
    const children = input.id === undefined ? [] : await tx.product.findMany({
      where: { parentProductId: input.id },
    });
    if (children.length > 1 || children.some((child) => child.unitType !== "BOX")) {
      throw new CaseProductError("This Case has an incompatible conversion. It must contain exactly one Box product.");
    }
    const duplicateCase = await tx.product.findFirst({where: {
      itemId: { equals: input.itemId, mode: "insensitive" },
      ...(input.id === undefined ? {} : {id: {not: input.id}}),
    }});
    if (duplicateCase) throw new CaseProductError("A product with this Case Item ID already exists.");
    const duplicateBox = await tx.product.findFirst({where: {
      itemId: {equals: boxItemId, mode: "insensitive"},
    }});
    const child = children[0];
    // An existing unlinked Box can be explicitly selected by its Item ID.
    if (duplicateBox && duplicateBox.id !== child?.id &&
        (child || duplicateBox.unitType !== "BOX" || duplicateBox.type !== "SEALED" ||
         duplicateBox.parentProductId !== null || !duplicateBox.active ||
         duplicateBox.name !== matchingBoxName(input.name))) {
      throw new CaseProductError("That Box Item ID is already used by an incompatible product.");
    }
    const box = child ?? duplicateBox;
    if (box && await tx.product.count({where: {parentProductId: box.id}})) {
      throw new CaseProductError("The contained Box must be the lowest sellable unit.");
    }
    const data = {
      itemId: input.itemId, name: input.name,
      displayName: input.displayName, shortDescription: input.shortDescription,
      type: "SEALED" as const,
      unitType: "CASE" as const, sellable: false, active: input.active,
      parentProductId: null, quantityPerParent: null, expectedSalePrice: null,
      publicVisible: input.publicVisible,
      publicPrice: input.publicPrice,
      featured: input.featured,
    };
    const caseProduct = input.id === undefined
      ? await tx.product.create({data})
      : await tx.product.update({where: {id: input.id}, data});
    const boxData = {
      itemId: boxItemId, name: matchingBoxName(input.name), type: "SEALED" as const,
      unitType: "BOX" as const, sellable: true,
      parentProductId: caseProduct.id, quantityPerParent: quantity,
      expectedSalePrice: boxPrice,
    };
    if (box) {
      await tx.product.update({where: {id: box.id}, data: boxData});
    } else {
      await tx.product.create({data: {...boxData, active: true}});
    }
    return caseProduct;
  });
}
