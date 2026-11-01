# Open Show sale corrections

Implemented locally on November 1, 2026. No deployment, migration, or business-data writes were performed.

| Area | Behavior |
| --- | --- |
| A. Existing accounting | A Show is a recurring location; ShowVisit is its dated occurrence. Only an ACTIVE visit with no finalizedAt accepts corrections. Existing sealed Sale creation immediately consumes received inventory using original-order-date FIFO, saves server-derived COGS/allocations, and posts full revenue to SEALED Funds. Sale.finalizedAt is already populated at creation; correction eligibility deliberately uses the associated ShowVisit instead. |
| B. Edit | Open Edit from the sale's three-dot menu. The dialog fetches a fresh sale/revision and prefills every line, payment method, and notes. Products, quantities, unit prices, and line composition can change. Review shows corrected lines and before/after revenue/payment. Confirmation revalidates everything server-side. Sale number, date, Show association, and createdAt remain fixed. |
| C. Delete | Requires an explicit confirmation showing products, quantities, revenue, payment, and reversal effects. The transaction releases inventory, removes sale lines/allocations and the Sale, appends the revenue reversal, and retains the original ledger entry. A failure rolls back the entire operation. |
| D. FIFO | Original allocation quantities are subtracted from batch quantitySold and old allocations removed within the transaction. Corrected lines use the existing simulateFifoConsumption and allocatedBatchCost functions against restored, current inventory. Order date/ID ordering, converted quantities, received-only availability, and final-unit residual cost remain authoritative. Insufficient stock preserves the original sale. Later sales' allocations are not rewritten. |
| E. Packs | Individual pack sales are not Sale/SaleLine records. ShowPackSnapshot and ShowPackPoolAllocation reserve PackPool inventory; End Show computes consumption/cost basis and optionally posts actual Cash/Digital pack revenue. The new sale correction route does not edit that separate workflow. Converted sealed boxes and their pack allocation costs remain excluded from available sealed stock. Existing active-Show pack controls remain authoritative. |
| F. Funds | Original SEALED_SALE amounts are never rewritten. An edit appends the difference between corrected and current recorded revenue as a SEALED MANUAL_ADJUSTMENT with Show linkage and a sale number/ID note. A deletion appends negative current revenue. Original plus previous adjustments plus deletion reversal net to zero. Payment-method-only changes update sale reporting without posting Funds because ordinary sealed sale Funds are pooled, not separated by payment location. FundEntry.saleId is unique, so adjustments use showVisitId and descriptive notes; deletion clears only the original entry's saleId FK. Original amount, type, date, note and creation timestamp survive. |
| G. Finalization | UI shows Locked · Finalized instead of actions. Context and mutation routes reject finalized visits with 409 and the requested finalized-Show message. Non-Show and non-ACTIVE sales are also rejected. No post-finalization correction/reopening route was added. |
| H. Concurrency | One Serializable Prisma transaction holds finalization's existing advisory lock 86420932, the Sale/ShowVisit/line/allocation row locks, and ordered batch row locks. The visit row lock also coordinates with existing sale creation. A fingerprint rejects forms opened before another sale/Show change. Batch version guards remain in place. Serialization/deadlock conflicts return a controlled 409 requiring reopening the sale. No automatic retry commits an unseen correction. |
| I. UI/metrics | Active Show recent sales and the complete Show History visit list share the same actions/dialog. Native modal dialog provides focus containment, background inertness and Escape; focus returns to the actions summary. A business-data-changed event reloads active workspace and visit-list performance and existing business summaries. Revenue, COGS, profit, units, payment breakdown and product performance continue to derive from sale records, without new stored summaries. |
| J. Verification | Full npm test, npx tsc --noEmit, production build (including project TypeScript checks and Prisma generation), npm audit --omit=dev (0 vulnerabilities), and git diff --check passed. Added service tests cover quantity down/up, stock failure rollback, product replacement, revenue/payment/notes, COGS, allocations, ledger failures, deletion after editing, finalized/stale rejection, validation, converted packs and residual costs. Route/security tests cover malformed/forged inputs, retryable conflicts, ADMIN, CSRF, Origin and no-store. Existing FIFO, pack-finalization, reporting and authentication suites pass. Isolated Chrome checks cover prefill, review, PATCH/DELETE payloads, confirmation/cancel, refresh, 409 feedback, focus restoration, Escape, locked state and dialog bounds at 375/1440px. |
| K. Files | New service/routes/tests: src/server/services/showSaleCorrections.ts and .test.ts; src/server/routes/showSaleCorrections.ts and .test.ts. Existing sales.ts mounts routes and prevents deleted sale-number reuse by consulting retained original SEALED_SALE ledger notes. auth.integration.test.ts checks inherited security. New shared ShowSaleActions.tsx is used by ActiveShowPanel.tsx and ShowsPage.tsx; App.css supplies dialog backdrop/field spacing. scripts/verify-show-sale-ui.mjs reproduces browser checks. |
| L. Release | No schema change or migration is needed for this feature. Build and restart the API to load the new backend routes using the established environment-specific process; local command: npx tsx src/server/server.ts. No persistent business API was restarted because a verified test database was unavailable. Existing unrelated migration release blockers still apply. Nothing was deployed. |
| M. Limits | A read-only connection attempt to the configured .env.test PostgreSQL endpoint failed; no SQL writes were attempted. Transaction rollback tests use an injected stateful repository and browser checks use synthetic data. These checks do not prove actual PostgreSQL race/lock behavior or live Prisma persistence. Before deployment, smoke-test create/edit/delete and simultaneous finalization on a correctly isolated test database, including inventory contention and Funds balances. No updatedAt field or full metadata edit history was added: existing Sale.createdAt is retained and financial changes leave ledger notes. Product choices must remain active/sellable. |

## Reproduce

```powershell
npx tsc --noEmit
npm test
npm run build
npm audit --omit=dev
git diff --check
node scripts/verify-show-sale-ui.mjs
```

The browser script launches isolated headless Chrome with a temporary profile and loopback synthetic fixture. Its JSON result gives machine-local screenshot paths. It never connects to PostgreSQL or the business API.

## API contract

- GET /api/sales/:id/correction returns the editable sale and current revision; locked sales return 409.
- PATCH /api/sales/:id/correction accepts only revision, paymentMethod, notes, and lines containing productId, quantity, unitSalePrice.
- DELETE /api/sales/:id/correction accepts only revision.

All endpoints inherit the existing /api/sales ADMIN/no-store boundary; writes inherit CSRF and Origin protection. Calculated/accounting fields and association/date overrides are rejected rather than accepted from the browser. Normal sale creation remains unchanged except for retaining number uniqueness after deletion.
