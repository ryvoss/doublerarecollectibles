# Supplier credits and finalized-order amendments

Implementation handoff, November 10, 2026. No production deployment was performed. Read the local database incident in section M before running migrations.

**A. Existing model**

Orders had no supplier identity. Draft finalization allocated combined additional costs by product value, created one batch per line, and posted the full total as one negative SEALED `ORDER_PURCHASE`. Receiving is independent of ownership. FIFO sales use stored batch costs and optimistic batch versions. Pack conversions retain source allocations. Financial corrections already have append-only records and compensating FundEntries.

**B. Data model**

`Order.supplierName` is an optional normalized supplier name. An admin can assign it once, including on an existing finalized order. Supplier credits require a supplier; matching uses trimmed, whitespace-normalized, lowercase identity. This V1 does not introduce a vendor directory or rename/merge workflow.

New models: `OrderAmendment`, `OrderAmendmentChange`, `SupplierCredit`, and `SupplierCreditApplication`. Amendment records preserve reason, notes, settlement, before/after quantities, product/landed costs, and order-level additional costs. Applications record source credit, target order, amount, and date. `FundEntry.orderAmendmentId` links cash refunds; `ORDER_REFUND` distinguishes them from sales. Business Position snapshots gain `supplierCreditBalance`.

**C. Amendment workflow**

Orders ? open finalized order ? Amend Order. Enter cancellation quantities in purchased units; received/consumed quantities are explicitly labeled as sellable units. Enter a reason, optional notes, and Supplier Credit or Cash Refund. Preview shows server-calculated settlement and remaining cost. Confirm commits all changes atomically.

Only unreceived quantities can be canceled. An affected batch with any sales, conversion, SaleAllocation, or PackPoolSourceAllocation is blocked, including consumption through Show pack workflows. Untouched lines on an otherwise consumed order can still be amended. All lines canceled produces a derived Canceled fulfillment status; partial cancellation retains the receiving status and adds Canceled Items/Amended indicators.

**D. Supplier-credit workflow**

The Orders page has a Supplier Credits panel showing original/remaining amounts, supplier, source order, created date, applications, and status. Assign the same supplier to a draft target order, then Review & Finalize ? Funding. Enter an amount against each available credit. Partial use and multiple source credits are supported. Server validation rejects duplicates, non-cent amounts, wrong suppliers, insufficient balances, and funding above the order total.

Credit is applied only during draft finalization. This V1 does not retrofit credit funding onto already-finalized orders, cash out an existing unused credit, split amendment settlement between cash/credit, substitute products, or reverse consumed inventory. Correct Order remains distinct and is blocked after amendment or credit funding to avoid an ambiguous financial correction.

**E?F. Acceptance results**

The isolated database test exercises the actual order routes, amendment service, credit ledger, receiving, and sale routes:

| Value | Order 5 | Order 6 |
|---|---:|---:|
| Original/full order cost | $2,280 | $3,380 |
| Remaining inventory cost after amendment | $1,250 | $3,380 |
| Credit created | $1,030 | $0 |
| Credit applied | $0 | $1,030 |
| Actual cash outflow | $2,280 | $2,350 |

Combined inventory acquired cost and cash outflow are both $4,630; remaining source credit is $0. No refund or revenue entry is created for the supplier-credit amendment. The original Order 5 FundEntry is compared before/after and remains identical. A subsequent sale of all Order 6 inventory produces $3,380 COGS.

**G. Inventory and landed cost**

Finalization continues to allocate the FULL product cost plus shipping, tariffs, other costs and signed adjustment. Credit is excluded from that calculation. Cancellation releases the canceled purchased quantity's proportional share of the affected line's stored product and landed costs, rounded to cents. Unaffected batches keep their cost basis. Remaining line unit costs derive from remaining cent-exact cost and quantity, with existing six-decimal precision. Order-level additional costs are reduced proportionally; rounding residue is retained in adjustment so order totals exactly reconcile.

This is a proportional landed-value cancellation. If the supplier retains shipping or offers a different settlement, do not confirm a mismatching preview: that agreement needs a more advanced amendment workflow. Canceled lines/batches remain as zero-quantity historical records, with zero residual value on full cancellation. No historical allocations or COGS are rewritten.

**H. Funds**

Original purchase entries are never updated/deleted. Supplier-credit creation posts no FundEntry. Cash settlement posts a new positive SEALED ORDER_REFUND linked to the amendment. Credit-funded finalization posts one ORDER_PURCHASE for the cash remainder, including zero for fully credit-funded orders. Credit applications are not expenses; credit creation is not revenue. Order detail shows original funding separately from current inventory cost.

**I. Business Health/accounting**

Current Business Value includes outstanding supplier credit in addition to Funds, owned sealed inventory cost, and the latest Singles valuation. The existing incomplete-Singles-valuation behavior remains. Current balances are read in one Repeatable Read transaction so a credit/inventory transfer is not observed halfway through. Reports Overview uses the server's current business value; Business Health exposes a separate Supplier Credits metric. Daily snapshots include credit balance; pre-feature snapshots default to zero. Tests assert unchanged business value across credit creation and application.

**J. Public inventory**

The existing public contract derives Coming Soon from purchased minus received units. Reducing those purchased quantities removes canceled inbound stock automatically. The acceptance test verifies fully canceled products become SOLD_OUT rather than COMING_SOON. Supplier names, credits, and applications are not added to public responses.

**K. Audit and concurrency**

- Amendments run in Serializable transactions, acquire the receiving/correction order advisory lock and sorted product locks, and reload inventory before committing.
- Preview tokens hash the live order, batch/consumption state, and proposed result; stale previews and replayed amendments are rejected.
- Draft finalization uses its existing optimistic order-row gate. The UI also sends the reviewed order version.
- Credit application uses sorted credit IDs, conditional balance decrements, an immutable application record, and the same transaction as inventory/Funds/finalization. A competing order cannot overspend the balance.
- SQL checks enforce credit bounds, positive applications, and valid amendment settlements/quantities. Database triggers prevent update/delete of amendment history and applications, and prevent changing/deleting credit source facts.
- Existing sales' batch version guards and amendment serialization protect downstream cost changes. Show consumption is detected through batch counters and source allocations.
- New routes live under the existing ADMIN, CSRF, Origin, no-store and safe-error boundaries. Security tests exercise unauthenticated requests, missing CSRF and hostile Origin.

**L. Validation**

- Prisma validate and generate: passed.
- TypeScript (`npx tsc --noEmit` and project build): passed.
- Full test suite: 157 unit/service/public tests passed; the opt-in database suite is skipped in the normal run. All 40 auth/route tests passed.
- Isolated database suite: acceptance, partial/full cancellation, receiving floor, stale previews, repeat rejection, cash refunds, additional landed costs, wrong supplier/overspend validation, partial credit use, concurrent credit consumption/rollback, immutable history, public availability, Business Value and future COGS passed.
- Two true concurrent Serializable tests (amendment versus receiving and amendment versus sale) are included but skipped on the local Prisma emulator. The emulator returned PostgreSQL error 25001 when simultaneous Serializable transactions were attempted. Run `npm run test:purchasing` against a real isolated PostgreSQL TEST database before deployment to validate these races.
- Production frontend/server build: passed. Routes were exercised in fresh Express test processes; no pre-existing API process was running to restart.
- `git diff --check`: passed.
- `npm audit --omit=dev`: failed with 7 existing dependency findings (5 high, 2 moderate): body-parser, deepmerge-ts, @prisma/config, prisma, fast-uri, mysql2, qs. Dependencies were not changed as part of this feature.
- Browser visual QA has not been performed.

**M. Migration and deployment requirements; local database incident**

New migration: `20261110120000_supplier_credits`. It is additive and contains CHECK constraints and history-protection triggers. Back up the intended database, verify its LIVE identity, apply migrations, generate/build, restart the API, then verify the admin workflow. Do not run application code against an unmigrated database. `npm run db:migrate:deploy` now first runs `scripts/verify-database-identity.mjs`; it refuses if `current_database()` differs from the configured name. `npm run db:verify` performs that read-only check separately.

During development, the first migration attempt targeted the configured `double_rare_collectibles_test` URL. The existing Prisma local runtime actually aliases that connection to `template1`. Prisma migration deploy applied seven pending migrations there before the integration test's live-identity assertion detected the mismatch. They were:

- 20261012000000_add_admin_auth
- 20261013000000_add_order_receiving
- 20261013120000_add_finalized_order_corrections
- 20261014120000_add_public_price_drops
- 20261014160000_add_storefront_manager
- 20261019120000_storefront_editorial
- 20261110120000_supplier_credits

The receiving migration renames the old received column to purchased, adds received, and backfills received to the old quantity; it also backfills snapshot on-hand/inbound cost fields. A read-only inspection found two orders and ten inventory batches in this local database, and no ORD-0005/ORD-0006. No purchasing test fixtures, amendments, supplier credits, or financial ledger changes were made there. These local schema/backfill changes have NOT been reversed; no remote production deployment was performed.

All business mutation tests were subsequently run on a separate, initially empty named Prisma QA instance, verified with its own database marker before migrations. The emulator-specific test mode is confined to the integration test and requires the localhost QA port plus that marker; it does not relax application startup or production identity checks. The default local runtime and the disposable QA runtime were stopped after verification, restoring the initial stopped state.

Use real PostgreSQL for the normal `.env.test` workflow: `APP_ENV=TEST`, database `double_rare_collectibles_test`, live identity matching that name. Do not point `.env.test` at the default Prisma runtime and assume the URL creates isolation.

**N. Admin steps for the real Order 5 and Order 6 after deployment**

The available local database does not contain those records. These steps require Order 5's canceled lines to be unreceived/unconsumed and Order 6 to still be a draft:

1. Open Orders ? ORD-0005. Assign the supplier's exact consistent name if it is missing.
2. Check the original total/payment is $2,280. Verify Item 2 and Item 3 have no received or consumed quantity. Do not reclassify genuinely received stock simply to bypass amendment protection.
3. Select Amend Order. Cancel 20 purchased units of Item 2 and 20 of Item 3. Leave Item 1 unchanged. Reason: supplier unable to fulfill. Settlement: Supplier Credit.
4. Preview must show $1,030 supplier credit, $1,250 remaining inventory cost, and $0 Funds change. Confirm only if those amounts match the supplier agreement. Check amendment history and the Supplier Credits panel afterward.
5. Open draft ORD-0006 and assign the same supplier. Enter/verify Item 4 ?20, Item 5 ?20, Item 6 ?12, Item 7 ?10 and Item 8 ?10, with genuine product/additional costs totaling $3,380. Remove a -$1,030 adjustment if it was entered solely to represent credit; retain any genuine separate discount.
6. Review & Finalize ? Funding. Apply $1,030 from the Order 5 credit. Confirm the display reads Order/Inventory Cost $3,380, Credit $1,030, Cash Required $2,350. Finalize.
7. Verify original Order 5 outflow remains -$2,280, Order 6 outflow is -$2,350, source credit remaining is $0, and combined inventory cost is $4,630 before any consumption. Receive only the physically delivered stock.

If Order 6 is already finalized, this V1 cannot safely convert its historical funding using those steps. Do not delete/recreate the order, edit its original FundEntry, issue an artificial cash refund, or use a discount to consume credit. Its actual existing costs, payment entry, receiving and consumption must first be inspected for a separate audited funding/cost reconciliation. Likewise, an Order 5 line that has actually been received or consumed is intentionally blocked from simple cancellation.
