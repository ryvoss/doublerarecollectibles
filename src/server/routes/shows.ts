import { Router } from "express";
import { prisma } from "../prisma";
import { createShowProductPerformanceHandler } from "../reporting/showProductPerformance";

const router = Router();

router.get("/visits/:visitId/product-performance", createShowProductPerformanceHandler(prisma, "visit"));
router.get("/:showId/product-performance", createShowProductPerformanceHandler(prisma, "show"));

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
// GET ACTIVE SHOW VISIT
// ---------------------------------------------------------

router.get("/active-visit", async (_req, res) => {
  try {
    const activeVisit =
      await prisma.showVisit.findFirst({
        where: {
          status: "ACTIVE",
        },

        include: {
          show: true,
        },

        orderBy: {
          startedAt: "asc",
        },
      });

    res.json({
      activeVisit,
    });
  } catch (error) {
    console.error(
      "Error retrieving active show visit:",
      error
    );

    res.status(500).json({
      error:
        "Failed to retrieve active show visit",

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

router.patch("/:showId", async (req, res) => {
  const showId = Number(req.params.showId);
  const {name, notes, active} = req.body;
  if (!Number.isSafeInteger(showId) || showId <= 0 ||
      (name !== undefined && (typeof name !== "string" || !name.trim())) ||
      (notes != null && typeof notes !== "string") ||
      (active !== undefined && typeof active !== "boolean")) {
    return res.status(400).json({error: "Invalid show information"});
  }
  try {
    const existing = await prisma.show.findUnique({where: {id: showId}});
    if (!existing) return res.status(404).json({error: "Show not found"});
    const updated = await prisma.show.update({where: {id: showId}, data: {
      ...(name !== undefined ? {name: name.trim()} : {}),
      ...(notes !== undefined ? {notes: notes?.trim() || null} : {}),
      ...(active !== undefined ? {active} : {}),
    }});
    res.json(updated);
  } catch (error) {
    const duplicate = typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
    res.status(duplicate ? 409 : 500).json({error: duplicate ? "A show with this name already exists" : "Failed to update show"});
  }
});

router.patch("/visits/:visitId", async (req, res) => {
  const visitId = Number(req.params.visitId);
  const { visitDate, notes } = req.body;

  if (
    !Number.isSafeInteger(visitId) ||
    visitId <= 0 ||
    typeof visitDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(visitDate) ||
    !Number.isFinite(
      new Date(visitDate).getTime()
    ) ||
    new Date(visitDate)
      .toISOString()
      .slice(0, 10) !== visitDate ||
    (notes != null &&
      typeof notes !== "string")
  ) {
    return res.status(400).json({
      error:
        "Enter a valid visit date and notes",
    });
  }

  try {
    const existing =
      await prisma.showVisit.findUnique({
        where: {
          id: visitId,
        },
      });

    if (!existing) {
      return res.status(404).json({
        error: "Show visit not found",
      });
    }

    if (existing.status !== "PLANNED") {
      return res.status(409).json({
        error:
          "Only planned visits can be edited",
      });
    }

    const updated =
      await prisma.showVisit.updateMany({
        where: {
          id: visitId,
          status: "PLANNED",
        },

        data: {
          visitDate: new Date(visitDate),

          ...(notes !== undefined
            ? {
                notes:
                  notes?.trim() || null,
              }
            : {}),
        },
      });

    if (updated.count !== 1) {
      return res.status(409).json({
        error:
          "Only planned visits can be edited",
      });
    }

    res.json(
      await prisma.showVisit.findUnique({
        where: {
          id: visitId,
        },

        include: {
          show: true,
        },
      })
    );
  } catch (error) {
    const duplicate =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002";

    res
      .status(duplicate ? 409 : 500)
      .json({
        error: duplicate
          ? "A visit already exists for this show and date"
          : "Failed to update visit",
      });
  }
});

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

          status:
            visit.status,

          startedAt:
            visit.startedAt,

          finalized:
            visit.status === "FINALIZED",

          finalizedAt:
            visit.finalizedAt,

          provisional:
            visit.status !== "FINALIZED",
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
// BEGIN SHOW VISIT
// ---------------------------------------------------------

router.patch(
  "/visits/:visitId/begin",
  async (req, res) => {
    try {
      const visitId =
        Number(req.params.visitId);

      const {
        startingSinglesValue,
        startingCash,
        startingDigital,
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

      if (
        !isValidMoney(
          startingSinglesValue
        )
      ) {
        return res.status(400).json({
          error:
            "Starting singles inventory value must be a valid non-negative number",
        });
      }

      if (
        !isValidMoney(startingCash)
      ) {
        return res.status(400).json({
          error:
            "Starting singles cash must be a valid non-negative number",
        });
      }

      if (
        !isValidMoney(startingDigital)
      ) {
        return res.status(400).json({
          error:
            "Starting singles digital funds must be a valid non-negative number",
        });
      }

      const visit =
        await prisma.showVisit.findUnique({
          where: {
            id: visitId,
          },

          include: {
            show: true,
          },
        });

      if (!visit) {
        return res.status(404).json({
          error:
            "Show visit not found",
        });
      }

      if (!visit.show.active) {
        return res.status(409).json({
          error:
            "Reactivate the show before beginning this visit",
        });
      }

      if (visit.status !== "PLANNED") {
        return res.status(409).json({
          error:
            visit.status === "ACTIVE"
              ? "Show visit is already active"
              : "Finalized visits cannot be started",
        });
      }

      const result =
        await prisma.$transaction(
          async (tx) => {
            // Only one Show Visit may be ACTIVE at a time.
            const currentActiveVisit =
              await tx.showVisit.findFirst({
                where: {
                  status: "ACTIVE",
                },

                include: {
                  show: true,
                },
              });

            if (currentActiveVisit) {
              return {
                conflict: currentActiveVisit,
                visit: null,
              };
            }

            const startedAt = new Date();

            const updated =
              await tx.showVisit.updateMany({
                where: {
                  id: visitId,
                  status: "PLANNED",
                },

                data: {
                  status: "ACTIVE",
                  startedAt,
                  startingSinglesValue:
                    toMoney(
                      startingSinglesValue
                    ),
                  startingCash:
                    toMoney(startingCash),
                  startingDigital:
                    toMoney(
                      startingDigital
                    ),
                  endingSinglesValue: null,
                  endingCash: null,
                  endingDigital: null,
                  finalizedAt: null,
                },
              });

            if (updated.count !== 1) {
              return {
                conflict: null,
                visit: null,
              };
            }

            const activeVisit =
              await tx.showVisit.findUnique({
                where: {
                  id: visitId,
                },

                include: {
                  show: true,
                },
              });

            return {
              conflict: null,
              visit: activeVisit,
            };
          }
        );

      if (result.conflict) {
        return res.status(409).json({
          error:
            "Another show visit is already active",
          activeVisit: {
            id: result.conflict.id,
            showName:
              result.conflict.show.name,
            visitDate:
              result.conflict.visitDate,
          },
        });
      }

      if (!result.visit) {
        return res.status(409).json({
          error:
            "Show visit could not be started because its status changed",
        });
      }

      res.json(result.visit);
    } catch (error) {
      console.error(
        "Error beginning show visit:",
        error
      );

      res.status(500).json({
        error:
          "Failed to begin show visit",

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

      if (
        !isValidMoney(
          endingSinglesValue
        )
      ) {
        return res.status(400).json({
          error:
            "Ending singles inventory value must be a valid non-negative number",
        });
      }

      if (!isValidMoney(endingCash)) {
        return res.status(400).json({
          error:
            "Ending singles cash must be a valid non-negative number",
        });
      }

      if (
        !isValidMoney(endingDigital)
      ) {
        return res.status(400).json({
          error:
            "Ending singles digital funds must be a valid non-negative number",
        });
      }

      const visit =
        await prisma.showVisit.findUnique({
          where: {
            id: visitId,
          },

          include: {
            show: true,

            fundEntries: {
              where: {
                source: "SINGLES",
                type: "SINGLES_SHOW_GAIN",
              },

              orderBy: {
                id: "asc",
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

      if (
        visit.status === "FINALIZED" ||
        visit.finalizedAt
      ) {
        return res.status(409).json({
          error:
            "Show visit is already finalized",
        });
      }

      if (visit.status !== "ACTIVE") {
        return res.status(409).json({
          error:
            "Show visit must be active before it can be finalized",
        });
      }

      // Cash and Digital on a Show Visit represent the SINGLES
      // money pool only. Sealed sales post independently to the
      // SEALED funds ledger, so they are not subtracted here.
      const startingSinglesFundsCents =
        toCents(visit.startingCash) +
        toCents(visit.startingDigital);

      const endingSinglesFundsCents =
        toCents(endingCash) +
        toCents(endingDigital);

      const singlesFundsChangeCents =
        endingSinglesFundsCents -
        startingSinglesFundsCents;

      const existingShowGain =
        visit.fundEntries[0] ?? null;

      if (
        existingShowGain &&
        toCents(existingShowGain.amount) !==
          singlesFundsChangeCents
      ) {
        return res.status(409).json({
          error:
            "This visit already has a Singles funds entry that does not match the ending snapshot",
        });
      }

      const finalizedVisit =
        await prisma.$transaction(
          async (tx) => {
            const finalizedAt =
              new Date();

            const result =
              await tx.showVisit.updateMany({
                where: {
                  id: visitId,
                  status: "ACTIVE",
                  finalizedAt: null,
                },

                data: {
                  status: "FINALIZED",
                  endingSinglesValue:
                    toMoney(
                      endingSinglesValue
                    ),
                  endingCash:
                    toMoney(endingCash),
                  endingDigital:
                    toMoney(endingDigital),
                  finalizedAt,
                },
              });

            if (result.count !== 1) {
              return null;
            }

            if (!existingShowGain) {
              await tx.fundEntry.create({
                data: {
                  source: "SINGLES",
                  type: "SINGLES_SHOW_GAIN",
                  amount:
                    centsToMoney(
                      singlesFundsChangeCents
                    ),
                  transactionDate:
                    visit.visitDate,
                  showVisitId: visit.id,
                  note:
                    `Singles funds change - ${visit.show.name}`,
                },
              });
            }

            return tx.showVisit.findUnique({
              where: {
                id: visitId,
              },

              include: {
                show: true,
              },
            });
          }
        );

      if (!finalizedVisit) {
        return res.status(409).json({
          error:
            "Show visit is no longer active",
        });
      }

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
// Reports finalized visits for one recurring Show; history includes open visits.
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
      // Preserve the legacy position-average denominator independently of status.
      let visitsWithPositionCount = 0;

      const visitPerformance = [];

      // -----------------------------------------------------
      // CALCULATE EACH VISIT
      // -----------------------------------------------------

      for (const visit of show.visits) {
        const finalized =
          visit.status === "FINALIZED";
        if (finalized) finalizedVisitCount += 1;
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
          finalized &&
          visit.endingSinglesValue !==
            null &&
          visit.endingCash !== null &&
          visit.endingDigital !== null
        ) {
          visitsWithPositionCount += 1;

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

        // Open visits remain in history, but never enter finalized comparisons.
        if (finalized) {
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
        }

        visitPerformance.push({
          visitId:
            visit.id,

          visitDate:
            visit.visitDate,

          status:
            visit.status,

          finalized,
          provisional: !finalized,

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
        finalizedVisitCount > 0
          ? Math.round(
              totalSealedRevenueCents /
                finalizedVisitCount
            )
          : 0;

      const averageGrossProfitPerVisitCents =
        finalizedVisitCount > 0
          ? Math.round(
              totalSealedGrossProfitCents /
                finalizedVisitCount
            )
          : 0;

      const averageUnitsSoldPerVisit =
        finalizedVisitCount > 0
          ? totalSealedUnitsSold /
            finalizedVisitCount
          : 0;

      const averagePositionGrowthCents =
        visitsWithPositionCount > 0
          ? Math.round(
              totalPositionGrowthCents /
                visitsWithPositionCount
            )
          : 0;

      // -----------------------------------------------------
      // BEST VISITS
      // -----------------------------------------------------

      const visitsWithRevenue =
        visitPerformance.filter(
          (visit) =>
            visit.finalized && visit.sealed.revenue > 0
        );

      const visitsWithPosition =
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
        visitsWithPosition.length > 0
          ? visitsWithPosition.reduce(
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
        performanceScope: "FINALIZED",
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

      if (!show.active) {
        return res.status(409).json({
          error:
            "Reactivate the show before adding a visit",
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
        notes != null &&
        typeof notes !== "string"
      ) {
        return res.status(400).json({
          error:
            "Notes must be text",
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

      // A scheduled visit starts as PLANNED. Starting Singles
      // values are captured later when the visit is actually begun.
      const visit =
        await prisma.showVisit.create({
          data: {
            showId,

            visitDate:
              parsedVisitDate,

            status: "PLANNED",

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
