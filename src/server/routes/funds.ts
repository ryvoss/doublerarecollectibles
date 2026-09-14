import express from "express";

import { prisma } from "../prisma";

const router = express.Router();

// ---------------------------------------------------------
// HELPERS
// ---------------------------------------------------------

function parseMoney(value: unknown): number | null {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return null;
  }

  return Math.round(amount * 100) / 100;
}

function isValidFundSource(
  value: unknown
): value is "SEALED" | "SINGLES" {
  return value === "SEALED" || value === "SINGLES";
}

function isValidFundLocation(
  value: unknown
): value is "CASH" | "DIGITAL" {
  return value === "CASH" || value === "DIGITAL";
}

// Singles money is now tracked by where it is held.
// Existing historical rows may still have a null location, so callers
// can see that amount as "unallocated" until it is deliberately reconciled.
function validateLocationForSource(
  source: "SEALED" | "SINGLES",
  location: unknown
): "CASH" | "DIGITAL" | null {
  if (source === "SINGLES") {
    return isValidFundLocation(location)
      ? location
      : null;
  }

  return isValidFundLocation(location)
    ? location
    : null;
}

type FundAllocation = {
  location: "CASH" | "DIGITAL";
  amount: number;
};

// Singles requests may use either:
// 1. one normal amount + location, or
// 2. an allocations array for an atomic Cash/Digital split.
//
// Keeping both shapes lets the existing single-location workflow
// continue working while the UI moves split entries to one request.
function parseSinglesAllocations(
  source: "SEALED" | "SINGLES",
  location: unknown,
  amount: unknown,
  allocations: unknown
): FundAllocation[] | null {
  if (source !== "SINGLES") {
    return [];
  }

  if (Array.isArray(allocations)) {
    if (
      allocations.length < 1 ||
      allocations.length > 2
    ) {
      return null;
    }

    const parsed: FundAllocation[] = [];

    for (const allocation of allocations) {
      if (
        typeof allocation !== "object" ||
        allocation === null
      ) {
        return null;
      }

      const raw = allocation as {
        location?: unknown;
        amount?: unknown;
      };

      if (!isValidFundLocation(raw.location)) {
        return null;
      }

      const parsedAmount =
        parseMoney(raw.amount);

      if (parsedAmount === null) {
        return null;
      }

      parsed.push({
        location: raw.location,
        amount: parsedAmount,
      });
    }

    const locations =
      parsed.map(
        (entry) => entry.location
      );

    if (
      new Set(locations).size !==
      locations.length
    ) {
      return null;
    }

    return parsed;
  }

  if (!isValidFundLocation(location)) {
    return null;
  }

  const parsedAmount =
    parseMoney(amount);

  if (parsedAmount === null) {
    return null;
  }

  return [
    {
      location,
      amount: parsedAmount,
    },
  ];
}

function getDefaultNote(
  type:
    | "OPENING_BALANCE"
    | "PERSONAL_CONTRIBUTION"
    | "MANUAL_ADJUSTMENT",
  source: "SEALED" | "SINGLES"
): string {
  const sourceName =
    source === "SEALED"
      ? "Sealed"
      : "Singles";

  switch (type) {
    case "OPENING_BALANCE":
      return `${sourceName} opening balance`;

    case "PERSONAL_CONTRIBUTION":
      return `Personal contribution to ${sourceName}`;

    case "MANUAL_ADJUSTMENT":
      return `${sourceName} manual adjustment`;
  }
}

// ---------------------------------------------------------
// GET /api/funds/summary
//
// Returns current Sealed, Singles, and combined balances.
// Singles is also broken down by Cash, Digital, and Unallocated.
// ---------------------------------------------------------

router.get("/summary", async (_req, res) => {
  try {
    const groupedBalances =
      await prisma.fundEntry.groupBy({
        by: ["source", "location"],
        _sum: {
          amount: true,
        },
      });

    let sealedBalance = 0;
    let singlesBalance = 0;
    let singlesCashBalance = 0;
    let singlesDigitalBalance = 0;
    let singlesUnallocatedBalance = 0;

    for (const group of groupedBalances) {
      const balance =
        Number(group._sum.amount ?? 0);

      if (group.source === "SEALED") {
        sealedBalance += balance;
        continue;
      }

      singlesBalance += balance;

      if (group.location === "CASH") {
        singlesCashBalance += balance;
      } else if (
        group.location === "DIGITAL"
      ) {
        singlesDigitalBalance += balance;
      } else {
        // Historical Singles entries created before FundLocation
        // was introduced remain visible instead of being guessed.
        singlesUnallocatedBalance += balance;
      }
    }

    res.json({
      sealedBalance:
        sealedBalance.toFixed(2),

      singlesBalance:
        singlesBalance.toFixed(2),

      singlesCashBalance:
        singlesCashBalance.toFixed(2),

      singlesDigitalBalance:
        singlesDigitalBalance.toFixed(2),

      singlesUnallocatedBalance:
        singlesUnallocatedBalance.toFixed(2),

      totalBusinessFunds:
        (
          sealedBalance +
          singlesBalance
        ).toFixed(2),
    });
  } catch (error) {
    console.error(
      "Failed to load funds summary:",
      error
    );

    res.status(500).json({
      error:
        "Failed to load funds summary.",
    });
  }
});

// ---------------------------------------------------------
// GET /api/funds/entries
//
// Returns FundEntry history newest first.
//
// Optional query:
// ?source=SEALED
// ?source=SINGLES
// ---------------------------------------------------------

router.get("/entries", async (req, res) => {
  try {
    const source = req.query.source;

    if (
      source !== undefined &&
      !isValidFundSource(source)
    ) {
      res.status(400).json({
        error:
          "source must be SEALED or SINGLES.",
      });

      return;
    }

    const entries =
      await prisma.fundEntry.findMany({
        where: source
          ? {
              source,
            }
          : undefined,

        include: {
          sale: {
            select: {
              id: true,
              saleNumber: true,
            },
          },

          order: {
            select: {
              id: true,
              orderNumber: true,
            },
          },

          showVisit: {
            select: {
              id: true,
              visitDate: true,

              show: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },

        orderBy: [
          {
            transactionDate: "desc",
          },
          {
            id: "desc",
          },
        ],
      });

    res.json(entries);
  } catch (error) {
    console.error(
      "Failed to load fund entries:",
      error
    );

    res.status(500).json({
      error:
        "Failed to load fund entries.",
    });
  }
});

// ---------------------------------------------------------
// POST /api/funds/opening-balance
//
// Creates an initial balance for either Sealed or Singles.
//
// Only one OPENING_BALANCE is allowed per source.
// ---------------------------------------------------------

router.post(
  "/opening-balance",
  async (req, res) => {
    try {
      const {
        source,
        location,
        amount,
        transactionDate,
        note,
      } = req.body;

      if (!isValidFundSource(source)) {
        res.status(400).json({
          error:
            "source must be SEALED or SINGLES.",
        });

        return;
      }

      const parsedLocation =
        validateLocationForSource(
          source,
          location
        );

      if (
        source === "SINGLES" &&
        parsedLocation === null
      ) {
        res.status(400).json({
          error:
            "Singles funds require location to be CASH or DIGITAL.",
        });

        return;
      }

      const parsedAmount =
        parseMoney(amount);

      if (
        parsedAmount === null ||
        parsedAmount < 0
      ) {
        res.status(400).json({
          error:
            "Opening balance must be zero or greater.",
        });

        return;
      }

      const parsedDate =
        transactionDate
          ? new Date(transactionDate)
          : new Date();

      if (
        Number.isNaN(
          parsedDate.getTime()
        )
      ) {
        res.status(400).json({
          error:
            "transactionDate is invalid.",
        });

        return;
      }

      const existingOpeningBalance =
        await prisma.fundEntry.findFirst({
          where: {
            source,
            type: "OPENING_BALANCE",
          },
        });

      if (existingOpeningBalance) {
        res.status(409).json({
          error:
            `${source} already has an opening balance.`,
        });

        return;
      }

      const entry =
        await prisma.fundEntry.create({
          data: {
            source,
            location:
              parsedLocation,

            type:
              "OPENING_BALANCE",

            amount:
              parsedAmount.toFixed(2),

            transactionDate:
              parsedDate,

            note:
              typeof note === "string" &&
              note.trim()
                ? note.trim()
                : getDefaultNote(
                    "OPENING_BALANCE",
                    source
                  ),
          },
        });

      res.status(201).json(entry);
    } catch (error) {
      console.error(
        "Failed to create opening balance:",
        error
      );

      res.status(500).json({
        error:
          "Failed to create opening balance.",
      });
    }
  }
);

// ---------------------------------------------------------
// POST /api/funds/contributions
//
// Adds personal money to either Sealed or Singles.
//
// Singles may be supplied as one location:
// { source: "SINGLES", location: "CASH", amount: 100 }
//
// Or as one atomic split:
// {
//   source: "SINGLES",
//   allocations: [
//     { location: "CASH", amount: 60 },
//     { location: "DIGITAL", amount: 40 }
//   ]
// }
//
// Personal contributions increase available business funds,
// but they are NOT sales revenue.
// ---------------------------------------------------------

router.post(
  "/contributions",
  async (req, res) => {
    try {
      const {
        source,
        location,
        amount,
        allocations,
        transactionDate,
        note,
      } = req.body;

      if (!isValidFundSource(source)) {
        res.status(400).json({
          error:
            "source must be SEALED or SINGLES.",
        });

        return;
      }

      const parsedDate =
        transactionDate
          ? new Date(transactionDate)
          : new Date();

      if (
        Number.isNaN(
          parsedDate.getTime()
        )
      ) {
        res.status(400).json({
          error:
            "transactionDate is invalid.",
        });

        return;
      }

      if (source === "SEALED") {
        const parsedAmount =
          parseMoney(amount);

        if (
          parsedAmount === null ||
          parsedAmount <= 0
        ) {
          res.status(400).json({
            error:
              "Contribution amount must be greater than zero.",
          });

          return;
        }

        const entry =
          await prisma.fundEntry.create({
            data: {
              source,
              location:
                isValidFundLocation(
                  location
                )
                  ? location
                  : null,

              type:
                "PERSONAL_CONTRIBUTION",

              amount:
                parsedAmount.toFixed(2),

              transactionDate:
                parsedDate,

              note:
                typeof note === "string" &&
                note.trim()
                  ? note.trim()
                  : getDefaultNote(
                      "PERSONAL_CONTRIBUTION",
                      source
                    ),
            },
          });

        res.status(201).json({
          entries: [entry],
        });

        return;
      }

      const parsedAllocations =
        parseSinglesAllocations(
          source,
          location,
          amount,
          allocations
        );

      if (!parsedAllocations) {
        res.status(400).json({
          error:
            "Singles contributions require CASH/DIGITAL location data.",
        });

        return;
      }

      if (
        parsedAllocations.some(
          (entry) => entry.amount <= 0
        )
      ) {
        res.status(400).json({
          error:
            "Each Singles contribution amount must be greater than zero.",
        });

        return;
      }

      const entries =
        await prisma.$transaction(
          async (tx) => {
            const created = [];

            for (
              const allocation of
              parsedAllocations
            ) {
              created.push(
                await tx.fundEntry.create({
                  data: {
                    source: "SINGLES",
                    location:
                      allocation.location,

                    type:
                      "PERSONAL_CONTRIBUTION",

                    amount:
                      allocation.amount.toFixed(
                        2
                      ),

                    transactionDate:
                      parsedDate,

                    note:
                      typeof note ===
                        "string" &&
                      note.trim()
                        ? note.trim()
                        : getDefaultNote(
                            "PERSONAL_CONTRIBUTION",
                            "SINGLES"
                          ),
                  },
                })
              );
            }

            return created;
          }
        );

      res.status(201).json({
        entries,
      });
    } catch (error) {
      console.error(
        "Failed to create personal contribution:",
        error
      );

      res.status(500).json({
        error:
          "Failed to create personal contribution.",
      });
    }
  }
);

// ---------------------------------------------------------
// POST /api/funds/allocate-unallocated-singles
//
// Assigns legacy Singles FundEntry rows that were created before
// Cash/Digital tracking existed.
//
// This is a reclassification only:
// - Singles total does not change.
// - No new contribution or adjustment is created.
// - Existing legacy rows receive a location.
// - A legacy row is split only when the requested Cash/Digital
//   allocation crosses through that row.
//
// For safety, this automatic migration only handles positive
// unallocated legacy rows. If older negative corrections exist,
// they should be reviewed manually instead of guessed.
// ---------------------------------------------------------

router.post(
  "/allocate-unallocated-singles",
  async (req, res) => {
    try {
      const { allocations } = req.body;

      if (
        !Array.isArray(allocations) ||
        allocations.length < 1 ||
        allocations.length > 2
      ) {
        res.status(400).json({
          error:
            "Provide one or two Cash/Digital allocations.",
        });

        return;
      }

      const parsedAllocations: FundAllocation[] =
        [];

      for (const allocation of allocations) {
        if (
          typeof allocation !== "object" ||
          allocation === null
        ) {
          res.status(400).json({
            error:
              "Each allocation must include a location and amount.",
          });

          return;
        }

        const raw = allocation as {
          location?: unknown;
          amount?: unknown;
        };

        if (
          !isValidFundLocation(
            raw.location
          )
        ) {
          res.status(400).json({
            error:
              "Allocation location must be CASH or DIGITAL.",
          });

          return;
        }

        const parsedAmount =
          parseMoney(raw.amount);

        if (
          parsedAmount === null ||
          parsedAmount <= 0
        ) {
          res.status(400).json({
            error:
              "Each allocation amount must be greater than zero.",
          });

          return;
        }

        parsedAllocations.push({
          location: raw.location,
          amount: parsedAmount,
        });
      }

      const locations =
        parsedAllocations.map(
          (allocation) =>
            allocation.location
        );

      if (
        new Set(locations).size !==
        locations.length
      ) {
        res.status(400).json({
          error:
            "Cash and Digital may each appear only once.",
        });

        return;
      }

      const result =
        await prisma.$transaction(
          async (tx) => {
            // Lock this operation against another allocation request.
            // PostgreSQL holds the advisory lock until this transaction ends.
            await tx.$executeRaw`
              SELECT pg_advisory_xact_lock(91374261)
            `;

            const legacyEntries =
              await tx.fundEntry.findMany({
                where: {
                  source: "SINGLES",
                  location: null,
                },

                orderBy: [
                  {
                    transactionDate:
                      "asc",
                  },
                  {
                    id: "asc",
                  },
                ],
              });

            if (
              legacyEntries.length === 0
            ) {
              throw new Error(
                "NO_UNALLOCATED_FUNDS"
              );
            }

            const legacyRows =
              legacyEntries.map(
                (entry) => ({
                  entry,
                  cents: Math.round(
                    Number(entry.amount) *
                      100
                  ),
                })
              );

            // We deliberately do not guess how old negative adjustments
            // should be divided between Cash and Digital.
            if (
              legacyRows.some(
                ({ cents }) =>
                  cents <= 0
              )
            ) {
              throw new Error(
                "UNSAFE_LEGACY_ACTIVITY"
              );
            }

            const unallocatedCents =
              legacyRows.reduce(
                (total, row) =>
                  total + row.cents,
                0
              );

            const allocationCents =
              parsedAllocations.map(
                (allocation) => ({
                  location:
                    allocation.location,
                  cents: Math.round(
                    allocation.amount *
                      100
                  ),
                })
              );

            const requestedCents =
              allocationCents.reduce(
                (total, allocation) =>
                  total +
                  allocation.cents,
                0
              );

            if (
              requestedCents !==
              unallocatedCents
            ) {
              const error =
                new Error(
                  "ALLOCATION_TOTAL_MISMATCH"
                ) as Error & {
                  unallocatedCents?: number;
                };

              error.unallocatedCents =
                unallocatedCents;

              throw error;
            }

            let allocationIndex = 0;
            let remainingAllocationCents =
              allocationCents[0].cents;

            const updatedEntryIds: number[] =
              [];
            const createdEntryIds: number[] =
              [];

            for (
              const { entry, cents }
              of legacyRows
            ) {
              let remainingEntryCents =
                cents;
              let firstChunk = true;

              while (
                remainingEntryCents > 0
              ) {
                const currentAllocation =
                  allocationCents[
                    allocationIndex
                  ];

                if (!currentAllocation) {
                  throw new Error(
                    "ALLOCATION_DISTRIBUTION_FAILED"
                  );
                }

                const chunkCents =
                  Math.min(
                    remainingEntryCents,
                    remainingAllocationCents
                  );

                const chunkAmount =
                  (
                    chunkCents / 100
                  ).toFixed(2);

                if (firstChunk) {
                  const updated =
                    await tx.fundEntry.update({
                      where: {
                        id: entry.id,
                      },

                      data: {
                        location:
                          currentAllocation.location,
                        amount:
                          chunkAmount,
                      },
                    });

                  updatedEntryIds.push(
                    updated.id
                  );

                  firstChunk = false;
                } else {
                  const created =
                    await tx.fundEntry.create({
                      data: {
                        source:
                          "SINGLES",
                        location:
                          currentAllocation.location,
                        type:
                          entry.type,
                        amount:
                          chunkAmount,
                        transactionDate:
                          entry.transactionDate,
                        saleId:
                          entry.saleId,
                        orderId:
                          entry.orderId,
                        showVisitId:
                          entry.showVisitId,
                        note:
                          entry.note,
                      },
                    });

                  createdEntryIds.push(
                    created.id
                  );
                }

                remainingEntryCents -=
                  chunkCents;

                remainingAllocationCents -=
                  chunkCents;

                if (
                  remainingAllocationCents ===
                  0
                ) {
                  allocationIndex += 1;

                  if (
                    allocationIndex <
                    allocationCents.length
                  ) {
                    remainingAllocationCents =
                      allocationCents[
                        allocationIndex
                      ].cents;
                  }
                }
              }
            }

            if (
              allocationIndex !==
              allocationCents.length
            ) {
              throw new Error(
                "ALLOCATION_DISTRIBUTION_FAILED"
              );
            }

            return {
              allocatedAmount:
                (
                  requestedCents /
                  100
                ).toFixed(2),

              allocations:
                allocationCents.map(
                  (allocation) => ({
                    location:
                      allocation.location,
                    amount:
                      (
                        allocation.cents /
                        100
                      ).toFixed(2),
                  })
                ),

              updatedEntryIds,
              createdEntryIds,
            };
          }
        );

      res.json(result);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message ===
          "NO_UNALLOCATED_FUNDS"
      ) {
        res.status(409).json({
          error:
            "There are no unallocated Singles funds to assign.",
        });

        return;
      }

      if (
        error instanceof Error &&
        error.message ===
          "UNSAFE_LEGACY_ACTIVITY"
      ) {
        res.status(409).json({
          error:
            "Unallocated Singles history contains a zero or negative entry. Automatic allocation was stopped so historical activity is not guessed.",
        });

        return;
      }

      if (
        error instanceof Error &&
        error.message ===
          "ALLOCATION_TOTAL_MISMATCH"
      ) {
        const typedError =
          error as Error & {
            unallocatedCents?: number;
          };

        res.status(409).json({
          error:
            `Cash plus Digital must equal the current unallocated Singles balance of ${(
              (typedError.unallocatedCents ??
                0) / 100
            ).toFixed(2)}.`,
        });

        return;
      }

      console.error(
        "Failed to allocate legacy Singles funds:",
        error
      );

      res.status(500).json({
        error:
          "Failed to allocate unallocated Singles funds.",
      });
    }
  }
);

// ---------------------------------------------------------
// POST /api/funds/singles-show-gains
//
// Records the manually confirmed increase in Singles funds
// from one specific Show Visit.
//
// This does NOT create individual Singles sales.
// It simply records the amount of money attributed to Singles
// for the show.
//
// Only one Singles Show Gain is allowed per Show Visit.
// ---------------------------------------------------------

router.post(
  "/singles-show-gains",
  async (req, res) => {
    try {
      const {
        showVisitId,
        amount,
        location,
        transactionDate,
        note,
      } = req.body;

      const parsedShowVisitId =
        Number(showVisitId);

      if (
        !Number.isSafeInteger(
          parsedShowVisitId
        ) ||
        parsedShowVisitId <= 0
      ) {
        res.status(400).json({
          error:
            "showVisitId must be a valid positive integer.",
        });

        return;
      }

      const parsedAmount =
        parseMoney(amount);

      if (
        parsedAmount === null ||
        parsedAmount <= 0
      ) {
        res.status(400).json({
          error:
            "Singles show gain must be greater than zero.",
        });

        return;
      }

      if (!isValidFundLocation(location)) {
        res.status(400).json({
          error:
            "Singles show gain location must be CASH or DIGITAL.",
        });

        return;
      }

      // Load the Show Visit so we know the gain belongs
      // to a real show occurrence.
      const showVisit =
        await prisma.showVisit.findUnique({
          where: {
            id: parsedShowVisitId,
          },

          include: {
            show: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });

      if (!showVisit) {
        res.status(404).json({
          error:
            "Show visit not found.",
        });

        return;
      }

      // A Show Visit should only contribute one Singles gain.
      // This protects against accidentally clicking Save twice
      // and increasing the Singles balance twice.
      const existingGain =
        await prisma.fundEntry.findFirst({
          where: {
            showVisitId:
              parsedShowVisitId,

            source: "SINGLES",

            type:
              "SINGLES_SHOW_GAIN",
          },
        });

      if (existingGain) {
        res.status(409).json({
          error:
            "A Singles gain has already been recorded for this show visit.",
        });

        return;
      }

      // Normally the financial activity belongs to the date
      // of the Show Visit itself. A transactionDate can still
      // be provided explicitly if needed.
      const parsedDate =
        transactionDate
          ? new Date(transactionDate)
          : showVisit.visitDate;

      if (
        Number.isNaN(
          parsedDate.getTime()
        )
      ) {
        res.status(400).json({
          error:
            "transactionDate is invalid.",
        });

        return;
      }

      const entry =
        await prisma.fundEntry.create({
          data: {
            source: "SINGLES",
            location,

            type:
              "SINGLES_SHOW_GAIN",

            amount:
              parsedAmount.toFixed(2),

            transactionDate:
              parsedDate,

            showVisitId:
              parsedShowVisitId,

            note:
              typeof note === "string" &&
              note.trim()
                ? note.trim()
                : `Singles gain - ${showVisit.show.name}`,
          },

          include: {
            showVisit: {
              include: {
                show: true,
              },
            },
          },
        });

      res.status(201).json(entry);
    } catch (error) {
      console.error(
        "Failed to record Singles show gain:",
        error
      );

      res.status(500).json({
        error:
          "Failed to record Singles show gain.",
      });
    }
  }
);

// ---------------------------------------------------------
// POST /api/funds/adjustments
//
// Creates a manual signed correction.
//
// Singles adjustments may also be supplied as an atomic
// Cash/Digital allocations array.
//
// Positive amount adds money.
// Negative amount removes money.
//
// A note is required because adjustments should explain
// why the recorded balance changed.
// ---------------------------------------------------------

router.post(
  "/adjustments",
  async (req, res) => {
    try {
      const {
        source,
        location,
        amount,
        allocations,
        transactionDate,
        note,
      } = req.body;

      if (!isValidFundSource(source)) {
        res.status(400).json({
          error:
            "source must be SEALED or SINGLES.",
        });

        return;
      }

      if (
        typeof note !== "string" ||
        !note.trim()
      ) {
        res.status(400).json({
          error:
            "A note explaining the adjustment is required.",
        });

        return;
      }

      const parsedDate =
        transactionDate
          ? new Date(transactionDate)
          : new Date();

      if (
        Number.isNaN(
          parsedDate.getTime()
        )
      ) {
        res.status(400).json({
          error:
            "transactionDate is invalid.",
        });

        return;
      }

      if (source === "SEALED") {
        const parsedAmount =
          parseMoney(amount);

        if (
          parsedAmount === null ||
          parsedAmount === 0
        ) {
          res.status(400).json({
            error:
              "Adjustment amount must be a non-zero number.",
          });

          return;
        }

        const entry =
          await prisma.fundEntry.create({
            data: {
              source,
              location:
                isValidFundLocation(
                  location
                )
                  ? location
                  : null,

              type:
                "MANUAL_ADJUSTMENT",

              amount:
                parsedAmount.toFixed(2),

              transactionDate:
                parsedDate,

              note:
                note.trim(),
            },
          });

        res.status(201).json({
          entries: [entry],
        });

        return;
      }

      const parsedAllocations =
        parseSinglesAllocations(
          source,
          location,
          amount,
          allocations
        );

      if (!parsedAllocations) {
        res.status(400).json({
          error:
            "Singles adjustments require CASH/DIGITAL location data.",
        });

        return;
      }

      if (
        parsedAllocations.some(
          (entry) => entry.amount === 0
        )
      ) {
        res.status(400).json({
          error:
            "Each Singles adjustment amount must be non-zero.",
        });

        return;
      }

      const entries =
        await prisma.$transaction(
          async (tx) => {
            const created = [];

            for (
              const allocation of
              parsedAllocations
            ) {
              created.push(
                await tx.fundEntry.create({
                  data: {
                    source: "SINGLES",
                    location:
                      allocation.location,

                    type:
                      "MANUAL_ADJUSTMENT",

                    amount:
                      allocation.amount.toFixed(
                        2
                      ),

                    transactionDate:
                      parsedDate,

                    note:
                      note.trim(),
                  },
                })
              );
            }

            return created;
          }
        );

      res.status(201).json({
        entries,
      });
    } catch (error) {
      console.error(
        "Failed to create fund adjustment:",
        error
      );

      res.status(500).json({
        error:
          "Failed to create fund adjustment.",
      });
    }
  }
);

export default router;