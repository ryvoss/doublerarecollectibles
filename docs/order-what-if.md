# Order What-If implementation

November 15, 2026. Implemented locally. No database migrations were applied, no business records were changed, and nothing was deployed.

**A. Existing architecture**

Sales What-If lives under Reports > What-If, uses explicit Save with saved-scenario cards and a modal editor, and persists `WhatIfScenario` / `WhatIfScenarioLine`. Its lines require real product IDs and current-inventory/FIFO validation. Extending those lines would blur the distinction between inventory-backed sales planning and free-text purchasing. The new feature uses dedicated purchasing scenario tables while reusing the existing What-If navigation, protected route mount, adminFetch, button/card styles and explicit-save convention.

**B. Navigation/UI**

Reports > What-If now has Sales and Orders tabs. Sales retains its existing functionality. Orders has saved scenario cards with name, supplier, Cost To Door, Expected Revenue, Expected Profit, Expected Margin, and updated date. Cards are sorted newest-updated first. Open / Edit and a compact action menu expose duplicate and delete.

**C. Data model**

`OrderWhatIfScenario`: ID, required name, optional supplier and notes, shipping, tariff, target gross-margin percentage, created/updated timestamps. `OrderWhatIfLine`: ID, scenario ID, description, quantity, total product cost, nullable selling-price override, sort order. Decimal(10,2) stores costs/overrides; Decimal(5,2) stores target percentage (15.00 means 15%). Only input assumptions are persisted. Line deletion cascades from its planning scenario. There are no relations to Products, Orders, inventory, supplier credits or accounting records.

**D. Item input workflow**

The fixed modal follows this order: Order Details; Items Being Purchased; Costs to Your Door; Selling Assumptions; Expected Results. Item cards support free-text description, total purchased quantity, total line product cost, immediate unit-cost display, add and remove. No catalog lookup or Product creation occurs. Array order is preserved; manual reordering is not included.

**E. Cost allocation**

The shared calculator uses BigInt integer cents and exact rational arithmetic. Shipping and tariff are each allocated by product cost using largest remainder, with item order breaking equal-remainder ties. The allocated amounts exactly sum to their respective order totals; zero-cost lines receive no value-weighted additional costs. All-zero product costs with positive additional costs are rejected because proportional allocation is undefined. All-zero costs with zero additional costs are supported. Displayed unit costs are rounded independently; aggregate calculations use exact landed cents.

**F. Margin and pricing**

Target margin is gross margin on selling price, not markup. Recommendation = exact landed unit cost / (1 - target percentage), rounded to the nearest whole dollar, with half-dollar ties rounding up. The calculator rounds directly from the exact fraction, without rounding unit cost first. Custom target percentages from 0.01% through 99.99% are supported, with 15%/20% shortcuts. Actual margin may fall below target after nearest-dollar rounding; the UI explains that distinction.

**G. Overrides**

A null override means use the current recommendation, recalculated after every assumption edit. The price input shows the recommended amount as its placeholder and identifies automatic pricing beneath it. An entered override (including $0) remains fixed when other assumptions change. Clearing the input or Reset to Recommended restores automatic pricing. Selected price appears explicitly in item results.

**H. Results and acceptance**

Expected Revenue is quantity times selected price. Expected Profit is revenue minus total landed cost; actual margin is profit / revenue. Zero revenue has an undefined margin, displayed as Not defined, rather than NaN or Infinity. All line totals reconcile to scenario totals; display formatting also avoids floating-point loss for large monetary totals. No selling fee field is exposed; fees are currently $0.

| Gem 6 example | 15% target | 20% target |
|---|---:|---:|
| Quantity / product cost | 20 / $600 | 20 / $600 |
| Shipping / tariff | $80 / $40 | $80 / $40 |
| Cost To Door / landed unit cost | $720 / $36 | $720 / $36 |
| Recommended / selected price | $42 | $45 |
| Expected Revenue | $840 | $900 |
| Expected Profit | $120 | $180 |
| Actual Margin | 14.285714% | 20% |

**I. Persistence/edit behavior**

Create, explicit Save, Open, Edit/Rename, Delete and Duplicate are implemented. Duplicate opens an unsaved copy and only persists when Save is selected. Save returns server-recomputed results. PATCH atomically replaces planning lines with a nested Prisma write; both update and delete require the saved updatedAt version to prevent stale edits. Closing dirty edits prompts before discarding; navigating away with unsaved changes triggers the browser's standard guard. Saving disables editing to prevent losing changes made while a request is pending.

API, under the existing protected What-If router:

- GET/POST `/api/what-if-scenarios/orders`
- GET/PATCH/DELETE `/api/what-if-scenarios/orders/:scenarioId`

**J. Mobile/responsive behavior**

No results or editor input depends on a horizontally scrolling table. Desktop uses two-column item cards; screens up to 650px stack cards, use a full-height internally scrolling modal, and retain a compact three-value footer plus Save/Close. Inputs have 44px minimum height and 16px mobile text. The dialog traps keyboard focus, restores focus on close, supports Escape, and prevents background scrolling. The layout targets 375-430px widths, but rendered browser verification remains outstanding because the session's browser tool reported no available browsers.

**K. Security and business isolation**

The feature inherits ADMIN authentication, CSRF, Origin checks, no-store and API rate limiting from `/api/what-if-scenarios`. Unknown request fields are rejected, including client-supplied calculated fields or product/order IDs. Text lengths, non-negative cent amounts, positive integer quantities (maximum 1,000,000), 1-100 item lines, custom margin range and override amounts are validated server-side using the shared parser. Production errors remain generic.

The router receives only the orderWhatIfScenario persistence delegate. Route tests use an adapter that throws on access to any other delegate, including Orders, InventoryBatch, Funds, BusinessPositionSnapshot, supplier credits, sales, products and receipt events. No business refresh event is dispatched. The existing snapshot middleware does not capture this route prefix. No public API exposes scenario data.

**L. Tests and validation**

- Prisma validate/generate: passed. Migration SQL was generated from two local schema files, without applying it.
- TypeScript no-emit/project validation: passed.
- Full suite: 165 unit/service/public tests and 43 auth/route tests passed (208 total); one pre-existing opt-in purchasing database suite was skipped.
- New automated coverage: both requested acceptance margins; multi-line allocation weights and reconciliation; deterministic rounding; unit costs; nearest-dollar prices and half ties; custom margins; overrides/reset behavior; zero costs/revenue and losses; large exact totals; strict validation; create/open/edit/rename/duplicate/delete; stale edits; planning-only persistence; authentication, CSRF, Origin and no-store.
- CRUD tests run actual Express handlers with an in-memory planning adapter. Real PostgreSQL migration/persistence smoke testing is still required before deployment; no live database was used for this task.
- Production frontend/server build: passed. Fresh Express test instances exercised the routes. The temporary local UI QA server used only in-memory records and was stopped afterward.
- `git diff --check`: passed.
- `npm audit --omit=dev`: reports 7 existing findings (5 high, 2 moderate), involving body-parser, deepmerge-ts, @prisma/config, prisma, fast-uri, mysql2 and qs. No dependency changes were made.
- Browser/device visual QA: not completed; no browser was available.

**M. Migration/deployment requirements**

Migration: `prisma/migrations/20261115120000_order_what_if/migration.sql`. It creates only the two planning tables, their indexes/FK, and input CHECK constraints. No backfill or mutation of operational data is included.

Before deployment, back up and verify the intended database's live identity, run the migration in an isolated PostgreSQL environment, smoke-test create/edit/reopen/delete, and check the UI at 375px, 430px and desktop widths. Then apply via the existing guarded `npm run db:migrate:deploy`, build, and restart the API. Keep the existing database identity safeguard: a database name in a URL alone does not establish isolation for the local Prisma runtime. No deployment or migration was performed during this implementation.

**N. Intentional extension points**

Descriptions, quantities, supplier, shipping and tariffs remain available as input data for a future explicit Convert to Order workflow. Conversion is not implemented and never creates Products automatically. All projections are centralized in one shared calculator, where a future fee calculation can be added alongside revenue/profit without changing stored landed costs. Fees, reorder controls, autosave and scenario-to-order links are intentionally absent from V1.

Key implementation files: `src/shared/orderWhatIf.ts`, `src/server/routes/orderWhatIfScenarios.ts`, `src/client/pages/OrderWhatIfPage.tsx`, `src/client/pages/OrderWhatIfPage.css`, and the Prisma schema/migration. Tests sit beside the calculator and router and extend the existing auth harness.
