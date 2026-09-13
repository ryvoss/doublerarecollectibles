import { Router } from "express";
import { prisma } from "../prisma";

const router = Router();

// ---------------------------------------------------------
// HELPERS
// ---------------------------------------------------------

function toMoney(value: unknown): string {
  return Number(value).toFixed(2);
}

function isValidMoney(value: unknown): boolean {
  const numberValue = Number(value);

  return (
    Number.isFinite(numberValue) &&
    numberValue >= 0
  );
}

function toCents(value: unknown): number {
  return Math.round(
    Number(value) * 100
  );
}

function centsToMoney(
  value: number
): string {
  return (value / 100).toFixed(2);
}

// ---------------------------------------------------------
// GET ALL SHOWS
// ---------------------------------------------------------

router.get("/", async (_req, res) => {
  try {
    const shows =
      await prisma.show.findMany({
        include: {
          visits: {
            orderBy: {
              visitDate: "desc",
            },
          },
        },

        orderBy: {
          name: "asc",
        },
      });

    res.json(shows);
  } catch (error) {
    console.error(
      "Error retrieving shows:",
      error
    );

    res.status(500).json({
      error:
        "Failed to retrieve shows",

      details:
        error instanceof Error
          ? error.message
          : String(error),
    });
  }
});

// ---------------------------------------------------------
// CREATE SHOW
// ---------------------------------------------------------

router.post("/", async (req, res) => {
  try {
    const {
      name,
      active = true,
      notes,
    } = req.body;

    if (
      typeof name !== "string" ||
      name.trim().length === 0
    ) {
      return res.status(400).json({
        error: "Show name is required",
      });
    }

    const cleanName =
      name.trim();

    const existingShow =
      await prisma.show.findUnique({
        where: {
          name: cleanName,
        },
      });

    if (existingShow) {
      return res.status(409).json({
        error:
          "A show with this name already exists",
      });
    }

    const show =
      await prisma.show.create({
        data: {
          name: cleanName,

          active:
            Boolean(active),

          notes:
            typeof notes === "string" &&
            notes.trim().length > 0
              ? notes.trim()
              : null,
        },
      });

    res.status(201).json(show);
  } catch (error) {
    console.error(
      "Error creating show:",
      error
    );

    res.status(500).json({
      error:
        "Failed to create show",

      details:
        error instanceof Error
          ? error.message
          : String(error),
    });
  }
});

// ---------------------------------------------------------
// SHOW VISIT PERFORMANCE
// ---------------------------------------------------------

router.get(
  "/visits/:visitId/performance",
  async (req, res) => {
    try {
      const visitId =
        Number(req.params.visitId);

      if (
        !Number.isInteger(visitId) ||
        visitId <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid show visit ID",
        });
      }

      const visit =
        await prisma.showVisit.findUnique({
          where: {
            id: visitId,
          },

          include: {
            show: true,

            sales: {
              include: {
                lines: {
                  include: {
                    product: true,
                  },
                },
              },
            },
          },
        });

      if (!visit) {
        return res.status(404).json({
          error:
            "Show visit not found",
        });
      }

      // -----------------------------------------------------
      // STARTING POSITION
      // -----------------------------------------------------

      const startingSinglesCents =
        toCents(
          visit.startingSinglesValue
        );

      const startingCashCents =
        toCents(
          visit.startingCash
        );

      const startingDigitalCents =
        toCents(
          visit.startingDigital
        );

      const startingLiquidFundsCents =
        startingCashCents +
        startingDigitalCents;

      const startingTotalPositionCents =
        startingSinglesCents +
        startingLiquidFundsCents;

      // -----------------------------------------------------
      // ENDING POSITION
      // -----------------------------------------------------

      const endingSinglesCents =
        visit.endingSinglesValue !== null
          ? toCents(
              visit.endingSinglesValue
            )
          : null;

      const endingCashCents =
        visit.endingCash !== null
          ? toCents(
              visit.endingCash
            )
          : null;

      const endingDigitalCents =
        visit.endingDigital !== null
          ? toCents(
              visit.endingDigital
            )
          : null;

      let singlesInventoryGrowthCents:
        | number
        | null = null;

      let cashChangeCents:
        | number
        | null = null;

      let digitalChangeCents:
        | number
        | null = null;

      let endingLiquidFundsCents:
        | number
        | null = null;

      let liquidFundsChangeCents:
        | number
        | null = null;

      let endingTotalPositionCents:
        | number
        | null = null;

      let totalPositionGrowthCents:
        | number
        | null = null;

      if (
        endingSinglesCents !== null &&
        endingCashCents !== null &&
        endingDigitalCents !== null
      ) {
        singlesInventoryGrowthCents =
          endingSinglesCents -
          startingSinglesCents;

        cashChangeCents =
          endingCashCents -
          startingCashCents;

        digitalChangeCents =
          endingDigitalCents -
          startingDigitalCents;

        endingLiquidFundsCents =
          endingCashCents +
          endingDigitalCents;

        liquidFundsChangeCents =
          endingLiquidFundsCents -
          startingLiquidFundsCents;

        endingTotalPositionCents =
          endingSinglesCents +
          endingLiquidFundsCents;

        totalPositionGrowthCents =
          endingTotalPositionCents -
          startingTotalPositionCents;
      }

      // -----------------------------------------------------
      // SEALED PERFORMANCE
      // -----------------------------------------------------

      let sealedRevenueCents = 0;
      let sealedCogsCents = 0;

      let sealedCashRevenueCents = 0;
      let sealedDigitalRevenueCents = 0;

      let sealedUnitsSold = 0;
      let sealedSalesTransactions = 0;

      for (const sale of visit.sales) {
        let containsSealedProduct =
          false;

        for (const line of sale.lines) {
          if (
            line.product.type !==
            "SEALED"
          ) {
            continue;
          }

          containsSealedProduct =
            true;

          const revenueCents =
            toCents(
              line.revenue
            );

          const cogsCents =
            toCents(
              line.cogs
            );

          sealedRevenueCents +=
            revenueCents;

          sealedCogsCents +=
            cogsCents;

          sealedUnitsSold +=
            line.quantity;

          if (
            sale.paymentMethod ===
            "CASH"
          ) {
            sealedCashRevenueCents +=
              revenueCents;
          }

          if (
            sale.paymentMethod ===
            "DIGITAL"
          ) {
            sealedDigitalRevenueCents +=
              revenueCents;
          }
        }

        if (containsSealedProduct) {
          sealedSalesTransactions += 1;
        }
      }

      const sealedGrossProfitCents =
        sealedRevenueCents -
        sealedCogsCents;

      const sealedGrossMargin =
        sealedRevenueCents > 0
          ? sealedGrossProfitCents /
            sealedRevenueCents
          : 0;

      res.json({
        visit: {
          visitId:
            visit.id,

          showId:
            visit.showId,

          showName:
            visit.show.name,

          visitDate:
            visit.visitDate,

          finalized:
            visit.finalizedAt !== null,

          finalizedAt:
            visit.finalizedAt,
        },

        singles: {
          startingInventoryValue:
            centsToMoney(
              startingSinglesCents
            ),

          endingInventoryValue:
            endingSinglesCents !== null
              ? centsToMoney(
                  endingSinglesCents
                )
              : null,

          inventoryGrowth:
            singlesInventoryGrowthCents !==
            null
              ? centsToMoney(
                  singlesInventoryGrowthCents
                )
              : null,
        },

        funds: {
          startingCash:
            centsToMoney(
              startingCashCents
            ),

          endingCash:
            endingCashCents !== null
              ? centsToMoney(
                  endingCashCents
                )
              : null,

          cashChange:
            cashChangeCents !== null
              ? centsToMoney(
                  cashChangeCents
                )
              : null,

          startingDigital:
            centsToMoney(
              startingDigitalCents
            ),

          endingDigital:
            endingDigitalCents !== null
              ? centsToMoney(
                  endingDigitalCents
                )
              : null,

          digitalChange:
            digitalChangeCents !== null
              ? centsToMoney(
                  digitalChangeCents
                )
              : null,

          startingLiquidFunds:
            centsToMoney(
              startingLiquidFundsCents
            ),

          endingLiquidFunds:
            endingLiquidFundsCents !== null
              ? centsToMoney(
                  endingLiquidFundsCents
                )
              : null,

          liquidFundsChange:
            liquidFundsChangeCents !== null
              ? centsToMoney(
                  liquidFundsChangeCents
                )
              : null,
        },

        position: {
          startingTotalPosition:
            centsToMoney(
              startingTotalPositionCents
            ),

          endingTotalPosition:
            endingTotalPositionCents !== null
              ? centsToMoney(
                  endingTotalPositionCents
                )
              : null,

          totalPositionGrowth:
            totalPositionGrowthCents !== null
              ? centsToMoney(
                  totalPositionGrowthCents
                )
              : null,

          isProfit: false,
        },

        sealed: {
          salesTransactions:
            sealedSalesTransactions,

          unitsSold:
            sealedUnitsSold,

          revenue:
            centsToMoney(
              sealedRevenueCents
            ),

          cashRevenue:
            centsToMoney(
              sealedCashRevenueCents
            ),

          digitalRevenue:
            centsToMoney(
              sealedDigitalRevenueCents
            ),

          cogs:
            centsToMoney(
              sealedCogsCents
            ),

          grossProfit:
            centsToMoney(
              sealedGrossProfitCents
            ),

          grossMargin:
            Number(
              sealedGrossMargin.toFixed(6)
            ),
        },
      });
    } catch (error) {
      console.error(
        "Error calculating show visit performance:",
        error
      );

      res.status(500).json({
        error:
          "Failed to calculate show visit performance",

        details:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

// ---------------------------------------------------------
// GET ONE SHOW VISIT
// ---------------------------------------------------------

router.get(
  "/visits/:visitId",
  async (req, res) => {
    try {
      const visitId =
        Number(req.params.visitId);

      if (
        !Number.isInteger(visitId) ||
        visitId <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid show visit ID",
        });
      }

      const visit =
        await prisma.showVisit.findUnique({
          where: {
            id: visitId,
          },

          include: {
            show: true,

            sales: {
              include: {
                lines: {
                  include: {
                    product: true,
                    allocations: true,
                  },
                },
              },

              orderBy: [
                {
                  saleDate: "asc",
                },
                {
                  id: "asc",
                },
              ],
            },
          },
        });

      if (!visit) {
        return res.status(404).json({
          error:
            "Show visit not found",
        });
      }

      res.json(visit);
    } catch (error) {
      console.error(
        "Error retrieving show visit:",
        error
      );

      res.status(500).json({
        error:
          "Failed to retrieve show visit",

        details:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

// ---------------------------------------------------------
// FINALIZE SHOW VISIT
// ---------------------------------------------------------

router.patch(
  "/visits/:visitId/finalize",
  async (req, res) => {
    try {
      const visitId =
        Number(req.params.visitId);

      const {
        endingSinglesValue,
        endingCash,
        endingDigital,
      } = req.body;

      if (
        !Number.isInteger(visitId) ||
        visitId <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid show visit ID",
        });
      }

      const visit =
        await prisma.showVisit.findUnique({
          where: {
            id: visitId,
          },
        });

      if (!visit) {
        return res.status(404).json({
          error:
            "Show visit not found",
        });
      }

      if (visit.finalizedAt) {
        return res.status(409).json({
          error:
            "Show visit is already finalized",
        });
      }

      if (
        endingSinglesValue ===
          undefined ||
        endingSinglesValue === null
      ) {
        return res.status(400).json({
          error:
            "Ending singles value is required",
        });
      }

      if (
        endingCash === undefined ||
        endingCash === null
      ) {
        return res.status(400).json({
          error:
            "Ending cash is required",
        });
      }

      if (
        endingDigital === undefined ||
        endingDigital === null
      ) {
        return res.status(400).json({
          error:
            "Ending digital is required",
        });
      }

      if (
        !isValidMoney(
          endingSinglesValue
        )
      ) {
        return res.status(400).json({
          error:
            "Ending singles value must be a valid non-negative number",
        });
      }

      if (
        !isValidMoney(
          endingCash
        )
      ) {
        return res.status(400).json({
          error:
            "Ending cash must be a valid non-negative number",
        });
      }

      if (
        !isValidMoney(
          endingDigital
        )
      ) {
        return res.status(400).json({
          error:
            "Ending digital must be a valid non-negative number",
        });
      }

      const finalizedVisit =
        await prisma.showVisit.update({
          where: {
            id: visitId,
          },

          data: {
            endingSinglesValue:
              toMoney(
                endingSinglesValue
              ),

            endingCash:
              toMoney(
                endingCash
              ),

            endingDigital:
              toMoney(
                endingDigital
              ),

            finalizedAt:
              new Date(),
          },

          include: {
            show: true,
          },
        });

      res.json(finalizedVisit);
    } catch (error) {
      console.error(
        "Error finalizing show visit:",
        error
      );

      res.status(500).json({
        error:
          "Failed to finalize show visit",

        details:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

// ---------------------------------------------------------
// RECURRING SHOW PERFORMANCE
//
// Combines all visits for one recurring Show.
//
// Sealed performance comes from actual linked sales.
// Position growth only uses finalized visits.
// ---------------------------------------------------------

router.get(
  "/:showId/performance",
  async (req, res) => {
    try {
      const showId =
        Number(req.params.showId);

      if (
        !Number.isInteger(showId) ||
        showId <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid show ID",
        });
      }

      const show =
        await prisma.show.findUnique({
          where: {
            id: showId,
          },

          include: {
            visits: {
              include: {
                sales: {
                  include: {
                    lines: {
                      include: {
                        product: true,
                      },
                    },
                  },
                },
              },

              orderBy: {
                visitDate: "asc",
              },
            },
          },
        });

      if (!show) {
        return res.status(404).json({
          error:
            "Show not found",
        });
      }

      // -----------------------------------------------------
      // OVERALL TOTALS
      // -----------------------------------------------------

      let totalSealedRevenueCents = 0;
      let totalSealedCogsCents = 0;

      let totalSealedCashRevenueCents = 0;
      let totalSealedDigitalRevenueCents = 0;

      let totalSealedUnitsSold = 0;
      let totalSealedTransactions = 0;

      let totalPositionGrowthCents = 0;
      let totalSinglesInventoryGrowthCents = 0;
      let totalLiquidFundsChangeCents = 0;

      let finalizedVisitCount = 0;

      const visitPerformance = [];

      // -----------------------------------------------------
      // CALCULATE EACH VISIT
      // -----------------------------------------------------

      for (const visit of show.visits) {
        let visitRevenueCents = 0;
        let visitCogsCents = 0;

        let visitCashRevenueCents = 0;
        let visitDigitalRevenueCents = 0;

        let visitUnitsSold = 0;
        let visitTransactions = 0;

        for (const sale of visit.sales) {
          let containsSealedProduct =
            false;

          for (const line of sale.lines) {
            if (
              line.product.type !==
              "SEALED"
            ) {
              continue;
            }

            containsSealedProduct =
              true;

            const revenueCents =
              toCents(
                line.revenue
              );

            const cogsCents =
              toCents(
                line.cogs
              );

            visitRevenueCents +=
              revenueCents;

            visitCogsCents +=
              cogsCents;

            visitUnitsSold +=
              line.quantity;

            if (
              sale.paymentMethod ===
              "CASH"
            ) {
              visitCashRevenueCents +=
                revenueCents;
            }

            if (
              sale.paymentMethod ===
              "DIGITAL"
            ) {
              visitDigitalRevenueCents +=
                revenueCents;
            }
          }

          if (containsSealedProduct) {
            visitTransactions += 1;
          }
        }

        const visitGrossProfitCents =
          visitRevenueCents -
          visitCogsCents;

        const visitGrossMargin =
          visitRevenueCents > 0
            ? visitGrossProfitCents /
              visitRevenueCents
            : 0;

        // ---------------------------------------------------
        // POSITION PERFORMANCE
        //
        // Only finalized visits have meaningful ending values.
        // ---------------------------------------------------

        let positionGrowthCents:
          | number
          | null = null;

        let singlesInventoryGrowthCents:
          | number
          | null = null;

        let liquidFundsChangeCents:
          | number
          | null = null;

        if (
          visit.finalizedAt &&
          visit.endingSinglesValue !==
            null &&
          visit.endingCash !== null &&
          visit.endingDigital !== null
        ) {
          finalizedVisitCount += 1;

          const startingSinglesCents =
            toCents(
              visit.startingSinglesValue
            );

          const endingSinglesCents =
            toCents(
              visit.endingSinglesValue
            );

          const startingLiquidCents =
            toCents(
              visit.startingCash
            ) +
            toCents(
              visit.startingDigital
            );

          const endingLiquidCents =
            toCents(
              visit.endingCash
            ) +
            toCents(
              visit.endingDigital
            );

          singlesInventoryGrowthCents =
            endingSinglesCents -
            startingSinglesCents;

          liquidFundsChangeCents =
            endingLiquidCents -
            startingLiquidCents;

          positionGrowthCents =
            singlesInventoryGrowthCents +
            liquidFundsChangeCents;

          totalSinglesInventoryGrowthCents +=
            singlesInventoryGrowthCents;

          totalLiquidFundsChangeCents +=
            liquidFundsChangeCents;

          totalPositionGrowthCents +=
            positionGrowthCents;
        }

        // ---------------------------------------------------
        // ADD TO RECURRING TOTALS
        // ---------------------------------------------------

        totalSealedRevenueCents +=
          visitRevenueCents;

        totalSealedCogsCents +=
          visitCogsCents;

        totalSealedCashRevenueCents +=
          visitCashRevenueCents;

        totalSealedDigitalRevenueCents +=
          visitDigitalRevenueCents;

        totalSealedUnitsSold +=
          visitUnitsSold;

        totalSealedTransactions +=
          visitTransactions;

        visitPerformance.push({
          visitId:
            visit.id,

          visitDate:
            visit.visitDate,

          finalized:
            visit.finalizedAt !== null,

          sealed: {
            transactions:
              visitTransactions,

            unitsSold:
              visitUnitsSold,

            revenue:
              Number(
                centsToMoney(
                  visitRevenueCents
                )
              ),

            cogs:
              Number(
                centsToMoney(
                  visitCogsCents
                )
              ),

            grossProfit:
              Number(
                centsToMoney(
                  visitGrossProfitCents
                )
              ),

            grossMargin:
              Number(
                visitGrossMargin.toFixed(
                  4
                )
              ),

            cashRevenue:
              Number(
                centsToMoney(
                  visitCashRevenueCents
                )
              ),

            digitalRevenue:
              Number(
                centsToMoney(
                  visitDigitalRevenueCents
                )
              ),
          },

          position: {
            singlesInventoryGrowth:
              singlesInventoryGrowthCents !==
              null
                ? Number(
                    centsToMoney(
                      singlesInventoryGrowthCents
                    )
                  )
                : null,

            liquidFundsChange:
              liquidFundsChangeCents !==
              null
                ? Number(
                    centsToMoney(
                      liquidFundsChangeCents
                    )
                  )
                : null,

            totalPositionGrowth:
              positionGrowthCents !==
              null
                ? Number(
                    centsToMoney(
                      positionGrowthCents
                    )
                  )
                : null,

            isProfit: false,
          },
        });
      }

      // -----------------------------------------------------
      // RECURRING SHOW METRICS
      // -----------------------------------------------------

      const totalVisits =
        show.visits.length;

      const openVisits =
        totalVisits -
        finalizedVisitCount;

      const totalSealedGrossProfitCents =
        totalSealedRevenueCents -
        totalSealedCogsCents;

      const sealedGrossMargin =
        totalSealedRevenueCents > 0
          ? totalSealedGrossProfitCents /
            totalSealedRevenueCents
          : 0;

      const sealedRoi =
        totalSealedCogsCents > 0
          ? totalSealedGrossProfitCents /
            totalSealedCogsCents
          : 0;

      const averageRevenuePerVisitCents =
        totalVisits > 0
          ? Math.round(
              totalSealedRevenueCents /
                totalVisits
            )
          : 0;

      const averageGrossProfitPerVisitCents =
        totalVisits > 0
          ? Math.round(
              totalSealedGrossProfitCents /
                totalVisits
            )
          : 0;

      const averageUnitsSoldPerVisit =
        totalVisits > 0
          ? totalSealedUnitsSold /
            totalVisits
          : 0;

      const averagePositionGrowthCents =
        finalizedVisitCount > 0
          ? Math.round(
              totalPositionGrowthCents /
                finalizedVisitCount
            )
          : 0;

      // -----------------------------------------------------
      // BEST VISITS
      // -----------------------------------------------------

      const visitsWithRevenue =
        visitPerformance.filter(
          (visit) =>
            visit.sealed.revenue > 0
        );

      const finalizedVisits =
        visitPerformance.filter(
          (visit) =>
            visit.finalized &&
            visit.position
              .totalPositionGrowth !==
              null
        );

      const bestRevenueVisit =
        visitsWithRevenue.length > 0
          ? visitsWithRevenue.reduce(
              (best, current) =>
                current.sealed.revenue >
                best.sealed.revenue
                  ? current
                  : best
            )
          : null;

      const bestGrossProfitVisit =
        visitsWithRevenue.length > 0
          ? visitsWithRevenue.reduce(
              (best, current) =>
                current.sealed
                  .grossProfit >
                best.sealed
                  .grossProfit
                  ? current
                  : best
            )
          : null;

      const bestPositionGrowthVisit =
        finalizedVisits.length > 0
          ? finalizedVisits.reduce(
              (best, current) =>
                (
                  current.position
                    .totalPositionGrowth ??
                  0
                ) >
                (
                  best.position
                    .totalPositionGrowth ??
                  0
                )
                  ? current
                  : best
            )
          : null;

      // -----------------------------------------------------
      // RESPONSE
      // -----------------------------------------------------

      res.json({
        show: {
          showId:
            show.id,

          showName:
            show.name,

          active:
            show.active,

          totalVisits,

          finalizedVisits:
            finalizedVisitCount,

          openVisits,
        },

        sealed: {
          salesTransactions:
            totalSealedTransactions,

          unitsSold:
            totalSealedUnitsSold,

          revenue:
            Number(
              centsToMoney(
                totalSealedRevenueCents
              )
            ),

          cashRevenue:
            Number(
              centsToMoney(
                totalSealedCashRevenueCents
              )
            ),

          digitalRevenue:
            Number(
              centsToMoney(
                totalSealedDigitalRevenueCents
              )
            ),

          cogs:
            Number(
              centsToMoney(
                totalSealedCogsCents
              )
            ),

          grossProfit:
            Number(
              centsToMoney(
                totalSealedGrossProfitCents
              )
            ),

          grossMargin:
            Number(
              sealedGrossMargin.toFixed(
                4
              )
            ),

          roi:
            Number(
              sealedRoi.toFixed(4)
            ),
        },

        averages: {
          revenuePerVisit:
            Number(
              centsToMoney(
                averageRevenuePerVisitCents
              )
            ),

          grossProfitPerVisit:
            Number(
              centsToMoney(
                averageGrossProfitPerVisitCents
              )
            ),

          unitsSoldPerVisit:
            Number(
              averageUnitsSoldPerVisit.toFixed(
                2
              )
            ),

          positionGrowthPerFinalizedVisit:
            Number(
              centsToMoney(
                averagePositionGrowthCents
              )
            ),
        },

        position: {
          singlesInventoryGrowth:
            Number(
              centsToMoney(
                totalSinglesInventoryGrowthCents
              )
            ),

          liquidFundsChange:
            Number(
              centsToMoney(
                totalLiquidFundsChangeCents
              )
            ),

          totalPositionGrowth:
            Number(
              centsToMoney(
                totalPositionGrowthCents
              )
            ),

          isProfit: false,
        },

        bestVisits: {
          bySealedRevenue:
            bestRevenueVisit,

          bySealedGrossProfit:
            bestGrossProfitVisit,

          byPositionGrowth:
            bestPositionGrowthVisit,
        },

        visits:
          visitPerformance,
      });
    } catch (error) {
      console.error(
        "Error calculating recurring show performance:",
        error
      );

      res.status(500).json({
        error:
          "Failed to calculate recurring show performance",

        details:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

// ---------------------------------------------------------
// GET ONE SHOW
// ---------------------------------------------------------

router.get(
  "/:showId",
  async (req, res) => {
    try {
      const showId =
        Number(req.params.showId);

      if (
        !Number.isInteger(showId) ||
        showId <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid show ID",
        });
      }

      const show =
        await prisma.show.findUnique({
          where: {
            id: showId,
          },

          include: {
            visits: {
              orderBy: {
                visitDate: "desc",
              },
            },
          },
        });

      if (!show) {
        return res.status(404).json({
          error:
            "Show not found",
        });
      }

      res.json(show);
    } catch (error) {
      console.error(
        "Error retrieving show:",
        error
      );

      res.status(500).json({
        error:
          "Failed to retrieve show",

        details:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

// ---------------------------------------------------------
// CREATE SHOW VISIT
// ---------------------------------------------------------

router.post(
  "/:showId/visits",
  async (req, res) => {
    try {
      const showId =
        Number(req.params.showId);

      const {
        visitDate,
        startingSinglesValue = 0,
        endingSinglesValue,
        startingCash = 0,
        endingCash,
        startingDigital = 0,
        endingDigital,
        notes,
      } = req.body;

      if (
        !Number.isInteger(showId) ||
        showId <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid show ID",
        });
      }

      const show =
        await prisma.show.findUnique({
          where: {
            id: showId,
          },
        });

      if (!show) {
        return res.status(404).json({
          error:
            "Show not found",
        });
      }

      if (!visitDate) {
        return res.status(400).json({
          error:
            "Visit date is required",
        });
      }

      const parsedVisitDate =
        new Date(visitDate);

      if (
        Number.isNaN(
          parsedVisitDate.getTime()
        )
      ) {
        return res.status(400).json({
          error:
            "Visit date is invalid",
        });
      }

      if (
        !isValidMoney(
          startingSinglesValue
        )
      ) {
        return res.status(400).json({
          error:
            "Starting singles value must be a valid non-negative number",
        });
      }

      if (
        !isValidMoney(
          startingCash
        )
      ) {
        return res.status(400).json({
          error:
            "Starting cash must be a valid non-negative number",
        });
      }

      if (
        !isValidMoney(
          startingDigital
        )
      ) {
        return res.status(400).json({
          error:
            "Starting digital must be a valid non-negative number",
        });
      }

      if (
        endingSinglesValue !==
          undefined &&
        endingSinglesValue !== null &&
        !isValidMoney(
          endingSinglesValue
        )
      ) {
        return res.status(400).json({
          error:
            "Ending singles value must be a valid non-negative number",
        });
      }

      if (
        endingCash !== undefined &&
        endingCash !== null &&
        !isValidMoney(
          endingCash
        )
      ) {
        return res.status(400).json({
          error:
            "Ending cash must be a valid non-negative number",
        });
      }

      if (
        endingDigital !== undefined &&
        endingDigital !== null &&
        !isValidMoney(
          endingDigital
        )
      ) {
        return res.status(400).json({
          error:
            "Ending digital must be a valid non-negative number",
        });
      }

      const existingVisit =
        await prisma.showVisit.findUnique({
          where: {
            showId_visitDate: {
              showId,

              visitDate:
                parsedVisitDate,
            },
          },
        });

      if (existingVisit) {
        return res.status(409).json({
          error:
            "A visit for this show already exists on this date",
        });
      }

      const visit =
        await prisma.showVisit.create({
          data: {
            showId,

            visitDate:
              parsedVisitDate,

            startingSinglesValue:
              toMoney(
                startingSinglesValue
              ),

            endingSinglesValue:
              endingSinglesValue !==
                undefined &&
              endingSinglesValue !== null
                ? toMoney(
                    endingSinglesValue
                  )
                : null,

            startingCash:
              toMoney(
                startingCash
              ),

            endingCash:
              endingCash !==
                undefined &&
              endingCash !== null
                ? toMoney(
                    endingCash
                  )
                : null,

            startingDigital:
              toMoney(
                startingDigital
              ),

            endingDigital:
              endingDigital !==
                undefined &&
              endingDigital !== null
                ? toMoney(
                    endingDigital
                  )
                : null,

            notes:
              typeof notes ===
                "string" &&
              notes.trim().length > 0
                ? notes.trim()
                : null,
          },

          include: {
            show: true,
          },
        });

      res.status(201).json(visit);
    } catch (error) {
      console.error(
        "Error creating show visit:",
        error
      );

      res.status(500).json({
        error:
          "Failed to create show visit",

        details:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

// ---------------------------------------------------------
// GET VISITS FOR ONE SHOW
// ---------------------------------------------------------

router.get(
  "/:showId/visits",
  async (req, res) => {
    try {
      const showId =
        Number(req.params.showId);

      if (
        !Number.isInteger(showId) ||
        showId <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid show ID",
        });
      }

      const show =
        await prisma.show.findUnique({
          where: {
            id: showId,
          },
        });

      if (!show) {
        return res.status(404).json({
          error:
            "Show not found",
        });
      }

      const visits =
        await prisma.showVisit.findMany({
          where: {
            showId,
          },

          include: {
            show: true,
          },

          orderBy: {
            visitDate: "desc",
          },
        });

      res.json(visits);
    } catch (error) {
      console.error(
        "Error retrieving show visits:",
        error
      );

      res.status(500).json({
        error:
          "Failed to retrieve show visits",

        details:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

export default router;