import { developmentErrorDetails, logServerError } from "../security/logging";
import { Router } from "express";
import { prisma } from "../prisma";
import { CaseProductError, saveCaseProduct } from "../caseProduct";
import type {
  AdminPublicListingItem,
  AdminPublicListingUpdate,
} from "../../shared/publicInventory";
import {
  isRecentPriceDrop,
  isValidPublicMoney,
  publicAvailabilityForUnits,
  resolvePublicPriceUpdate,
} from "../../shared/publicInventory";
import {
  ProductImageValidationError,
  productImageStorage,
  validateProductImageUpload,
} from "../services/productImageStorage";
import { parseImageBody } from "../middleware/imageUpload";
import { ProductImageConflictError, replaceProductImage } from "../services/productImageReplacement";

const router = Router();

// ---------------------------------------------------------
// HELPERS
// ---------------------------------------------------------

// All Item IDs are stored in uppercase going forward.
// This keeps IDs consistent regardless of how they are typed.
function normalizeItemId(value: string) {
  return value.trim().toUpperCase();
}

// Finds another product with the same Item ID,
// ignoring capitalization.
//
// Example:
// GEM 6 Box
// gem 6 box
// GEM 6 BOX
//
// All count as the same Item ID.
async function findDuplicateItemId(
  itemId: string,
  excludeProductId?: number
) {
  return prisma.product.findFirst({
    where: {
      itemId: {
        equals: normalizeItemId(itemId),
        mode: "insensitive",
      },

      // When editing an existing product, don't treat
      // that same product as its own duplicate.
      ...(excludeProductId !== undefined
        ? {
            id: {
              not: excludeProductId,
            },
          }
        : {}),
    },
  });
}

// Makes sure the Product Unit Type is one of the
// values supported by our Product catalog.
function isValidUnitType(
  value: unknown
): value is "CASE" | "BOX" | "ITEM" {
  return (
    value === "CASE" ||
    value === "BOX" ||
    value === "ITEM"
  );
}

// ---------------------------------------------------------
// GET ALL PRODUCTS
// ---------------------------------------------------------

async function validateProductHierarchy(
  productId: number | undefined,
  parentProductId: unknown,
  quantityPerParent: number | null
): Promise<string | null> {
  if (parentProductId === null || parentProductId === undefined) {
    return quantityPerParent === null
      ? null
      : "A quantity per parent requires a parent product";
  }

  if (typeof parentProductId !== "number" ||
      !Number.isSafeInteger(parentProductId) || parentProductId <= 0) {
    return "Parent product ID must be a positive whole number";
  }
  if (quantityPerParent === null) {
    return "A parent product requires a quantity per parent";
  }

  // Follow explicit relationships so a product cannot contain itself,
  // either directly or through another container.
  const visited = new Set<number>();
  let ancestorId: number | null = parentProductId;
  while (ancestorId !== null) {
    if (ancestorId === productId || visited.has(ancestorId)) {
      return "Product relationships cannot form a cycle";
    }
    visited.add(ancestorId);
    const ancestor: { parentProductId: number | null } | null =
      await prisma.product.findUnique({
        where: { id: ancestorId },
        select: { parentProductId: true },
      });
    if (!ancestor) {
      return "Parent product not found";
    }
    ancestorId = ancestor.parentProductId;
  }
  return null;
}

function adminProductResponse<T extends { imageKey: string | null }>(product: T) {
  const { imageKey, ...productData } = product;
  return {
    ...productData,
    imageUrl: productImageStorage.getPublicUrl(imageKey),
  };
}

router.get("/", async (_req, res) => {
  try {
    // Return active AND inactive products.
    // The Products page will handle filtering them.
    const products = await prisma.product.findMany({
      orderBy: [
        {
          active: "desc",
        },
        {
          name: "asc",
        },
      ],
    });

    res.json(products.map(adminProductResponse));
  } catch (error) {
    logServerError(
      "Error retrieving products:",
      error
    );

    res.status(500).json({
      error: "Failed to retrieve products",
      ...developmentErrorDetails(error),
    });
  }
});

// ---------------------------------------------------------
// PUBLIC LISTING MANAGER
// ---------------------------------------------------------

router.get("/public-listings", async (_req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: {
        active: true,
        sellable: true,
      },
      select: {
        id: true,
        name: true,
        displayName: true,
        shortDescription: true,
        imageKey: true,
        expectedSalePrice: true,
        publicPrice: true,
        compareAtPrice: true,
        priceUpdatedAt: true,
        publicVisible: true,
        featured: true,
        inventoryBatches: {
          select: {
            quantityPurchased: true,
            quantityReceived: true,
            quantitySold: true,
            quantityConverted: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    const listings: AdminPublicListingItem[] = products.map((product) => {
      const unitsAvailable = product.inventoryBatches.reduce(
        (total, batch) =>
          total + batch.quantityReceived - batch.quantitySold,
        0,
      ) - product.inventoryBatches.reduce(
        (total, batch) => total + batch.quantityConverted,
        0,
      );
      const unitsInbound = product.inventoryBatches.reduce(
        (total, batch) => total + batch.quantityPurchased - batch.quantityReceived,
        0,
      );

      return {
        id: product.id,
        internalName: product.name,
        displayName: product.displayName,
        shortDescription: product.shortDescription,
        imageUrl: productImageStorage.getPublicUrl(product.imageKey),
        stockStatus: publicAvailabilityForUnits(unitsAvailable, unitsInbound),
        expectedSalePrice:
          product.expectedSalePrice === null
            ? null
            : Number(product.expectedSalePrice),
        publicPrice:
          product.publicPrice === null
            ? null
            : Number(product.publicPrice),
        compareAtPrice:
          product.compareAtPrice === null
            ? null
            : Number(product.compareAtPrice),
        priceUpdatedAt: product.priceUpdatedAt?.toISOString() ?? null,
        recentPriceDrop: isRecentPriceDrop({
          publicPrice: product.publicPrice === null ? null : Number(product.publicPrice),
          compareAtPrice: product.compareAtPrice === null ? null : Number(product.compareAtPrice),
          priceUpdatedAt: product.priceUpdatedAt,
        }),
        publicVisible: product.publicVisible,
        featured: product.featured,
      };
    });

    res.json(listings);
  } catch (error) {
    logServerError("Error retrieving public listings:", error);
    res.status(500).json({
      error: "Public listings could not be loaded",
    });
  }
});

router.patch("/public-listings", async (req, res) => {
  try {
    const updates: unknown = req.body?.updates;

    if (!Array.isArray(updates) || updates.length === 0 || updates.length > 500) {
      return res.status(400).json({
        error: "Provide between 1 and 500 public listing updates",
      });
    }

    const parsedUpdates: AdminPublicListingUpdate[] = [];
    const productIds = new Set<number>();
    const allowedKeys = new Set([
      "id",
      "displayName",
      "shortDescription",
      "publicPrice",
      "compareAtPrice",
      "publicVisible",
      "featured",
    ]);

    for (const value of updates) {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return res.status(400).json({
          error: "Every public listing update must be an object",
        });
      }

      const update = value as Record<string, unknown>;

      if (Object.keys(update).some((key) => !allowedKeys.has(key))) {
        return res.status(400).json({
          error: "Public listing updates may only change presentation, visibility, price, and featured state",
        });
      }

      if (
        typeof update.id !== "number" ||
        !Number.isSafeInteger(update.id) ||
        update.id <= 0 ||
        productIds.has(update.id)
      ) {
        return res.status(400).json({
          error: "Every update needs a unique valid product ID",
        });
      }

      const parsed: AdminPublicListingUpdate = { id: update.id };
      let changedFieldCount = 0;

      if (update.displayName !== undefined) {
        if (update.displayName === null || update.displayName === "") {
          parsed.displayName = null;
        } else if (
          typeof update.displayName !== "string" ||
          !update.displayName.trim() ||
          update.displayName.trim().length > 160
        ) {
          return res.status(400).json({
            error: "Display name must be 160 characters or fewer",
          });
        } else {
          parsed.displayName = update.displayName.trim();
        }
        changedFieldCount += 1;
      }

      if (update.shortDescription !== undefined) {
        if (update.shortDescription === null || update.shortDescription === "") {
          parsed.shortDescription = null;
        } else if (
          typeof update.shortDescription !== "string" ||
          !update.shortDescription.trim() ||
          update.shortDescription.trim().length > 240
        ) {
          return res.status(400).json({
            error: "Short description must be 240 characters or fewer",
          });
        } else {
          parsed.shortDescription = update.shortDescription.trim();
        }
        changedFieldCount += 1;
      }

      if (update.publicVisible !== undefined) {
        if (typeof update.publicVisible !== "boolean") {
          return res.status(400).json({
            error: "Public visibility must be true or false",
          });
        }
        parsed.publicVisible = update.publicVisible;
        changedFieldCount += 1;
      }

      if (update.featured !== undefined) {
        if (typeof update.featured !== "boolean") {
          return res.status(400).json({
            error: "Featured must be true or false",
          });
        }
        parsed.featured = update.featured;
        changedFieldCount += 1;
      }

      if (update.publicPrice !== undefined) {
        if (update.publicPrice === null) {
          parsed.publicPrice = null;
        } else if (
          typeof update.publicPrice !== "number" ||
          !isValidPublicMoney(update.publicPrice)
        ) {
          return res.status(400).json({
            error: "Public price must be null or a valid non-negative number",
          });
        } else {
          parsed.publicPrice = update.publicPrice;
        }
        changedFieldCount += 1;
      }

      if (update.compareAtPrice !== undefined) {
        if (update.compareAtPrice === null) {
          parsed.compareAtPrice = null;
        } else if (
          typeof update.compareAtPrice !== "number" ||
          !isValidPublicMoney(update.compareAtPrice)
        ) {
          return res.status(400).json({
            error: "Compare-at price must be null or a valid non-negative number",
          });
        } else {
          parsed.compareAtPrice = update.compareAtPrice;
        }
        changedFieldCount += 1;
      }

      if (changedFieldCount === 0) {
        return res.status(400).json({
          error: "Every update must change at least one public listing field",
        });
      }

      productIds.add(update.id);
      parsedUpdates.push(parsed);
    }

    await prisma.$transaction(async (tx) => {
      const eligibleProducts = await tx.product.findMany({
        where: {
          id: { in: [...productIds] },
          active: true,
          sellable: true,
        },
        select: {
          id: true,
          publicPrice: true,
          compareAtPrice: true,
          priceUpdatedAt: true,
        },
      });

      if (eligibleProducts.length !== parsedUpdates.length) {
        throw new Error("INELIGIBLE_PUBLIC_LISTING_PRODUCT");
      }

      const eligibleById = new Map(eligibleProducts.map(product => [product.id, product]));
      const changedAt = new Date();
      for (const update of parsedUpdates) {
        const { id, ...data } = update;
        const existing = eligibleById.get(id)!;
        const priceState = resolvePublicPriceUpdate({
          publicPrice: existing.publicPrice === null ? null : Number(existing.publicPrice),
          compareAtPrice: existing.compareAtPrice === null ? null : Number(existing.compareAtPrice),
          priceUpdatedAt: existing.priceUpdatedAt,
        }, {
          publicPrice: data.publicPrice,
          compareAtPrice: data.compareAtPrice,
        }, changedAt);
        await tx.product.update({
          where: { id },
          data: {
            ...data,
            publicPrice: priceState.publicPrice,
            compareAtPrice: priceState.compareAtPrice,
            priceUpdatedAt: priceState.priceUpdatedAt,
          },
        });
      }
    });

    res.json({ updated: parsedUpdates.length });
  } catch (error) {
    if (error instanceof Error && error.message === "INELIGIBLE_PUBLIC_LISTING_PRODUCT") {
      return res.status(400).json({
        error: "Only active sellable products can be managed as public listings",
      });
    }

    logServerError("Error updating public listings:", error);
    res.status(500).json({
      error: "Public listings could not be updated",
    });
  }
});

// ---------------------------------------------------------
// PRODUCT IMAGE MANAGEMENT
// ---------------------------------------------------------

router.put(
  "/:productId/image",
  parseImageBody,
  async (req, res) => {
    try {
      const productId = Number(req.params.productId);
      if (!Number.isSafeInteger(productId) || productId <= 0) {
        return res.status(400).json({ error: "Invalid product ID" });
      }
      if (!Buffer.isBuffer(req.body)) {
        return res.status(415).json({ error: "Upload a JPEG, PNG, or WebP image" });
      }

      const encodedFileName = req.get("x-file-name");
      if (!encodedFileName) {
        return res.status(400).json({ error: "The image filename is required" });
      }
      let originalFileName: string;
      try {
        originalFileName = decodeURIComponent(encodedFileName);
      } catch {
        return res.status(400).json({ error: "The image filename is invalid" });
      }

      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, imageKey: true },
      });
      if (!product) return res.status(404).json({ error: "Product not found" });

      const image = validateProductImageUpload({
        data: req.body,
        mimeType: req.get("content-type")?.split(";", 1)[0]?.trim() ?? "",
        originalFileName,
      });
      const newImageKey = await replaceProductImage({
        currentImageKey: product.imageKey,
        image,
        productId,
        storage: productImageStorage,
        updateImageKey: async (imageKey) => (await prisma.product.updateMany({
          where: { id: productId, imageKey: product.imageKey },
          data: { imageKey },
        })).count === 1,
        onCleanupError: (cleanupError) => logServerError("Old product image cleanup failed:", cleanupError),
      });

      return res.json({ imageUrl: productImageStorage.getPublicUrl(newImageKey) });
    } catch (error) {
      if (error instanceof ProductImageConflictError) return res.status(409).json({ error: error.message });
      if (error instanceof ProductImageValidationError) {
        return res.status(400).json({ error: error.message });
      }
      logServerError("Product image upload failed:", error);
      return res.status(500).json({ error: "Product image could not be saved" });
    }
  },
);

router.delete("/:productId/image", async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    if (!Number.isSafeInteger(productId) || productId <= 0) {
      return res.status(400).json({ error: "Invalid product ID" });
    }
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, imageKey: true },
    });
    if (!product) return res.status(404).json({ error: "Product not found" });
    if (!product.imageKey) return res.json({ imageUrl: null });

    const updated = await prisma.product.updateMany({
      where: { id: productId, imageKey: product.imageKey },
      data: { imageKey: null },
    });
    if (updated.count !== 1) {
      return res.status(409).json({ error: "The product image changed during removal. Try again." });
    }
    try {
      await productImageStorage.deleteProductImage(product.imageKey);
    } catch (cleanupError) {
      logServerError("Removed product image cleanup failed:", cleanupError);
    }
    return res.json({ imageUrl: null });
  } catch (error) {
    logServerError("Product image removal failed:", error);
    return res.status(500).json({ error: "Product image could not be removed" });
  }
});

// ---------------------------------------------------------
// GET ONE PRODUCT
// ---------------------------------------------------------

router.get("/:productId", async (req, res) => {
  try {
    const productId = Number(
      req.params.productId
    );

    if (!Number.isInteger(productId)) {
      return res.status(400).json({
        error: "Invalid product ID",
      });
    }

    const product =
      await prisma.product.findUnique({
        where: {
          id: productId,
        },
      });

    if (!product) {
      return res.status(404).json({
        error: "Product not found",
      });
    }

    res.json(adminProductResponse(product));
  } catch (error) {
    logServerError(
      "Error retrieving product:",
      error
    );

    res.status(500).json({
      error: "Failed to retrieve product",
      ...developmentErrorDetails(error),
    });
  }
});

// ---------------------------------------------------------
// CREATE PRODUCT
// ---------------------------------------------------------

router.post("/", async (req, res) => {
  try {
    const {
      itemId,
      name,
      displayName,
      shortDescription,
      type,
      unitType,
      parentProductId,
      quantityPerParent,
      sellable,
      active,
      expectedSalePrice,
      publicVisible,
      publicPrice,
      featured,
      packsPerBox,
      packDisplayName,
      defaultPackPrice,
    } = req.body;

    // -----------------------------------------------------
    // REQUIRED FIELDS
    // -----------------------------------------------------

    if (
      typeof itemId !== "string" ||
      !itemId.trim()
    ) {
      return res.status(400).json({
        error: "Item ID is required",
      });
    }

    if (
      typeof name !== "string" ||
      !name.trim()
    ) {
      return res.status(400).json({
        error: "Product name is required",
      });
    }

    if (
      type !== "SEALED" &&
      type !== "SINGLE"
    ) {
      return res.status(400).json({
        error:
          "Product type must be SEALED or SINGLE",
      });
    }

    // unitType is optional for backward compatibility.
    // If it isn't supplied, BOX is used.
    const cleanUnitType =
      unitType === undefined
        ? "BOX"
        : unitType;

    if (!isValidUnitType(cleanUnitType)) {
      return res.status(400).json({
        error:
          "Product unit type must be CASE, BOX, or ITEM",
      });
    }

    // -----------------------------------------------------
    // UNIQUE ITEM ID
    // -----------------------------------------------------

    const normalizedItemId =
      normalizeItemId(itemId);

    const duplicate =
      await findDuplicateItemId(
        normalizedItemId
      );

    if (duplicate) {
      return res.status(409).json({
        error:
          "A product with this Item ID already exists",
      });
    }

    // -----------------------------------------------------
    // EXPECTED SALE PRICE
    // -----------------------------------------------------

    let cleanExpectedSalePrice:
      | number
      | null = null;

    if (
      expectedSalePrice !== undefined &&
      expectedSalePrice !== null &&
      expectedSalePrice !== ""
    ) {
      const price = Number(
        expectedSalePrice
      );

      if (
        !Number.isFinite(price) ||
        price < 0
      ) {
        return res.status(400).json({
          error:
            "Expected sale price must be a valid non-negative number",
        });
      }

      cleanExpectedSalePrice = price;
    }

    // -----------------------------------------------------
    // PUBLIC CATALOG SETTINGS
    // -----------------------------------------------------

    if (
      publicVisible !== undefined &&
      typeof publicVisible !== "boolean"
    ) {
      return res.status(400).json({
        error: "Public visibility must be true or false",
      });
    }

    let cleanDisplayName: string | null = null;
    if (displayName !== undefined && displayName !== null && displayName !== "") {
      if (typeof displayName !== "string" || !displayName.trim() || displayName.trim().length > 160) {
        return res.status(400).json({
          error: "Display name must be 160 characters or fewer",
        });
      }
      cleanDisplayName = displayName.trim();
    }

    let cleanShortDescription: string | null = null;
    if (shortDescription !== undefined && shortDescription !== null && shortDescription !== "") {
      if (typeof shortDescription !== "string" || !shortDescription.trim() || shortDescription.trim().length > 240) {
        return res.status(400).json({
          error: "Short description must be 240 characters or fewer",
        });
      }
      cleanShortDescription = shortDescription.trim();
    }

    if (
      featured !== undefined &&
      typeof featured !== "boolean"
    ) {
      return res.status(400).json({
        error: "Featured must be true or false",
      });
    }

    let cleanPublicPrice: number | null = null;

    if (
      publicPrice !== undefined &&
      publicPrice !== null &&
      publicPrice !== ""
    ) {
      const price = Number(publicPrice);

      if (!Number.isFinite(price) || price < 0) {
        return res.status(400).json({
          error: "Public price must be a valid non-negative number",
        });
      }

      cleanPublicPrice = price;
    }

    let cleanPacksPerBox: number | null = null;
    if (packsPerBox !== undefined && packsPerBox !== null && packsPerBox !== "") {
      const quantity = Number(packsPerBox);
      if (!Number.isSafeInteger(quantity) || quantity <= 0) {
        return res.status(400).json({ error: "Packs per Box must be a positive whole number" });
      }
      cleanPacksPerBox = quantity;
    }
    let cleanPackDisplayName: string | null = null;
    if (packDisplayName !== undefined && packDisplayName !== null && packDisplayName !== "") {
      if (typeof packDisplayName !== "string" || !packDisplayName.trim() || packDisplayName.trim().length > 160) {
        return res.status(400).json({ error: "Pack display name must be 160 characters or fewer" });
      }
      cleanPackDisplayName = packDisplayName.trim();
    }
    let cleanDefaultPackPrice: number | null = null;
    if (defaultPackPrice !== undefined && defaultPackPrice !== null && defaultPackPrice !== "") {
      const price = Number(defaultPackPrice);
      if (!Number.isFinite(price) || price < 0 || price > 99999999.99) {
        return res.status(400).json({ error: "Default pack price must be a valid non-negative number" });
      }
      cleanDefaultPackPrice = price;
    }
    if (cleanUnitType !== "BOX" && (cleanPacksPerBox !== null || cleanPackDisplayName !== null || cleanDefaultPackPrice !== null)) {
      return res.status(400).json({ error: "Pack breakdown settings are available only for Box products" });
    }
    if ((cleanPacksPerBox === null) !== (cleanPackDisplayName === null) ||
        (cleanDefaultPackPrice !== null && cleanPacksPerBox === null)) {
      return res.status(400).json({ error: "Packs per Box and Pack Display Name must be configured together" });
    }

    // -----------------------------------------------------
    // QUANTITY PER PARENT
    // -----------------------------------------------------

    let cleanQuantityPerParent:
      | number
      | null = null;

    if (
      quantityPerParent !== undefined &&
      quantityPerParent !== null &&
      quantityPerParent !== ""
    ) {
      const quantity = Number(
        quantityPerParent
      );

      if (
        !Number.isInteger(quantity) ||
        quantity <= 0
      ) {
        return res.status(400).json({
          error:
            "Quantity per parent must be a positive whole number",
        });
      }

      cleanQuantityPerParent = quantity;
    }

    // -----------------------------------------------------
    // CREATE
    // -----------------------------------------------------

    if (cleanUnitType === "CASE") {
      const product = await saveCaseProduct({
        itemId: normalizedItemId, name: name.trim(), type,
        displayName: cleanDisplayName,
        shortDescription: cleanShortDescription,
        active: active ?? true,
        boxItemId: req.body.boxItemId,
        boxesPerCase: req.body.boxesPerCase,
        boxExpectedSalePrice: req.body.boxExpectedSalePrice,
        publicVisible: publicVisible ?? false,
        publicPrice: cleanPublicPrice,
        featured: featured ?? false,
      });
      return res.status(201).json(adminProductResponse(product));
    }
    if (parentProductId != null) {
      const parent = await prisma.product.findUnique({where: {id: Number(parentProductId)}});
      if (parent?.unitType === "CASE") {
        return res.status(400).json({error: "Configure the matching Box from the Case product form."});
      }
    }
    const hierarchyError = await validateProductHierarchy(
      undefined, parentProductId, cleanQuantityPerParent
    );
    if (hierarchyError) {
      return res.status(400).json({ error: hierarchyError });
    }

    const product =
      await prisma.product.create({
        data: {
          itemId: normalizedItemId,
          name: name.trim(),
          displayName: cleanDisplayName,
          shortDescription: cleanShortDescription,
          type,
          unitType: cleanUnitType,

          parentProductId:
            parentProductId ?? null,

          quantityPerParent:
            cleanQuantityPerParent,

          sellable:
            sellable ?? true,

          active:
            active ?? true,

          expectedSalePrice:
            cleanExpectedSalePrice,

          publicVisible:
            publicVisible ?? false,

          publicPrice:
            cleanPublicPrice,

          featured:
            featured ?? false,

          packsPerBox: cleanPacksPerBox,
          packDisplayName: cleanPackDisplayName,
          defaultPackPrice: cleanDefaultPackPrice,
        },
      });

    res.status(201).json(adminProductResponse(product));
  } catch (error) {
    logServerError(
      "Error creating product:",
      error
    );

    res.status(error instanceof CaseProductError ? 400 : 500).json({
      error: error instanceof CaseProductError ? error.message : "Failed to create product",
      ...developmentErrorDetails(error),
    });
  }
});

// ---------------------------------------------------------
// UPDATE PRODUCT
// ---------------------------------------------------------

router.patch(
  "/:productId",
  async (req, res) => {
    try {
      const productId = Number(
        req.params.productId
      );

      if (!Number.isInteger(productId)) {
        return res.status(400).json({
          error: "Invalid product ID",
        });
      }

      const existingProduct =
        await prisma.product.findUnique({
          where: {
            id: productId,
          },
        });

      if (!existingProduct) {
        return res.status(404).json({
          error: "Product not found",
        });
      }

      const {
        itemId,
        name,
        displayName,
        shortDescription,
        type,
        unitType,
        parentProductId,
        quantityPerParent,
        sellable,
        expectedSalePrice,
        publicVisible,
        publicPrice,
        featured,
        packsPerBox,
        packDisplayName,
        defaultPackPrice,
      } = req.body;

      // Start with an empty update object.
      // Only fields actually supplied by the frontend
      // will be changed.
      const updateData: {
        itemId?: string;
        name?: string;
        displayName?: string | null;
        shortDescription?: string | null;
        type?: "SEALED" | "SINGLE";
        unitType?: "CASE" | "BOX" | "ITEM";
        parentProductId?: number | null;
        quantityPerParent?: number | null;
        sellable?: boolean;
        expectedSalePrice?: number | null;
        publicVisible?: boolean;
        publicPrice?: number | null;
        featured?: boolean;
        packsPerBox?: number | null;
        packDisplayName?: string | null;
        defaultPackPrice?: number | null;
      } = {};

      // ---------------------------------------------------
      // ITEM ID
      // ---------------------------------------------------

      if (itemId !== undefined) {
        if (
          typeof itemId !== "string" ||
          !itemId.trim()
        ) {
          return res.status(400).json({
            error:
              "Item ID cannot be empty",
          });
        }

        const normalizedItemId =
          normalizeItemId(itemId);

        const duplicate =
          await findDuplicateItemId(
            normalizedItemId,
            productId
          );

        if (duplicate) {
          return res.status(409).json({
            error:
              "A product with this Item ID already exists",
          });
        }

        updateData.itemId =
          normalizedItemId;
      }

      // ---------------------------------------------------
      // NAME
      // ---------------------------------------------------

      if (name !== undefined) {
        if (
          typeof name !== "string" ||
          !name.trim()
        ) {
          return res.status(400).json({
            error:
              "Product name cannot be empty",
          });
        }

        updateData.name = name.trim();
      }

      if (displayName !== undefined) {
        if (displayName === null || displayName === "") {
          updateData.displayName = null;
        } else if (
          typeof displayName !== "string" ||
          !displayName.trim() ||
          displayName.trim().length > 160
        ) {
          return res.status(400).json({
            error: "Display name must be 160 characters or fewer",
          });
        } else {
          updateData.displayName = displayName.trim();
        }
      }

      if (shortDescription !== undefined) {
        if (shortDescription === null || shortDescription === "") {
          updateData.shortDescription = null;
        } else if (
          typeof shortDescription !== "string" ||
          !shortDescription.trim() ||
          shortDescription.trim().length > 240
        ) {
          return res.status(400).json({
            error: "Short description must be 240 characters or fewer",
          });
        } else {
          updateData.shortDescription = shortDescription.trim();
        }
      }

      // ---------------------------------------------------
      // TYPE
      // ---------------------------------------------------

      if (type !== undefined) {
        if (
          type !== "SEALED" &&
          type !== "SINGLE"
        ) {
          return res.status(400).json({
            error:
              "Product type must be SEALED or SINGLE",
          });
        }

        updateData.type = type;
      }

      // ---------------------------------------------------
      // UNIT TYPE
      // ---------------------------------------------------

      if (unitType !== undefined) {
        if (!isValidUnitType(unitType)) {
          return res.status(400).json({
            error:
              "Product unit type must be CASE, BOX, or ITEM",
          });
        }

        updateData.unitType = unitType;
      }

      // ---------------------------------------------------
      // EXPECTED SALE PRICE
      // ---------------------------------------------------

      if (
        expectedSalePrice !== undefined
      ) {
        if (
          expectedSalePrice === null ||
          expectedSalePrice === ""
        ) {
          updateData.expectedSalePrice =
            null;
        } else {
          const price = Number(
            expectedSalePrice
          );

          if (
            !Number.isFinite(price) ||
            price < 0
          ) {
            return res.status(400).json({
              error:
                "Expected sale price must be a valid non-negative number",
            });
          }

          updateData.expectedSalePrice =
            price;
        }
      }

      // ---------------------------------------------------
      // PUBLIC CATALOG SETTINGS
      // ---------------------------------------------------

      if (publicVisible !== undefined) {
        if (typeof publicVisible !== "boolean") {
          return res.status(400).json({
            error: "Public visibility must be true or false",
          });
        }

        updateData.publicVisible = publicVisible;
      }

      if (featured !== undefined) {
        if (typeof featured !== "boolean") {
          return res.status(400).json({
            error: "Featured must be true or false",
          });
        }

        updateData.featured = featured;
      }

      if (publicPrice !== undefined) {
        if (publicPrice === null || publicPrice === "") {
          updateData.publicPrice = null;
        } else {
          const price = Number(publicPrice);

          if (!Number.isFinite(price) || price < 0) {
            return res.status(400).json({
              error: "Public price must be a valid non-negative number",
            });
          }

          updateData.publicPrice = price;
        }
      }

      if (packsPerBox !== undefined) {
        if (packsPerBox === null || packsPerBox === "") {
          updateData.packsPerBox = null;
        } else {
          const quantity = Number(packsPerBox);
          if (!Number.isSafeInteger(quantity) || quantity <= 0) {
            return res.status(400).json({ error: "Packs per Box must be a positive whole number" });
          }
          updateData.packsPerBox = quantity;
        }
      }
      if (packDisplayName !== undefined) {
        if (packDisplayName === null || packDisplayName === "") {
          updateData.packDisplayName = null;
        } else if (typeof packDisplayName !== "string" || !packDisplayName.trim() || packDisplayName.trim().length > 160) {
          return res.status(400).json({ error: "Pack display name must be 160 characters or fewer" });
        } else {
          updateData.packDisplayName = packDisplayName.trim();
        }
      }
      if (defaultPackPrice !== undefined) {
        if (defaultPackPrice === null || defaultPackPrice === "") {
          updateData.defaultPackPrice = null;
        } else {
          const price = Number(defaultPackPrice);
          if (!Number.isFinite(price) || price < 0 || price > 99999999.99) {
            return res.status(400).json({ error: "Default pack price must be a valid non-negative number" });
          }
          updateData.defaultPackPrice = price;
        }
      }

      // ---------------------------------------------------
      // SELLABLE
      // ---------------------------------------------------

      if (sellable !== undefined) {
        if (
          typeof sellable !== "boolean"
        ) {
          return res.status(400).json({
            error:
              "Sellable must be true or false",
          });
        }

        updateData.sellable = sellable;
      }

      // ---------------------------------------------------
      // PARENT PRODUCT
      // ---------------------------------------------------

      if (
        parentProductId !== undefined
      ) {
        updateData.parentProductId =
          parentProductId;
      }

      // ---------------------------------------------------
      // QUANTITY PER PARENT
      // ---------------------------------------------------

      if (
        quantityPerParent !== undefined
      ) {
        if (
          quantityPerParent === null ||
          quantityPerParent === ""
        ) {
          updateData.quantityPerParent =
            null;
        } else {
          const quantity = Number(
            quantityPerParent
          );

          if (
            !Number.isInteger(quantity) ||
            quantity <= 0
          ) {
            return res.status(400).json({
              error:
                "Quantity per parent must be a positive whole number",
            });
          }

          updateData.quantityPerParent =
            quantity;
        }
      }

      // ---------------------------------------------------
      // UPDATE
      // ---------------------------------------------------

      if ((updateData.unitType ?? existingProduct.unitType) === "CASE") {
        const product = await saveCaseProduct({
          id: productId, itemId: updateData.itemId ?? existingProduct.itemId,
          name: updateData.name ?? existingProduct.name,
          displayName: updateData.displayName !== undefined
            ? updateData.displayName
            : existingProduct.displayName,
          shortDescription: updateData.shortDescription !== undefined
            ? updateData.shortDescription
            : existingProduct.shortDescription,
          type: updateData.type ?? existingProduct.type, active: existingProduct.active,
          boxItemId: req.body.boxItemId, boxesPerCase: req.body.boxesPerCase,
          boxExpectedSalePrice: req.body.boxExpectedSalePrice,
          publicVisible: updateData.publicVisible ?? existingProduct.publicVisible,
          publicPrice: updateData.publicPrice !== undefined
            ? updateData.publicPrice
            : existingProduct.publicPrice === null
              ? null
              : Number(existingProduct.publicPrice),
          featured: updateData.featured ?? existingProduct.featured,
        });
        return res.json(adminProductResponse(product));
      }
      if (existingProduct.unitType === "CASE") {
        return res.status(400).json({error: "A Case cannot be changed into a sellable unit. Edit its Box instead."});
      }
      if (updateData.parentProductId != null && updateData.parentProductId !== existingProduct.parentProductId) {
        const newParent = await prisma.product.findUnique({where: {id: updateData.parentProductId}});
        if (newParent?.unitType === "CASE") {
          return res.status(400).json({error: "Configure the matching Box from the Case product form."});
        }
      }
      const linkedParentId = existingProduct.parentProductId ?? updateData.parentProductId;
      if (linkedParentId != null) {
        const parent = await prisma.product.findUnique({where: {id: linkedParentId}});
        if (parent?.unitType === "CASE") {
          const changesConversion =
            (updateData.parentProductId !== undefined && updateData.parentProductId !== existingProduct.parentProductId) ||
            (updateData.quantityPerParent !== undefined && updateData.quantityPerParent !== existingProduct.quantityPerParent) ||
            (updateData.name !== undefined && updateData.name !== existingProduct.name) ||
            (updateData.unitType !== undefined && updateData.unitType !== "BOX") ||
            (updateData.type !== undefined && updateData.type !== "SEALED") || updateData.sellable === false;
          if (changesConversion) return res.status(400).json({error: "Edit the Case to change its matching Box or conversion."});
        }
      }
      if (parentProductId !== undefined || quantityPerParent !== undefined) {
        const hierarchyError = await validateProductHierarchy(
          productId,
          updateData.parentProductId !== undefined
            ? updateData.parentProductId : existingProduct.parentProductId,
          updateData.quantityPerParent !== undefined
            ? updateData.quantityPerParent : existingProduct.quantityPerParent
        );
        if (hierarchyError) {
          return res.status(400).json({ error: hierarchyError });
        }
      }

      const finalUnitType = updateData.unitType ?? existingProduct.unitType;
      const finalPacksPerBox = updateData.packsPerBox !== undefined ? updateData.packsPerBox : existingProduct.packsPerBox;
      const finalPackDisplayName = updateData.packDisplayName !== undefined ? updateData.packDisplayName : existingProduct.packDisplayName;
      const finalDefaultPackPrice = updateData.defaultPackPrice !== undefined ? updateData.defaultPackPrice : existingProduct.defaultPackPrice;
      if (finalUnitType !== "BOX" && (finalPacksPerBox !== null || finalPackDisplayName !== null || finalDefaultPackPrice !== null)) {
        return res.status(400).json({ error: "Pack breakdown settings are available only for Box products" });
      }
      if ((finalPacksPerBox === null) !== (finalPackDisplayName === null) ||
          (finalDefaultPackPrice !== null && finalPacksPerBox === null)) {
        return res.status(400).json({ error: "Packs per Box and Pack Display Name must be configured together" });
      }

      const product =
        await prisma.product.update({
          where: {
            id: productId,
          },
          data: updateData,
        });

      res.json(adminProductResponse(product));
    } catch (error) {
      logServerError(
        "Error updating product:",
        error
      );

      res.status(error instanceof CaseProductError ? 400 : 500).json({
        error: error instanceof CaseProductError ? error.message : "Failed to update product",
        ...developmentErrorDetails(error),
      });
    }
  }
);

// ---------------------------------------------------------
// DEACTIVATE PRODUCT
// ---------------------------------------------------------

router.patch(
  "/:productId/deactivate",
  async (req, res) => {
    try {
      const productId = Number(
        req.params.productId
      );

      if (!Number.isInteger(productId)) {
        return res.status(400).json({
          error: "Invalid product ID",
        });
      }

      const product =
        await prisma.product.findUnique({
          where: {
            id: productId,
          },
        });

      if (!product) {
        return res.status(404).json({
          error: "Product not found",
        });
      }

      if (!product.active) {
        return res.status(409).json({
          error:
            "Product is already inactive",
        });
      }

      const updatedProduct =
        await prisma.product.update({
          where: {
            id: productId,
          },
          data: {
            active: false,
          },
        });

      res.json(adminProductResponse(updatedProduct));
    } catch (error) {
      logServerError(
        "Error deactivating product:",
        error
      );

      res.status(500).json({
        error:
          "Failed to deactivate product",
        ...developmentErrorDetails(error),
      });
    }
  }
);

// ---------------------------------------------------------
// REACTIVATE PRODUCT
// ---------------------------------------------------------

router.patch(
  "/:productId/reactivate",
  async (req, res) => {
    try {
      const productId = Number(
        req.params.productId
      );

      if (!Number.isInteger(productId)) {
        return res.status(400).json({
          error: "Invalid product ID",
        });
      }

      const product =
        await prisma.product.findUnique({
          where: {
            id: productId,
          },
        });

      if (!product) {
        return res.status(404).json({
          error: "Product not found",
        });
      }

      if (product.active) {
        return res.status(409).json({
          error:
            "Product is already active",
        });
      }

      const updatedProduct =
        await prisma.product.update({
          where: {
            id: productId,
          },
          data: {
            active: true,
          },
        });

      res.json(adminProductResponse(updatedProduct));
    } catch (error) {
      logServerError(
        "Error reactivating product:",
        error
      );

      res.status(500).json({
        error:
          "Failed to reactivate product",
        ...developmentErrorDetails(error),
      });
    }
  }
);

export default router;
