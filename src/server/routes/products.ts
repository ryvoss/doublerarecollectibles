import { Router } from "express";
import { prisma } from "../prisma";

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

    res.status(500).json({
      error: "Failed to create product",
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

      res.status(500).json({
        error: "Failed to update product",
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