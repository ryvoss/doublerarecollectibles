import { developmentErrorDetails, logServerError } from "../security/logging";
import { Router } from "express";
import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../prisma";
import { createShowProductPerformanceHandler } from "../reporting/showProductPerformance";
import { aggregatePackPerformance, emptyPackPerformanceSummary, loadPackPerformance } from "../reporting/packPerformance";
import { listAvailablePackInventory, planReservationsForSourceBox } from "../services/showPackInventory";
import { persistShowPackFinalizations } from "../services/showPackFinalization";
import { calculateShowPackResult, planShowPackConsumption, ShowPackTrackingError } from "../../shared/showPackTracking";

const router = Router();
class ShowPackRequestError extends Error {}

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
    logServerError(
      "Error retrieving shows:",
      error
    );

    res.status(500).json({
      error:
        "Failed to retrieve shows",

      ...developmentErrorDetails(error),
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
    logServerError(
      "Error retrieving active show visit:",
      error
    );

    res.status(500).json({
      error:
        "Failed to retrieve active show visit",

      ...developmentErrorDetails(error),
    });
  }
});

// ---------------------------------------------------------
// SHOW PACK INVENTORY
// ---------------------------------------------------------

const packSnapshotInclude = {
  sourceBoxProduct: { select: { id: true, itemId: true, name: true, defaultPackPrice: true } },
  allocations: {
    include: { packPool: { select: { id: true, sourceBoxProductId: true, createdAt: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.ShowPackSnapshotInclude;

router.get("/packs/available", async (_req, res) => {
  try {
    res.json(await listAvailablePackInventory(prisma));
  } catch (error) {
    logServerError("Failed to load available Show packs:", error);
    res.status(500).json({ error: "Available pack inventory could not be loaded." });
  }
});

router.get("/visits/:visitId/pack-snapshots", async (req, res) => {
  try {
    const visitId = Number(req.params.visitId);
    if (!Number.isSafeInteger(visitId) || visitId <= 0) return res.status(400).json({ error: "Invalid show visit ID" });
    const visit = await prisma.showVisit.findUnique({ where: { id: visitId }, select: { id: true } });
    if (!visit) return res.status(404).json({ error: "Show visit not found" });
    const snapshots = await prisma.showPackSnapshot.findMany({
      where: { showVisitId: visitId },
      include: packSnapshotInclude,
      orderBy: [{ packDisplayName: "asc" }, { id: "asc" }],
    });
    res.json(snapshots);
  } catch (error) {
    logServerError("Failed to load Show pack snapshots:", error);
    res.status(500).json({ error: "Show pack snapshots could not be loaded." });
  }
});

router.patch("/visits/:visitId/pack-snapshots/:snapshotId/adjustments", async (req, res) => {
  try {
    const visitId = Number(req.params.visitId);
    const snapshotId = Number(req.params.snapshotId);
    const giveaways = req.body?.giveaways;
    const damaged = req.body?.damaged;
    if (!Number.isSafeInteger(visitId) || visitId <= 0 || !Number.isSafeInteger(snapshotId) || snapshotId <= 0 ||
        !Number.isSafeInteger(giveaways) || giveaways < 0 || !Number.isSafeInteger(damaged) || damaged < 0) {
      return res.status(400).json({ error: "Giveaways and damaged packs must be non-negative whole numbers." });
    }
    const snapshot = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(86420932)`;
      const current = await tx.showPackSnapshot.findFirst({
        where: { id: snapshotId, showVisitId: visitId, showVisit: { status: "ACTIVE" }, finalizedAt: null },
      });
      if (!current) throw new ShowPackRequestError("Pack adjustments can only be changed during the active Show.");
      if (giveaways + damaged > current.startingPacks + current.addedPacks) {
        throw new ShowPackRequestError("Giveaways and damaged packs cannot exceed packs allocated to the Show.");
      }
      return tx.showPackSnapshot.update({
        where: { id: snapshotId },
        data: { giveaways, damaged },
        include: packSnapshotInclude,
      });
    });
    res.json(snapshot);
  } catch (error) {
    if (error instanceof ShowPackRequestError) return res.status(409).json({ error: error.message });
    logServerError("Failed to update Show pack adjustments:", error);
    res.status(500).json({ error: "Pack adjustments could not be saved." });
  }
});

router.post("/visits/:visitId/pack-snapshots/:snapshotId/add-existing", async (req, res) => {
  try {
    const visitId = Number(req.params.visitId);
    const snapshotId = Number(req.params.snapshotId);
    const quantity = req.body?.quantity;
    if (!Number.isSafeInteger(visitId) || visitId <= 0 || !Number.isSafeInteger(snapshotId) || snapshotId <= 0 ||
        !Number.isSafeInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ error: "Pack quantity must be a positive whole number." });
    }
    const snapshot = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(86420932)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(86420933, ${snapshotId})`;
      const current = await tx.showPackSnapshot.findFirst({
        where: { id: snapshotId, showVisitId: visitId, showVisit: { status: "ACTIVE" }, finalizedAt: null },
      });
      if (!current) throw new ShowPackRequestError("Packs can only be added during the active Show.");
      const plan = await planReservationsForSourceBox(tx, current.sourceBoxProductId, quantity);
      await tx.showPackPoolAllocation.createMany({
        data: plan.reservations.map(item => ({
          showPackSnapshotId: current.id,
          packPoolId: item.packPoolId,
          type: "ADDED" as const,
          quantityAllocated: item.quantity,
          costBasisAllocated: item.costBasis,
        })),
      });
      return tx.showPackSnapshot.update({
        where: { id: current.id },
        data: { addedPacks: { increment: plan.quantity }, addedCostBasis: { increment: plan.costBasis } },
        include: packSnapshotInclude,
      });
    }, { isolationLevel: "Serializable" });
    res.json(snapshot);
  } catch (error) {
    if (error instanceof ShowPackRequestError || error instanceof ShowPackTrackingError) {
      return res.status(400).json({ error: error.message });
    }
    logServerError("Failed to add existing packs to Show:", error);
    res.status(409).json({ error: "Pack inventory changed while packs were being added. Refresh and try again." });
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
    logServerError(
      "Error creating show:",
      error
    );

    res.status(500).json({
      error:
        "Failed to create show",

      ...developmentErrorDetails(error),
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

      const loadedPackPerformance = visit.status === "FINALIZED"
        ? await loadPackPerformance(prisma, { visitId })
        : null;
      const packPerformance = loadedPackPerformance
        ? { summary: loadedPackPerformance.summary, products: loadedPackPerformance.products }
        : { summary: emptyPackPerformanceSummary(), products: [] };

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

        pack: packPerformance,
      });
    } catch (error) {
      logServerError(
        "Error calculating show visit performance:",
        error
      );

      res.status(500).json({
        error:
          "Failed to calculate show visit performance",

        ...developmentErrorDetails(error),
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
      logServerError(
        "Error retrieving show visit:",
        error
      );

      res.status(500).json({
        error:
          "Failed to retrieve show visit",

        ...developmentErrorDetails(error),
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
        packSnapshots,
      } = req.body;

      const requestedPackSnapshots: Array<{ sourceBoxProductId: number; startingPacks: number; declaredValuePerPack: number }> = [];
      if (packSnapshots !== undefined) {
        if (!Array.isArray(packSnapshots)) return res.status(400).json({ error: "Pack snapshots must be an array." });
        const seenSourceBoxes = new Set<number>();
        for (const item of packSnapshots) {
          const sourceBoxProductId = item?.sourceBoxProductId;
          const startingPacks = item?.startingPacks;
          const declaredValuePerPack = item?.declaredValuePerPack;
          if (!Number.isSafeInteger(sourceBoxProductId) || sourceBoxProductId <= 0 || !Number.isSafeInteger(startingPacks) || startingPacks <= 0 ||
              typeof declaredValuePerPack !== "number" ||
              !Number.isFinite(declaredValuePerPack) || declaredValuePerPack < 0 || declaredValuePerPack > 99999999.99 || seenSourceBoxes.has(sourceBoxProductId)) {
            return res.status(400).json({ error: "Each selected Pack inventory source needs a unique Box, a positive starting quantity, and a valid non-negative declared value." });
          }
          seenSourceBoxes.add(sourceBoxProductId);
          requestedPackSnapshots.push({ sourceBoxProductId, startingPacks, declaredValuePerPack });
        }
      }

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
            // Serialize Show starts so two browser actions cannot both
            // pass the "only one active visit" check at the same time.
            await tx.$executeRaw`
              SELECT pg_advisory_xact_lock(86420931)
            `;

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
                kind:
                  "ACTIVE_CONFLICT" as const,
                activeVisit:
                  currentActiveVisit,
              };
            }

            // Starting Cash and Digital must come directly from the
            // persistent Singles ledger. This prevents a Show snapshot
            // from drifting away from the real money balances.
            const singlesEntries =
              await tx.fundEntry.findMany({
                where: {
                  source: "SINGLES",
                },

                select: {
                  amount: true,
                  location: true,
                },
              });

            let cashCents = 0;
            let digitalCents = 0;
            let unallocatedCents = 0;

            for (
              const entry of
              singlesEntries
            ) {
              const amountCents =
                toCents(entry.amount);

              if (
                entry.location ===
                "CASH"
              ) {
                cashCents +=
                  amountCents;
              } else if (
                entry.location ===
                "DIGITAL"
              ) {
                digitalCents +=
                  amountCents;
              } else {
                unallocatedCents +=
                  amountCents;
              }
            }

            if (
              unallocatedCents !== 0
            ) {
              return {
                kind:
                  "UNALLOCATED_FUNDS" as const,
                cashCents,
                digitalCents,
                unallocatedCents,
              };
            }

            const requestedCashCents =
              toCents(startingCash);

            const requestedDigitalCents =
              toCents(
                startingDigital
              );

            if (
              requestedCashCents !==
                cashCents ||
              requestedDigitalCents !==
                digitalCents
            ) {
              return {
                kind:
                  "FUNDS_MISMATCH" as const,
                cashCents,
                digitalCents,
                unallocatedCents,
              };
            }

            const packPlans = [];
            for (const requested of requestedPackSnapshots) {
              const sourceBoxProduct = await tx.product.findFirst({
                where: { id: requested.sourceBoxProductId, active: true, sellable: true, type: "SEALED", unitType: "BOX" },
                select: { id: true, name: true, packDisplayName: true },
              });
              if (!sourceBoxProduct?.packDisplayName) throw new ShowPackRequestError("A selected Pack inventory source is no longer a configured, active sellable Box.");
              const plan = await planReservationsForSourceBox(tx, requested.sourceBoxProductId, requested.startingPacks);
              packPlans.push({ requested, sourceBoxProduct, plan });
            }

            const startedAt =
              new Date();

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
                    centsToMoney(
                      cashCents
                    ),
                  startingDigital:
                    centsToMoney(
                      digitalCents
                    ),
                  endingSinglesValue:
                    null,
                  endingCash: null,
                  endingDigital: null,
                  finalizedAt: null,
                },
              });

            if (updated.count !== 1) {
              return {
                kind:
                  "STATUS_CHANGED" as const,
              };
            }

            for (const { requested, sourceBoxProduct, plan } of packPlans) {
              const snapshot = await tx.showPackSnapshot.create({
                data: {
                  showVisitId: visitId,
                  sourceBoxProductId: requested.sourceBoxProductId,
                  packDisplayName: sourceBoxProduct.packDisplayName!,
                  startingPacks: plan.quantity,
                  declaredValuePerPack: requested.declaredValuePerPack.toFixed(2),
                  startingCostBasis: plan.costBasis,
                  startingCostPerPack: (Number(plan.costBasis) / plan.quantity).toFixed(6),
                },
              });
              await tx.showPackPoolAllocation.createMany({
                data: plan.reservations.map(item => ({
                  showPackSnapshotId: snapshot.id,
                  packPoolId: item.packPoolId,
                  type: "STARTING" as const,
                  quantityAllocated: item.quantity,
                  costBasisAllocated: item.costBasis,
                })),
              });
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

            if (!activeVisit) {
              return {
                kind:
                  "STATUS_CHANGED" as const,
              };
            }

            return {
              kind:
                "STARTED" as const,
              visit: activeVisit,
            };
          }
        );

      if (
        result.kind ===
        "ACTIVE_CONFLICT"
      ) {
        return res.status(409).json({
          error:
            "Another show visit is already active",
          activeVisit: {
            id:
              result.activeVisit.id,
            showName:
              result.activeVisit.show
                .name,
            visitDate:
              result.activeVisit
                .visitDate,
          },
        });
      }

      if (
        result.kind ===
        "UNALLOCATED_FUNDS"
      ) {
        return res.status(409).json({
          error:
            `Singles funds include ${centsToMoney(
              result.unallocatedCents
            )} that is not assigned to Cash or Digital. Allocate it before starting a Show.`,
          currentSinglesFunds: {
            cash:
              centsToMoney(
                result.cashCents
              ),
            digital:
              centsToMoney(
                result.digitalCents
              ),
            unallocated:
              centsToMoney(
                result.unallocatedCents
              ),
          },
        });
      }

      if (
        result.kind ===
        "FUNDS_MISMATCH"
      ) {
        return res.status(409).json({
          error:
            `Starting Show funds must match the current Singles ledger: ${centsToMoney(
              result.cashCents
            )} Cash and ${centsToMoney(
              result.digitalCents
            )} Digital.`,
          currentSinglesFunds: {
            cash:
              centsToMoney(
                result.cashCents
              ),
            digital:
              centsToMoney(
                result.digitalCents
              ),
            unallocated:
              centsToMoney(
                result.unallocatedCents
              ),
          },
        });
      }

      if (
        result.kind ===
        "STATUS_CHANGED"
      ) {
        return res.status(409).json({
          error:
            "Show visit could not be started because its status changed",
        });
      }

      res.json(result.visit);
    } catch (error) {
      if (error instanceof ShowPackRequestError || error instanceof ShowPackTrackingError) {
        return res.status(400).json({ error: error.message });
      }
      logServerError(
        "Error beginning show visit:",
        error
      );

      res.status(500).json({
        error:
          "Failed to begin show visit",

        ...developmentErrorDetails(error),
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
        packSnapshots,
      } = req.body;

      if (packSnapshots !== undefined && !Array.isArray(packSnapshots)) {
        return res.status(400).json({ error: "Pack ending snapshots must be an array." });
      }
      const submittedPackSnapshots = Array.isArray(packSnapshots) ? packSnapshots : [];

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

      const result =
        await prisma.$transaction(
          async (tx) => {
            // Serialize finalization with other Show finalization attempts.
            // All Show reconciliation entries are created in this same
            // transaction, so either everything succeeds or nothing does.
            await tx.$executeRaw`
              SELECT pg_advisory_xact_lock(86420932)
            `;

            const visit =
              await tx.showVisit.findUnique({
                where: {
                  id: visitId,
                },

                include: {
                  show: true,

                  fundEntries: {
                    where: {
                      source:
                        "SINGLES",
                      type:
                        "SINGLES_SHOW_GAIN",
                    },

                    orderBy: {
                      id: "asc",
                    },
                  },
                  packSnapshots: {
                    include: {
                      sourceBoxProduct: { select: { name: true } },
                      allocations: {
                        include: { packPool: true },
                        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                      },
                      fundEntries: { where: { type: "PACK_SHOW_REVENUE" } },
                    },
                    orderBy: { id: "asc" },
                  },
                },
              });

            if (!visit) {
              return {
                kind:
                  "NOT_FOUND" as const,
              };
            }

            if (
              visit.status ===
                "FINALIZED" ||
              visit.finalizedAt
            ) {
              return {
                kind:
                  "ALREADY_FINALIZED" as const,
              };
            }

            if (
              visit.status !==
              "ACTIVE"
            ) {
              return {
                kind:
                  "NOT_ACTIVE" as const,
              };
            }

            // A successful finalization always creates its Cash and Digital
            // reconciliation rows atomically. If linked gain rows already
            // exist while the visit is still active, stop instead of risking
            // a duplicate or trying to infer what happened previously.
            if (
              visit.fundEntries.length >
              0
            ) {
              return {
                kind:
                  "EXISTING_GAIN" as const,
              };
            }

            if (submittedPackSnapshots.length !== visit.packSnapshots.length) {
              throw new ShowPackRequestError("Provide ending values for every Pack inventory row tracked by this Show.");
            }
            const submittedIds = new Set<number>();
            const packFinalizations = visit.packSnapshots.map(snapshot => {
              const submitted = submittedPackSnapshots.find(item => item?.snapshotId === snapshot.id);
              if (!submitted || submittedIds.has(snapshot.id)) {
                throw new ShowPackRequestError(`Ending Pack values are missing for ${snapshot.packDisplayName}.`);
              }
              submittedIds.add(snapshot.id);
              if (snapshot.finalizedAt || snapshot.fundEntries.length > 0) {
                throw new ShowPackRequestError(`${snapshot.packDisplayName} is already finalized or has Pack revenue entries.`);
              }
              const endingPacks = submitted.endingPacks;
              const actualRevenue = submitted.actualRevenue === null ? null : submitted.actualRevenue;
              const result = calculateShowPackResult({
                startingPacks: snapshot.startingPacks,
                addedPacks: snapshot.addedPacks,
                endingPacks,
                giveaways: snapshot.giveaways,
                damaged: snapshot.damaged,
                declaredValuePerPack: Number(snapshot.declaredValuePerPack),
                actualRevenue,
                actualCashRevenue: actualRevenue === null ? null : submitted.actualCashRevenue,
                actualDigitalRevenue: actualRevenue === null ? null : submitted.actualDigitalRevenue,
              });
              const consumption = planShowPackConsumption(snapshot.allocations.map(allocation => ({
                id: allocation.id,
                packPoolId: allocation.packPoolId,
                createdAt: allocation.packPool.createdAt,
                quantityAllocated: allocation.quantityAllocated,
                costBasisAllocated: Number(allocation.costBasisAllocated),
                quantityConsumed: allocation.quantityConsumed,
                costBasisConsumed: Number(allocation.costBasisConsumed),
              })), { sold: result.packsSold, giveaways: snapshot.giveaways, damaged: snapshot.damaged });
              return { snapshot, submitted, result, consumption };
            });

            const singlesEntries =
              await tx.fundEntry.findMany({
                where: {
                  source: "SINGLES",
                },

                select: {
                  amount: true,
                  location: true,
                },
              });

            let currentCashCents = 0;
            let currentDigitalCents =
              0;
            let unallocatedCents = 0;

            for (
              const entry of
              singlesEntries
            ) {
              const amountCents =
                toCents(entry.amount);

              if (
                entry.location ===
                "CASH"
              ) {
                currentCashCents +=
                  amountCents;
              } else if (
                entry.location ===
                "DIGITAL"
              ) {
                currentDigitalCents +=
                  amountCents;
              } else {
                unallocatedCents +=
                  amountCents;
              }
            }

            if (
              unallocatedCents !== 0
            ) {
              return {
                kind:
                  "UNALLOCATED_FUNDS" as const,
                currentCashCents,
                currentDigitalCents,
                unallocatedCents,
              };
            }

            const endingCashCents =
              toCents(endingCash);

            const endingDigitalCents =
              toCents(
                endingDigital
              );

            // Reconcile each physical location independently. This is the
            // key rule that makes the ending Show snapshot become the new
            // persistent Singles Cash/Digital balance.
            const cashReconciliationCents =
              endingCashCents -
              currentCashCents;

            const digitalReconciliationCents =
              endingDigitalCents -
              currentDigitalCents;

            const finalizedAt =
              new Date();

            const updateResult =
              await tx.showVisit.updateMany({
                where: {
                  id: visitId,
                  status: "ACTIVE",
                  finalizedAt: null,
                },

                data: {
                  status:
                    "FINALIZED",
                  endingSinglesValue:
                    toMoney(
                      endingSinglesValue
                    ),
                  endingCash:
                    centsToMoney(
                      endingCashCents
                    ),
                  endingDigital:
                    centsToMoney(
                      endingDigitalCents
                    ),
                  finalizedAt,
                },
              });

            if (
              updateResult.count !== 1
            ) {
              return {
                kind:
                  "STATUS_CHANGED" as const,
              };
            }

            await persistShowPackFinalizations(
              tx,
              { id: visit.id, visitDate: visit.visitDate, showName: visit.show.name },
              finalizedAt,
              packFinalizations.map(finalization => ({
                snapshotId: finalization.snapshot.id,
                packDisplayName: finalization.snapshot.packDisplayName,
                endingPacks: finalization.submitted.endingPacks,
                packsSold: finalization.result.packsSold,
                declaredSalesValue: finalization.result.declaredSalesValue,
                estimatedCogs: finalization.consumption.estimatedCogs,
                giveawayCostBasis: finalization.consumption.giveawayCostBasis,
                damagedCostBasis: finalization.consumption.damagedCostBasis,
                actualRevenue: finalization.result.actualRevenue,
                actualCashRevenue: finalization.result.actualCashRevenue,
                actualDigitalRevenue: finalization.result.actualDigitalRevenue,
                allocationUpdates: finalization.consumption.allocationUpdates,
                poolUpdates: finalization.consumption.poolUpdates,
              })),
            );

            // Keep two explicit location rows, including $0.00 reconciliations.
            // That makes every finalized Show auditable as a Cash snapshot
            // and a Digital snapshot without changing the total unnecessarily.
            await tx.fundEntry.createMany({
              data: [
                {
                  source:
                    "SINGLES",
                  location:
                    "CASH",
                  type:
                    "SINGLES_SHOW_GAIN",
                  amount:
                    centsToMoney(
                      cashReconciliationCents
                    ),
                  transactionDate:
                    visit.visitDate,
                  showVisitId:
                    visit.id,
                  note:
                    `Singles cash reconciliation - ${visit.show.name}`,
                },
                {
                  source:
                    "SINGLES",
                  location:
                    "DIGITAL",
                  type:
                    "SINGLES_SHOW_GAIN",
                  amount:
                    centsToMoney(
                      digitalReconciliationCents
                    ),
                  transactionDate:
                    visit.visitDate,
                  showVisitId:
                    visit.id,
                  note:
                    `Singles digital reconciliation - ${visit.show.name}`,
                },
              ],
            });

            const finalizedVisit =
              await tx.showVisit.findUnique({
                where: {
                  id: visitId,
                },

                include: {
                  show: true,
                },
              });

            if (!finalizedVisit) {
              return {
                kind:
                  "STATUS_CHANGED" as const,
              };
            }

            return {
              kind:
                "FINALIZED" as const,
              visit:
                finalizedVisit,
              reconciliation: {
                cash:
                  centsToMoney(
                    cashReconciliationCents
                  ),
                digital:
                  centsToMoney(
                    digitalReconciliationCents
                  ),
              },
            };
          }
        );

      if (
        result.kind ===
        "NOT_FOUND"
      ) {
        return res.status(404).json({
          error:
            "Show visit not found",
        });
      }

      if (
        result.kind ===
        "ALREADY_FINALIZED"
      ) {
        return res.status(409).json({
          error:
            "Show visit is already finalized",
        });
      }

      if (
        result.kind ===
        "NOT_ACTIVE"
      ) {
        return res.status(409).json({
          error:
            "Show visit must be active before it can be finalized",
        });
      }

      if (
        result.kind ===
        "EXISTING_GAIN"
      ) {
        return res.status(409).json({
          error:
            "This active visit already has Singles reconciliation entries. Finalization was stopped to prevent duplicate ledger activity.",
        });
      }

      if (
        result.kind ===
        "UNALLOCATED_FUNDS"
      ) {
        return res.status(409).json({
          error:
            `Singles funds include ${centsToMoney(
              result.unallocatedCents
            )} that is not assigned to Cash or Digital. Allocate it before finalizing the Show.`,
          currentSinglesFunds: {
            cash:
              centsToMoney(
                result.currentCashCents
              ),
            digital:
              centsToMoney(
                result.currentDigitalCents
              ),
            unallocated:
              centsToMoney(
                result.unallocatedCents
              ),
          },
        });
      }

      if (
        result.kind ===
        "STATUS_CHANGED"
      ) {
        return res.status(409).json({
          error:
            "Show visit is no longer active",
        });
      }

      res.json({
        ...result.visit,
        reconciliation:
          result.reconciliation,
      });
    } catch (error) {
      if (error instanceof ShowPackRequestError || error instanceof ShowPackTrackingError) {
        return res.status(400).json({ error: error.message });
      }
      logServerError(
        "Error finalizing show visit:",
        error
      );

      res.status(500).json({
        error:
          "Failed to finalize show visit",

        ...developmentErrorDetails(error),
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

      const loadedPackPerformance = await loadPackPerformance(prisma, { showId });
      const packPerformance = {
        summary: loadedPackPerformance.summary,
        products: loadedPackPerformance.products,
      };
      const packPerformanceByVisit = new Map(show.visits.map((visit) => [
        visit.id,
        aggregatePackPerformance(
          loadedPackPerformance.snapshots.filter((snapshot) => snapshot.showVisitId === visit.id),
          loadedPackPerformance.pools,
        ).summary,
      ]));

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

        pack: packPerformance,

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
          visitPerformance.map((visit) => ({
            ...visit,
            pack: packPerformanceByVisit.get(visit.visitId) ?? emptyPackPerformanceSummary(),
          })),
      });
    } catch (error) {
      logServerError(
        "Error calculating recurring show performance:",
        error
      );

      res.status(500).json({
        error:
          "Failed to calculate recurring show performance",

        ...developmentErrorDetails(error),
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
      logServerError(
        "Error retrieving show:",
        error
      );

      res.status(500).json({
        error:
          "Failed to retrieve show",

        ...developmentErrorDetails(error),
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
      logServerError(
        "Error creating show visit:",
        error
      );

      res.status(500).json({
        error:
          "Failed to create show visit",

        ...developmentErrorDetails(error),
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
      logServerError(
        "Error retrieving show visits:",
        error
      );

      res.status(500).json({
        error:
          "Failed to retrieve show visits",

        ...developmentErrorDetails(error),
      });
    }
  }
);

export default router;
