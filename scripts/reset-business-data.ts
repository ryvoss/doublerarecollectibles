import { prisma } from "../src/server/prisma";
import { assertDatabaseEnvironment, databaseName } from "../src/server/environment";

// ---------------------------------------------------------
// BUSINESS DATA RESET
// ---------------------------------------------------------
//
// This script intentionally deletes ALL business data while
// preserving:
//
// - Database structure
// - Prisma migrations
// - Tables
// - Application code
//
// It requires an explicit confirmation argument so that it
// cannot be run accidentally later when the database contains
// real business information.
//
// Dry run:
//   npx tsx scripts/reset-business-data.ts
//
// Actual reset:
//   npx tsx scripts/reset-business-data.ts --confirm-reset
//
// ---------------------------------------------------------

const CONFIRMATION_ARGUMENT = "--confirm-reset";

async function showCurrentRecordCounts() {
  const [
    products,
    orders,
    orderLines,
    inventoryBatches,
    sales,
    saleLines,
    saleAllocations,
    shows,
    showVisits,
    fundEntries,
  ] = await Promise.all([
    prisma.product.count(),
    prisma.order.count(),
    prisma.orderLine.count(),
    prisma.inventoryBatch.count(),
    prisma.sale.count(),
    prisma.saleLine.count(),
    prisma.saleAllocation.count(),
    prisma.show.count(),
    prisma.showVisit.count(),
    prisma.fundEntry.count(),
  ]);

  console.log("");
  console.log("Current database contents:");
  console.log("----------------------------------------");
  console.log(`Products:           ${products}`);
  console.log(`Orders:             ${orders}`);
  console.log(`Order Lines:        ${orderLines}`);
  console.log(`Inventory Batches:  ${inventoryBatches}`);
  console.log(`Sales:              ${sales}`);
  console.log(`Sale Lines:         ${saleLines}`);
  console.log(`Sale Allocations:   ${saleAllocations}`);
  console.log(`Shows:              ${shows}`);
  console.log(`Show Visits:        ${showVisits}`);
  console.log(`Fund Entries:       ${fundEntries}`);
  console.log("----------------------------------------");
  console.log("");

  return {
    products,
    orders,
    orderLines,
    inventoryBatches,
    sales,
    saleLines,
    saleAllocations,
    shows,
    showVisits,
    fundEntries,
  };
}

async function main() {
  if (assertDatabaseEnvironment() !== "REAL") throw new Error("The legacy business-data reset is REAL-only and refuses TEST.");
  console.log("");
  console.log("========================================");
  console.log(" DOUBLE RARE COLLECTIBLES");
  console.log(" BUSINESS DATA RESET");
  console.log("========================================");

  await showCurrentRecordCounts();

  const confirmed =
    process.argv.includes(CONFIRMATION_ARGUMENT);

  // Running the script without the confirmation argument is
  // intentionally only a preview. Nothing gets deleted.
  if (!confirmed) {
    console.log("DRY RUN ONLY.");
    console.log("");
    console.log(
      "No information has been deleted."
    );
    console.log("");
    console.log(
      "To permanently delete ALL business data, run:"
    );
    console.log("");
    console.log(
      "npx tsx scripts/reset-business-data.ts --confirm-reset"
    );
    console.log("");
    return;
  }

  const connected = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  if (connected[0]?.name !== databaseName(process.env.DIRECT_DATABASE_URL)) throw new Error("Database URL and actual connected database differ; refusing destructive reset.");

  console.log(
    "Confirmation received. Clearing business data..."
  );
  console.log("");

  // TRUNCATE is ideal for our clean-test reset because it:
  //
  // 1. Removes every row from the listed business tables.
  // 2. RESTART IDENTITY resets auto-increment IDs back to 1.
  // 3. CASCADE safely handles the foreign-key relationships
  //    between these tables.
  //
  // IMPORTANT:
  // We deliberately list ONLY application/business tables.
  // Prisma's migration history is NOT touched.

  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "SaleAllocation",
      "SaleLine",
      "Sale",
      "FundEntry",
      "InventoryBatch",
      "OrderLine",
      "Order",
      "ShowVisit",
      "Show",
      "Product"
    RESTART IDENTITY CASCADE;
  `);

  console.log("Business data cleared successfully.");
  console.log("");

  console.log("Verifying empty database...");

  const remaining =
    await showCurrentRecordCounts();

  const totalRemaining =
    Object.values(remaining).reduce(
      (total, count) => total + count,
      0
    );

  if (totalRemaining !== 0) {
    throw new Error(
      `Reset finished, but ${totalRemaining} business records still remain.`
    );
  }

  console.log("========================================");
  console.log(" RESET COMPLETE");
  console.log("========================================");
  console.log("");
  console.log(
    "All business tables are empty and IDs have been reset."
  );
  console.log(
    "Schema and Prisma migrations were preserved."
  );
  console.log("");
}

main()
  .catch((error) => {
    console.error("");
    console.error("RESET FAILED");
    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
