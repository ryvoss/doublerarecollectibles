import { developmentErrorDetails, logServerError } from "../security/logging";
import { Router } from "express";
import { prisma } from "../prisma";
import { simulateFifoConsumption } from "../../shared/fifoSimulation";
import { allocatedBatchCost } from "../services/inventoryCost";

const router = Router();
class FinalizedVisitError extends Error {}
class InventoryChangedError extends Error {}

// ---------------------------------------------------------
// TYPES
// ---------------------------------------------------------

type FifoAllocation = {
  inventoryBatchId: number;
  quantity: number;
  unitCost: string;
  totalCost: string;
  batchUpdatedAt: Date;
};

type PreparedSaleLine = {
  productId: number;
  quantity: number;
  unitSalePrice: string;
  revenue: string;
  cogs: string;
  grossProfit: string;
  grossMargin: string;
  fifoAllocations: FifoAllocation[];
};

// ---------------------------------------------------------
// HELPERS
// ---------------------------------------------------------

// Convert money to whole cents so financial calculations avoid
// JavaScript floating-point rounding problems.
function toCents(value: unknown): number {
  return Math.round(Number(value) * 100);
}

// Convert whole cents back into a database-friendly money string.
function centsToMoney(value: number): string {
  return (value / 100).toFixed(2);
}

// Generate the next readable sale number on the server.
// The advisory lock prevents two simultaneous sales from receiving
// the same SALE-#### number.
async function getNextSaleNumber(tx: any): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(74291002)`;

  const sales = await tx.sale.findMany({
    select: { saleNumber: true },
  });

  let highestNumber = 0;

  for (const sale of sales) {
    const match = /^SALE-(\d+)$/.exec(sale.saleNumber.trim());

    if (!match) continue;

    const numericPart = Number(match[1]);
    if (Number.isInteger(numericPart) && numericPart > highestNumber) {
      highestNumber = numericPart;
    }
  }

  return `SALE-${String(highestNumber + 1).padStart(4, "0")}`;
}

// ---------------------------------------------------------
// CREATE SEALED SALE
// ---------------------------------------------------------

router.post("/", async (req, res) => {
  try {
    const {
      saleDate,
      paymentMethod,
      showVisitId,
      notes,
      lines,
    } = req.body;

    // ---------------------------------------------------------
    // BASIC SALE VALIDATION
    // ---------------------------------------------------------

    if (
      !saleDate ||
      !paymentMethod ||
      !Array.isArray(lines) ||
      lines.length === 0
    ) {
      return res.status(400).json({
        error:
          "saleDate, paymentMethod, and at least one sale line are required",
      });
    }

    if (!["CASH", "DIGITAL"].includes(paymentMethod)) {
      return res.status(400).json({
        error:
          "paymentMethod must be CASH or DIGITAL",
      });
    }

    const parsedSaleDate = new Date(saleDate);

    if (Number.isNaN(parsedSaleDate.getTime())) {
      return res.status(400).json({
        error: "saleDate must be a valid date",
      });
    }

    // ---------------------------------------------------------
    // OPTIONAL SHOW VISIT VALIDATION
    //
    // A normal sale does not need a Show Visit.
    //
    // If showVisitId is supplied, the sale becomes associated
    // with that specific show occurrence.
    // ---------------------------------------------------------

    let parsedShowVisitId: number | null = null;

    if (
      showVisitId !== undefined &&
      showVisitId !== null
    ) {
      parsedShowVisitId =
        Number(showVisitId);

      if (
        !Number.isInteger(
          parsedShowVisitId
        ) ||
        parsedShowVisitId <= 0
      ) {
        return res.status(400).json({
          error:
            "showVisitId must be a valid positive integer",
        });
      }

      const showVisit =
        await prisma.showVisit.findUnique({
          where: {
            id: parsedShowVisitId,
          },
          include: {
            show: true,
          },
        });

      if (!showVisit) {
        return res.status(404).json({
          error: "Show visit not found",
        });
      }

      // A finalized Show Visit should remain historically
      // stable. New sales cannot be added afterward.
      if (showVisit.finalizedAt) {
        return res.status(409).json({
          error:
            "Cannot add a sale to a finalized show visit",
        });
      }
    }

    // ---------------------------------------------------------
    // SALE LINE VALIDATION
    // ---------------------------------------------------------

    const productIds = new Set<number>();

    for (const line of lines) {
      if (!Number.isInteger(line.productId)) {
        return res.status(400).json({
          error:
            "Each productId must be a valid integer",
        });
      }

      if (
        !Number.isInteger(line.quantity) ||
        line.quantity <= 0
      ) {
        return res.status(400).json({
          error:
            "Each quantity must be a positive integer",
        });
      }

      const unitSalePrice =
        Number(line.unitSalePrice);

      if (
        line.unitSalePrice === undefined ||
        !Number.isFinite(unitSalePrice) ||
        unitSalePrice < 0
      ) {
        return res.status(400).json({
          error:
            "Each sale line must include a valid unitSalePrice",
        });
      }

      // The same product appearing twice in one sale could
      // cause both lines to prepare against the same inventory.
      //
      // For now, each product can appear only once per sale.
      if (productIds.has(line.productId)) {
        return res.status(400).json({
          error:
            `Product ${line.productId} appears more than once in this sale`,
        });
      }

      productIds.add(line.productId);
    }

    // ---------------------------------------------------------
    // PREPARE EACH SALE LINE
    // ---------------------------------------------------------

    const preparedLines:
      PreparedSaleLine[] = [];

    for (const line of lines) {
      const product =
        await prisma.product.findUnique({
          where: {
            id: line.productId,
          },
        });

      if (!product) {
        return res.status(404).json({
          error:
            `Product ${line.productId} was not found`,
        });
      }

      if (
        !product.active ||
        !product.sellable || product.unitType === "CASE"
      ) {
        return res.status(400).json({
          error:
            `${product.name} is not currently available for sale`,
        });
      }

      if (product.type !== "SEALED") {
        return res.status(400).json({
          error:
            `${product.name} is not a sealed product`,
        });
      }

      // ---------------------------------------------------------
      // LOAD INVENTORY BATCHES
      // ---------------------------------------------------------

      const batches =
        await prisma.inventoryBatch.findMany({
          where: {
            sellableProductId:
              line.productId,
          },
          include: {
            saleAllocations: true,
            packPoolAllocations: true,

            orderLine: {
              include: {
                order: true,
              },
            },
          },
        });

      // ---------------------------------------------------------
      // TRUE FIFO SORT
      //
      // FIFO is based on the original order date rather than
      // the date the inventory batch happened to be created.
      // ---------------------------------------------------------

      const fifoSimulation = simulateFifoConsumption(
        batches.map(batch => ({
          id: batch.id,
          orderDate: batch.orderLine.order.orderDate,
          quantityPurchased: batch.quantityPurchased,
          quantityReceived: batch.quantityReceived,
          quantitySold: batch.quantitySold,
          quantityConverted: batch.quantityConverted,
          landedCost: Number(batch.landedCost),
          landedUnitCost: Number(batch.landedUnitCost),
          previouslyAllocatedCost: allocatedBatchCost(batch),
        })),
        line.quantity
      );

      const availableInventory = fifoSimulation.availableQuantity;

      if (
        availableInventory <
        line.quantity
      ) {
        return res.status(400).json({
          error:
            `Insufficient inventory for ${product.name}`,

          productId:
            line.productId,

          requestedQuantity:
            line.quantity,

          availableQuantity:
            availableInventory,
        });
      }

      // ---------------------------------------------------------
      // BUILD FIFO ALLOCATIONS
      // ---------------------------------------------------------

      const batchVersions = new Map(batches.map(batch => [batch.id, batch.updatedAt]));
      const fifoAllocations: FifoAllocation[] = fifoSimulation.allocations.map(allocation => ({
        ...allocation,
        batchUpdatedAt: batchVersions.get(allocation.inventoryBatchId)!,
      }));

      // ---------------------------------------------------------
      // CALCULATE LINE FINANCIALS
      // ---------------------------------------------------------

      const unitSalePriceCents =
        toCents(
          line.unitSalePrice
        );

      const revenueCents =
        line.quantity *
        unitSalePriceCents;

      const cogsCents =
        fifoAllocations.reduce(
          (total, allocation) =>
            total +
            toCents(
              allocation.totalCost
            ),
          0
        );

      const grossProfitCents =
        revenueCents -
        cogsCents;

      const grossMargin =
        revenueCents > 0
          ? grossProfitCents /
            revenueCents
          : 0;

      preparedLines.push({
        productId:
          line.productId,

        quantity:
          line.quantity,

        unitSalePrice:
          centsToMoney(
            unitSalePriceCents
          ),

        revenue:
          centsToMoney(
            revenueCents
          ),

        cogs:
          centsToMoney(
            cogsCents
          ),

        grossProfit:
          centsToMoney(
            grossProfitCents
          ),

        grossMargin:
          grossMargin.toFixed(6),

        fifoAllocations,
      });
    }

    // ---------------------------------------------------------
    // SAVE COMPLETE SALE
    //
    // The Sale, SaleLines, FIFO allocations, and inventory
    // quantity updates are saved together in one transaction.
    // ---------------------------------------------------------

    // Total sale revenue is the amount of cash/digital funds
    // received by the Sealed side of the business. This is
    // intentionally revenue, not gross profit.
    const totalSaleRevenueCents =
      preparedLines.reduce(
        (total, preparedLine) =>
          total +
          toCents(
            preparedLine.revenue
          ),
        0
      );

    const sale =
      await prisma.$transaction(
        async (tx) => {
          const generatedSaleNumber =
            await getNextSaleNumber(tx);

          // A sale linked to a Show Visit may only be recorded
          // while that visit is actively in progress.
          if (parsedShowVisitId !== null) {
            const activeVisit =
              await tx.showVisit.updateMany({
                where: {
                  id: parsedShowVisitId,
                  status: "ACTIVE",
                  finalizedAt: null,
                },
                data: {
                  updatedAt: new Date(),
                },
              });

            if (activeVisit.count !== 1) {
              throw new FinalizedVisitError(
                "Cannot add a sale unless the show visit is active"
              );
            }
          }

          const createdSale =
            await tx.sale.create({
              data: {
                saleNumber:
                  generatedSaleNumber,

                saleDate:
                  parsedSaleDate,

                paymentMethod,

                showVisitId:
                  parsedShowVisitId,

                notes:
                  typeof notes ===
                    "string" &&
                  notes.trim().length > 0
                    ? notes.trim()
                    : null,

                finalizedAt:
                  new Date(),
              },
            });

          for (
            const preparedLine of
            preparedLines
          ) {
            const saleLine =
              await tx.saleLine.create({
                data: {
                  saleId:
                    createdSale.id,

                  productId:
                    preparedLine.productId,

                  quantity:
                    preparedLine.quantity,

                  unitSalePrice:
                    preparedLine.unitSalePrice,

                  revenue:
                    preparedLine.revenue,

                  cogs:
                    preparedLine.cogs,

                  grossProfit:
                    preparedLine.grossProfit,

                  grossMargin:
                    preparedLine.grossMargin,
                },
              });

            for (
              const allocation of
              preparedLine.fifoAllocations
            ) {
              await tx.saleAllocation.create({
                data: {
                  saleLineId:
                    saleLine.id,

                  inventoryBatchId:
                    allocation.inventoryBatchId,

                  quantity:
                    allocation.quantity,

                  unitCost:
                    allocation.unitCost,

                  totalCost:
                    allocation.totalCost,
                },
              });

              const consumed = await tx.inventoryBatch.updateMany({
                where: {
                  id: allocation.inventoryBatchId,
                  updatedAt: allocation.batchUpdatedAt,
                },
                data: {
                  quantitySold: {
                    increment:
                      allocation.quantity,
                  },
                },
              });
              if (consumed.count !== 1) {
                throw new InventoryChangedError("Inventory cost or availability changed while the sale was being prepared. Review and try again.");
              }
            }
          }

          // Every finalized sealed sale increases the SEALED
          // funds pool by the full sale revenue. Keeping this
          // inside the same transaction means the sale, FIFO
          // inventory updates, and funds posting either all save
          // together or all roll back together.
          await tx.fundEntry.create({
            data: {
              source: "SEALED",
              type: "SEALED_SALE",
              amount: centsToMoney(
                totalSaleRevenueCents
              ),
              transactionDate:
                parsedSaleDate,
              saleId: createdSale.id,
              note: `Sealed sale ${generatedSaleNumber}`,
            },
          });

          return tx.sale.findUnique({
            where: {
              id: createdSale.id,
            },
            include: {
              showVisit: {
                include: {
                  show: true,
                },
              },

              lines: {
                include: {
                  product: true,

                  allocations: {
                    include: {
                      inventoryBatch: true,
                    },
                  },
                },
              },
            },
          });
        }
      );

    res.status(201).json(sale);
  } catch (error) {
    logServerError(
      "Error creating sale:",
      error
    );

    const prismaCode =
      typeof error === "object" &&
      error !== null &&
      "code" in error
        ? String((error as { code?: unknown }).code)
        : null;

    // A unique-constraint collision should be rare because numbering is
    // serialized, but return a clear message if one ever occurs.
    if (prismaCode === "P2002") {
      return res.status(409).json({
        error:
          "A sale with this sale number already exists. Please try again.",
      });
    }

    if (error instanceof FinalizedVisitError) {
      return res.status(409).json({
        error: error.message,
      });
    }

    if (error instanceof InventoryChangedError) {
      return res.status(409).json({ error: error.message });
    }

    res.status(500).json({
      error: "Failed to create sale",

      ...developmentErrorDetails(error),
    });
  }
});

// ---------------------------------------------------------
// GET ALL SALES
// ---------------------------------------------------------

router.get("/", async (_req, res) => {
  try {
    const sales =
      await prisma.sale.findMany({
        include: {
          showVisit: {
            include: {
              show: true,
            },
          },

          lines: {
            include: {
              product: true,
              allocations: true,
            },
          },
        },

        orderBy: [
          {
            saleDate: "desc",
          },
          {
            id: "desc",
          },
        ],
      });

    res.json(sales);
  } catch (error) {
    logServerError(
      "Error retrieving sales:",
      error
    );

    res.status(500).json({
      error:
        "Failed to retrieve sales",

      ...developmentErrorDetails(error),
    });
  }
});

// ---------------------------------------------------------
// GET SALES SUMMARY
// ---------------------------------------------------------

router.get(
  "/summary",
  async (_req, res) => {
    try {
      const sales =
        await prisma.sale.findMany({
          include: {
            lines: true,
          },
        });

      let totalRevenueCents = 0;
      let totalCogsCents = 0;
      let totalGrossProfitCents = 0;
      let totalUnitsSold = 0;

      let cashRevenueCents = 0;
      let digitalRevenueCents = 0;

      for (const sale of sales) {
        let saleRevenueCents = 0;

        for (
          const line of sale.lines
        ) {
          const revenueCents =
            toCents(
              line.revenue
            );

          const cogsCents =
            toCents(
              line.cogs
            );

          const grossProfitCents =
            toCents(
              line.grossProfit
            );

          totalRevenueCents +=
            revenueCents;

          totalCogsCents +=
            cogsCents;

          totalGrossProfitCents +=
            grossProfitCents;

          totalUnitsSold +=
            line.quantity;

          saleRevenueCents +=
            revenueCents;
        }

        // Payment method belongs to the overall sale,
        // so the entire sale revenue is assigned to either
        // Cash or Digital.
        if (
          sale.paymentMethod ===
          "CASH"
        ) {
          cashRevenueCents +=
            saleRevenueCents;
        }

        if (
          sale.paymentMethod ===
          "DIGITAL"
        ) {
          digitalRevenueCents +=
            saleRevenueCents;
        }
      }

      const totalSalesTransactions =
        sales.length;

      const grossMargin =
        totalRevenueCents > 0
          ? totalGrossProfitCents /
            totalRevenueCents
          : 0;

      const averageSaleValueCents =
        totalSalesTransactions > 0
          ? Math.round(
              totalRevenueCents /
                totalSalesTransactions
            )
          : 0;

      const averageProfitPerSaleCents =
        totalSalesTransactions > 0
          ? Math.round(
              totalGrossProfitCents /
                totalSalesTransactions
            )
          : 0;

      res.json({
        totalSalesTransactions,

        totalUnitsSold,

        totalRevenue:
          Number(
            centsToMoney(
              totalRevenueCents
            )
          ),

        totalCogs:
          Number(
            centsToMoney(
              totalCogsCents
            )
          ),

        grossProfit:
          Number(
            centsToMoney(
              totalGrossProfitCents
            )
          ),

        grossMargin:
          Number(
            grossMargin.toFixed(4)
          ),

        averageSaleValue:
          Number(
            centsToMoney(
              averageSaleValueCents
            )
          ),

        averageProfitPerSale:
          Number(
            centsToMoney(
              averageProfitPerSaleCents
            )
          ),

        paymentMethods: {
          cashRevenue:
            Number(
              centsToMoney(
                cashRevenueCents
              )
            ),

          digitalRevenue:
            Number(
              centsToMoney(
                digitalRevenueCents
              )
            ),
        },
      });
    } catch (error) {
      logServerError(
        "Error retrieving sales summary:",
        error
      );

      res.status(500).json({
        error:
          "Failed to retrieve sales summary",

        ...developmentErrorDetails(error),
      });
    }
  }
);

// ---------------------------------------------------------
// GET PRODUCT PERFORMANCE
// ---------------------------------------------------------

router.get(
  "/product-performance",
  async (_req, res) => {
    try {
      const products =
        await prisma.product.findMany({
          where: {
            type: "SEALED",
          },

          include: {
            saleLines: true,
          },

          orderBy: {
            name: "asc",
          },
        });

      const performance =
        products.map(
          (product) => {
            let unitsSold = 0;
            let revenueCents = 0;
            let cogsCents = 0;
            let grossProfitCents = 0;

            for (
              const line of
              product.saleLines
            ) {
              unitsSold +=
                line.quantity;

              revenueCents +=
                toCents(
                  line.revenue
                );

              cogsCents +=
                toCents(
                  line.cogs
                );

              grossProfitCents +=
                toCents(
                  line.grossProfit
                );
            }

            const grossMargin =
              revenueCents > 0
                ? grossProfitCents /
                  revenueCents
                : 0;

            const roi =
              cogsCents > 0
                ? grossProfitCents /
                  cogsCents
                : 0;

            return {
              productId:
                product.id,

              itemId:
                product.itemId,

              productName:
                product.name,

              unitsSold,

              revenue:
                Number(
                  centsToMoney(
                    revenueCents
                  )
                ),

              cogs:
                Number(
                  centsToMoney(
                    cogsCents
                  )
                ),

              grossProfit:
                Number(
                  centsToMoney(
                    grossProfitCents
                  )
                ),

              grossMargin:
                Number(
                  grossMargin.toFixed(
                    4
                  )
                ),

              roi:
                Number(
                  roi.toFixed(4)
                ),

              hasSales:
                unitsSold > 0,
            };
          }
        );

      // Products need actual sales before they can be eligible
      // for sales-based performance rankings.
      const productsWithSales =
        performance.filter(
          (product) =>
            product.unitsSold > 0 &&
            product.revenue > 0
        );

      // ROI also requires actual COGS.
      const productsWithRoi =
        performance.filter(
          (product) =>
            product.unitsSold > 0 &&
            product.cogs > 0
        );

      const bestSeller =
        productsWithSales.length > 0
          ? productsWithSales.reduce(
              (best, current) =>
                current.unitsSold >
                best.unitsSold
                  ? current
                  : best
            )
          : null;

      const highestRevenue =
        productsWithSales.length > 0
          ? productsWithSales.reduce(
              (best, current) =>
                current.revenue >
                best.revenue
                  ? current
                  : best
            )
          : null;

      const highestGrossProfit =
        productsWithSales.length > 0
          ? productsWithSales.reduce(
              (best, current) =>
                current.grossProfit >
                best.grossProfit
                  ? current
                  : best
            )
          : null;

      const highestGrossMargin =
        productsWithSales.length > 0
          ? productsWithSales.reduce(
              (best, current) =>
                current.grossMargin >
                best.grossMargin
                  ? current
                  : best
            )
          : null;

      const highestRoi =
        productsWithRoi.length > 0
          ? productsWithRoi.reduce(
              (best, current) =>
                current.roi >
                best.roi
                  ? current
                  : best
            )
          : null;

      res.json({
        rankings: {
          bestSeller,
          highestRevenue,
          highestGrossProfit,
          highestGrossMargin,
          highestRoi,
        },

        products:
          performance,
      });
    } catch (error) {
      logServerError(
        "Error retrieving product performance:",
        error
      );

      res.status(500).json({
        error:
          "Failed to retrieve product performance",

        ...developmentErrorDetails(error),
      });
    }
  }
);

export default router;
