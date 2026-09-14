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
// Returns the current Sealed, Singles, and combined balances.
// Balances are calculated from FundEntry history.
// ---------------------------------------------------------

router.get("/summary", async (_req, res) => {
  try {
    const groupedBalances =
      await prisma.fundEntry.groupBy({
        by: ["source"],
        _sum: {
          amount: true,
        },
      });

    let sealedBalance = 0;
    let singlesBalance = 0;

    for (const group of groupedBalances) {
      const balance =
        Number(group._sum.amount ?? 0);

      if (group.source === "SEALED") {
        sealedBalance = balance;
      }

      if (group.source === "SINGLES") {
        singlesBalance = balance;
      }
    }

    res.json({
      sealedBalance:
        sealedBalance.toFixed(2),

      singlesBalance:
        singlesBalance.toFixed(2),

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
// Personal contributions increase available business funds,
// but they are NOT sales revenue.
// ---------------------------------------------------------

router.post(
  "/contributions",
  async (req, res) => {
    try {
      const {
        source,
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

      const entry =
        await prisma.fundEntry.create({
          data: {
            source,

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

      res.status(201).json(entry);
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
// Positive amount:
// adds money.
//
// Negative amount:
// removes money.
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

      const entry =
        await prisma.fundEntry.create({
          data: {
            source,

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

      res.status(201).json(entry);
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