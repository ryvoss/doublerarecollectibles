import { Router } from "express";
import { prisma } from "../prisma";
import { CaseProductError, saveCaseProduct } from "../caseProduct";

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

    res.json(products);
  } catch (error) {
    console.error(
      "Error retrieving products:",
      error
    );

    res.status(500).json({
      error: "Failed to retrieve products",
      details:
        error instanceof Error
          ? error.message
          : String(error),
    });
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

    res.json(product);
  } catch (error) {
    console.error(
      "Error retrieving product:",
      error
    );

    res.status(500).json({
      error: "Failed to retrieve product",
      details:
        error instanceof Error
          ? error.message
          : String(error),
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
      type,
      unitType,
      parentProductId,
      quantityPerParent,
      sellable,
      active,
      expectedSalePrice,
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
        active: active ?? true,
        boxItemId: req.body.boxItemId,
        boxesPerCase: req.body.boxesPerCase,
        boxExpectedSalePrice: req.body.boxExpectedSalePrice,
      });
      return res.status(201).json(product);
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
        },
      });

    res.status(201).json(product);
  } catch (error) {
    console.error(
      "Error creating product:",
      error
    );

    res.status(error instanceof CaseProductError ? 400 : 500).json({
      error: error instanceof CaseProductError ? error.message : "Failed to create product",
      details:
        error instanceof Error
          ? error.message
          : String(error),
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
        type,
        unitType,
        parentProductId,
        quantityPerParent,
        sellable,
        expectedSalePrice,
      } = req.body;

      // Start with an empty update object.
      // Only fields actually supplied by the frontend
      // will be changed.
      const updateData: {
        itemId?: string;
        name?: string;
        type?: "SEALED" | "SINGLE";
        unitType?: "CASE" | "BOX" | "ITEM";
        parentProductId?: number | null;
        quantityPerParent?: number | null;
        sellable?: boolean;
        expectedSalePrice?: number | null;
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
          type: updateData.type ?? existingProduct.type, active: existingProduct.active,
          boxItemId: req.body.boxItemId, boxesPerCase: req.body.boxesPerCase,
          boxExpectedSalePrice: req.body.boxExpectedSalePrice,
        });
        return res.json(product);
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

      const product =
        await prisma.product.update({
          where: {
            id: productId,
          },
          data: updateData,
        });

      res.json(product);
    } catch (error) {
      console.error(
        "Error updating product:",
        error
      );

      res.status(error instanceof CaseProductError ? 400 : 500).json({
        error: error instanceof CaseProductError ? error.message : "Failed to update product",
        details:
          error instanceof Error
            ? error.message
            : String(error),
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

      res.json(updatedProduct);
    } catch (error) {
      console.error(
        "Error deactivating product:",
        error
      );

      res.status(500).json({
        error:
          "Failed to deactivate product",
        details:
          error instanceof Error
            ? error.message
            : String(error),
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

      res.json(updatedProduct);
    } catch (error) {
      console.error(
        "Error reactivating product:",
        error
      );

      res.status(500).json({
        error:
          "Failed to reactivate product",
        details:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

export default router;
