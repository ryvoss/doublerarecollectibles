# Storefront redesign handoff — October 19, 2026

Implementation is ready for local review. Nothing was deployed, no production migration was applied, and no business records were changed. **Release remains gated on validating the generated migration and persistence workflows against a correctly identified PostgreSQL test database.**

| Brief item | Result |
| --- | --- |
| A. Existing architecture | Retained React/TypeScript/Vite, Express, Prisma, the public/admin routing boundary in `RootApp`, Storefront Manager, public inventory contract, managed image storage, and existing contact experience. Products' CASE/BOX/ITEM hierarchy remains accounting/catalog structure, independent from retail categories. |
| B. UX reasoning | Announcements lead; inventory follows immediately. Images, product names, and current prices lead cards; descriptions move into details. Warm charcoal, restrained gold, quiet borders, native scrolling, and locally installed system fonts replace oversized or decorative treatments. |
| C. Homepage | Default order: Updates → Inventory → optional Coming Soon → Next Show → Buy/Sell/Trade → compact brand/trust introduction → Contact. Updates and inbound sections disappear when empty. Legacy default layouts upgrade to this order without changing visibility; explicit custom ordering is retained. Existing announcement-banner content becomes an editorial card on the homepage and retains its destination/action label. |
| D. Navigation | Compact sticky header, contained logo, Inventory, Shows, News/Updates, Buy/Sell/Trade, Contact, keyboard skip link, current-page cues, mobile menu with Escape/focus restoration, and matching footer. No public Admin link. Query-string navigation and browser Back preserve category/drop destinations. |
| E. Announcements | Editorial rail supports six types, summary, optional existing public image, published/draft state, priority, optional start/end, and safe destinations. Keyboard users can focus and scroll the rail; no autoplay. Links to hidden/deleted categories or unpublished/future news are suppressed. |
| F. News/Updates | `/news` and `/news/:slug`; plain-text paragraphs, summary, optional public image, publication date, and draft/published state. Public listings use 12-item database pagination; article bodies load only for the requested article. React escapes content; no HTML editor. |
| G. Categories | Admin-created names/slugs, visibility, display order, and many-to-many product assignments. All Inventory is always the first option. Unknown/hidden categories do not silently show an unrelated collection. Public assignments include only currently public, active, sellable Products. |
| H. Inventory/cards | Two columns at 375–430px, single column at 320px, up to four columns on desktop. Shared product-image system retains contained, uncropped imagery and stable frames. Shared catalog provider removes duplicate homepage inventory requests, refetches on catalog-page navigation, and revalidates after returning to the tab after a minute. |
| I. Pricing/availability | Existing 30-day price-drop and receiving-derived availability calculations remain authoritative. No comparison price is invented. Price/status rendering is shared between cards and modals; promotional badges never conceal stock state. No exact inbound quantities are public. Open details update when refreshed inventory changes. |
| J. Shows | Existing public Show/Visit data supplies the nearest homepage Show and chronological upcoming cards on `/shows`, with prominent UTC calendar date, venue/location, table information, and note. Public configuration adds `upcomingShows`; financial/performance data and internal Show IDs stay private. |
| K. Buy/Sell/Trade | Short Buy/Sell/Trade options reuse catalog navigation and the existing inquiry modal. Dedicated page and homepage share this treatment. Configured heading, copy, and CTA remain supported. |
| L. Trust/personality | Retained business identity, configurable introduction/tagline/contact copy, small-business tone, direct inquiry options, and lower-page service highlights. No fabricated reviews, guarantees, urgency, or stock counts. |
| M. Admin Storefront | Added Categories, Announcements, and News/Updates tabs to the existing manager. Includes creation/editing/deletion, publication/visibility, order, assignment checkboxes, local-time scheduling controls, controlled destinations, and live card/article preview. Existing branding, homepage order, merchandising, product listings, Show copy, and contact controls remain available. |
| N. Models/migration | Added `StorefrontCategory`, `StorefrontCategoryProduct`, `StorefrontNewsPost`, `StorefrontAnnouncement`. Migration: `prisma/migrations/20261019120000_storefront_editorial/migration.sql`. SQL is additive: new tables/indexes and join-table foreign keys, no business-row backfill or modification. Deleting categories cascades to assignments only; Products survive. Generated using schema-to-schema Prisma diff; not applied. |
| O. APIs/security | Added `/api/public/editorial`, `/api/public/news`, `/api/public/news/:slug`; admin CRUD under `/api/site/content`. Public responses use narrow DTOs; news queries select customer fields. Admin routes inherit existing ADMIN, CSRF, Origin, rate-limit, and no-store middleware. Existing public inventory DTO is unchanged. Slugs, field lengths, booleans, product IDs, image paths, destinations, dates, and unknown fields are validated. |
| P. Accessibility/responsiveness | Preserved modal semantics, background inertness, focus traps, Escape, and focus restoration, including replacement cards after refresh. Fixed portaled contact-dialog sizing. Reviewed 320, 375, 390, 430, 768, 1024, and 1440px. No page-width overflow in the fixture review; 44px card actions verified. Reduced-motion behavior and keyboard rail scrolling pass. |
| Q. Performance | No new application dependencies or UI library. Existing lazy images and admin code split remain; News page is lazy-loaded. Catalog sections share one request. News pagination runs in PostgreSQL and listings omit bodies; editorial reads also omit article bodies. No external font or editorial-image tracking request is introduced. |
| R. Tests/results | TypeScript (`npx tsc --noEmit` and project build), 164 tests (129 unit/service/component + 35 auth/route), production build, `npm audit --omit=dev` (0 vulnerabilities), and `git diff --check` pass. Isolated Chrome review passed 42 page/viewport combinations, 14 dialog captures, and six editor captures, plus focus, filter reset, stock refresh, reduced-motion, touch-target, and keyboard checks. **Standalone PostgreSQL migration verification did not pass: see limitation below.** |
| S. Files changed | See the file map below. Changes stay in public storefront UI, Storefront Manager, their shared contracts/services/routes/tests, schema migration, and review scripts. Accounting, FIFO/COGS, Funds, transaction finalization, and Show reconciliation implementations were not changed. |
| T. Release steps | See the release sequence below. These are instructions for a separately authorized release, not actions taken in this session. |
| U. Decisions for review | Editorial images currently reuse existing public product images; no standalone editorial upload library or arbitrary external link destination was added. Categories can contain multiple Products and Products can belong to multiple categories. Tied category order is alphabetical; tied announcement priority uses ID. News uses plain text. No editorial content/taxonomy is seeded or automatically published. |

## Verification limitation and production risks

The configured TEST PostgreSQL endpoint initially refused connections. Starting the existing local Prisma runtime made it reachable, but `current_database()` returned `template1` rather than `double_rare_collectibles_test`. The verifier refused DDL before `BEGIN`. Attempts to use a fresh dedicated runtime could not establish a verified connection and also executed no migration DDL. The existing runtime was restored to its original stopped state. Connection credentials were not written to the report or logs.

The full automated suite uses injected repositories/transaction clients and verifies actual route handlers, middleware boundaries, DTO safety, assignment operations, and migration cascade structure. The browser review uses synthetic data served alongside the production bundle. **These results do not establish live PostgreSQL migration or CRUD success, or validate the appearance of the owner's real product photography.**

The new API/editor requires the four new tables. Shipping its code before the migration causes new content endpoints to fail. Validate the migration and persistence workflows before releasing either API or frontend. Existing orders, sales, inventory costs, funds, and private Show metrics are outside this migration.

## File map

| Area | Files |
| --- | --- |
| Routing and shared content | `src/RootApp.tsx`; `src/shared/storefrontContent.ts`; `src/shared/publicSite.ts`; `src/shared/publicInventory.ts` |
| Storefront shell/layout | `src/client/public/PublicSite.tsx`, `PublicSite.css`, `PublicTheme.css`, `StorefrontRetail.css` |
| Shared retail primitives | `src/client/public/PublicLink.tsx`, `PublicProductStatus.tsx`, `PriceDisplay.tsx`, `StorefrontSections.tsx`, `PublicCatalog.tsx`, `InventoryEmptyState.tsx` |
| Inventory and news | `src/client/public/PublicInventoryPage.tsx`, `PublicInventoryPage.css`, `PublicInventoryCard.tsx`, `FeaturedInventorySection.tsx`, `ComingSoonSection.tsx`, `NewsPage.tsx` |
| Dialogs | `src/client/public/ProductDetailModal.tsx`, `ProductDetailModal.css`, `ContactOptions.css` |
| Admin | `src/client/pages/PublicSiteManagerPage.tsx`; `src/client/components/StorefrontContentManager.tsx` |
| API and persistence | `src/server/routes/public.ts`, `site.ts`, `storefrontContent.ts`; `src/server/services/storefrontContent.ts`, `publicContracts.ts`, `siteConfiguration.ts` |
| Database | `prisma/schema.prisma`; `prisma/migrations/20261019120000_storefront_editorial/migration.sql` |
| Tests | `src/shared/storefrontContent.test.ts`, `publicSite.test.ts`; `src/client/public/Storefront.test.tsx`, `StorefrontSections.test.tsx`, `ProductDetailModal.test.tsx`; `src/server/services/storefrontContent.test.ts`, `publicContracts.test.ts`; `src/server/routes/storefrontContent.test.ts`; `src/server/auth/auth.integration.test.ts` |
| Reproducible review | `scripts/review-storefront.mjs`; `scripts/verify-storefront-migration.mjs`; this document |

## Reproduce the review

```powershell
npx tsc --noEmit
npm test
npm run build
npm audit --omit=dev
git diff --check
node --import tsx scripts/review-storefront.mjs
```

Browser review uses local Chrome, a new temporary profile, synthetic images/content, and a loopback fixture server. It does not start the business API or submit contact/admin forms. Its JSON output identifies screenshot and result paths. Final reviewed artifacts for this session are under `C:\Users\Ryan Voss\AppData\Local\Temp\double-rare-storefront-dXVTrN` (temporary machine-local artifacts).

When the test URL resolves to the explicitly named TEST database, run:

```powershell
node --env-file=.env.test scripts/verify-storefront-migration.mjs
```

This verifier creates a unique schema and synthetic Product/category/news/announcement records inside a transaction, checks SQL/cascades/draft defaults, rolls back, and checks schema removal. It refuses a different connected database name. It never marks a Prisma migration as deployed.

## Release sequence — not executed

1. Establish a correctly isolated PostgreSQL test/staging database. Run the rollback verifier, then validate actual Prisma CRUD: assign/unassign Products, delete a category while retaining Products, publish/unpublish news, and confirm scheduled announcement visibility and destinations.
2. Review the generated SQL and the existing configured homepage order. Confirm desired categories, copy, images, and publication dates with the owner; the new tables begin empty.
3. In a separately authorized release, apply the additive migration before rolling out the API and frontend. Use the existing migration process (`npm run db:migrate:deploy`) only after confirming the intended environment.
4. Build and restart the API using the established environment-specific process. Local development uses `npx tsx src/server/server.ts` and requires restart for backend edits. No running business API was restarted during this session because the required new schema was intentionally not applied.
5. Smoke-test public category/search/drop views, news publication, announcement destinations, Show dates, inquiry/focus behavior, and existing admin workflows against the migrated environment. Check real images at the reviewed widths before release.

No Railway configuration, production data, production migration state, or hosting deployment was altered.
