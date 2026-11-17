# Storefront refinement review

Implemented November 16, 2026. Customer-facing presentation only; no deployment, database access, migrations, API changes, or business-rule changes.

## A. Visual problems found

Duplicate header contact actions; large pill filters and colored status badges; boxed product/news/event surfaces; decorative gradients, blur, shadows, and modal motion; oversized page headings; repeated homepage BST panels and calls to action. Product names of different lengths displaced neighboring prices.

## B. Design system decisions

Retained the established charcoal, warm off-white, muted neutral, and gold palette. Background is #131517, with #1b1d20 and #232528 surfaces. Gold marks selection and primary actions; muted red marks price drops and validation errors. Shared public radius tokens are 4px for controls and 6px for media/dialog surfaces. Main containers share a 1280px maximum, with 16px phone and 24px larger-screen gutters. Page titles are 28-36px, section titles 22-28px, product names 14px, prices 20px, and status text 13px.

Kept the system font stack. Browser platform-font inspection confirmed Segoe UI Semibold actually rendered the brand text; no missing webfont or external font request is involved.

## C. Components simplified

Product cards, category navigation, availability filters, editorial items, news cards, show dates, contact alternatives, and both dialogs now rely on spacing and thin dividers. Removed the redundant arrival sentence beside Coming Soon. Status priority and actual availability remain visible together when necessary.

## D. Homepage changes

Compact What's New rail with one-line summaries; less introductory copy above inventory; concise BST section with a contact link and dedicated-page link; one quiet contact-page link in the contact section. Removed the optional hero's decorative DR placeholder, service-promise strip, and extra explanatory copy. Existing configured section order, visibility, text, images, and CTA destinations remain honored, including the optional hero.

## E. Product cards and grids

The shared ProductImage component still contains packaging without cropping. Public image styling is scoped, leaving admin image variants unchanged. Cards have a neutral image frame and an unboxed information area. CSS subgrid aligns names, prices, statuses, and inquiry actions across each row while allowing complete product names to wrap. Whole-card detail opening and a separate 44px-high text inquiry target remain available. Existing dollar-and-cent formatting and compare-at rules are unchanged.

## F. Navigation

64px header, single Contact navigation destination, contained logo, simple mobile menu, and an underline for the current route, including news articles. Categories and availability use scrollable text tabs instead of pills. All inventory remains first.

## G. Modals

Product sheet presents name, price, availability, description, and one primary inquiry action. Removed the explanatory header sentence, blur, large rounded corners, shadows, and slide-up animation. Contact dialog removes nested form/context boxes. Existing focus trapping, Escape, focus restoration, body-scroll locking, product context, and submission behavior are retained. Product CTA remains sticky within the scrollable information pane.

## H. Shows, BST, and contact

Show dates are plain typographic anchors with a single row divider. The dedicated BST page retains useful Buy/Sell/Trade explanations but loses the duplicate bottom action row. Contact alternatives use dividers; desktop gives the form the larger column. News and articles share the same typography, palette, and page spacing.

## I. CSS/design debt removed

Replaced conflicting public shell/catalog styles in their existing files rather than adding another override sheet. Removed unused hero promise/note/placeholder rules, shrinking-header rules, mobile brand-width patches, old badge fills/dots, card shadows, shimmer, modal rise animations, and decorative gradients. Admin editor layout rules and shared ProductImage CSS were preserved. The public editorial preview intentionally reflects the updated public design.

## J. Responsive and visual review

Reviewed all seven public routes at 320, 375, 390, 430, 768, 1024, and 1440px: 49 layouts, plus product/contact dialogs at every width and six admin editor screenshots. Used scripts/review-storefront.mjs against the production build with synthetic data and an isolated browser profile. No business API or database was started. Full-page captures explicitly load offscreen lazy images.

| Width | Product grid | Review |
| --- | --- | --- |
| 320 | 1 column | Logo/name retained; filters scroll; long names wrap |
| 375, 390, 430 | 2 columns | Prices align; labels wrap; images contain; dialogs fit |
| 768 | 3 columns | Mobile navigation; spacious stacked contact form |
| 1024 | 4 columns | Desktop navigation fits; contact columns split |
| 1440 | 5 inventory / 4 homepage | Consistent maximum width and aligned cards |

No horizontal document overflow or browser runtime exceptions. Category filtering, recent-drop filtering, live availability refresh in an open dialog, menu Escape/focus return, and keyboard rail scrolling passed. Images were checked for object-fit: contain. Final artifacts are in `C:/Users/RYANVO~1/AppData/Local/Temp/double-rare-storefront-TdNnO8/` (results.json and screenshots). These are synthetic layout fixtures, not production photography or a real-device Safari review.

## K. Accessibility

Preserved skip navigation, accessible card names, labeled forms, visible focus, current-page and pressed-state semantics, text availability, dialog focus behavior, and reduced-motion support. Inquiry hit targets remain at least 44px. Status does not depend on color. Browser checks verify focus remains in the product dialog and returns to the originating card. No claim of a complete WCAG audit.

## L. Validation

- `npx tsc --noEmit`: passed.
- `npm test`: 208 passed, 0 failed; 1 optional database integration suite skipped.
- `npm run build`: passed, including TypeScript build and client/server bundles. Prisma client generation did not run migrations.
- `node --import tsx scripts/review-storefront.mjs`: 49 public layouts; 0 browser exceptions; responsive and interaction checks passed.
- `git diff --check` and `git diff HEAD --check`: passed.
- `npm audit --omit=dev`: 7 findings (5 high, 2 moderate), affecting @prisma/config, body-parser, deepmerge-ts, fast-uri, mysql2, prisma, and qs. Package manifests/lockfile were not changed; dependency remediation is separate work.

## M. Files changed

All paths below are relative to the repository:

- `src/client/public/PublicTheme.css`: shared palette/radius tokens.
- `src/client/public/PublicSite.tsx`, `PublicSite.css`: shell, homepage, navigation, footer, contact-page layout.
- `src/client/public/FeaturedInventorySection.tsx`: removed generic introductory copy.
- `src/client/public/PublicInventoryCard.tsx`, `PublicInventoryPage.css`: simple card hierarchy and responsive aligned grid.
- `src/client/public/PublicInventoryPage.tsx`: corrected the stray question-mark separator before Recent price drops.
- `src/client/public/PublicProductStatus.tsx`: calmer Coming Soon label.
- `src/client/public/ProductDetailModal.tsx`, `ProductDetailModal.css`: product-sheet structure and styling.
- `src/client/public/ContactOptions.css`: simplified portaled contact presentation.
- `src/client/public/StorefrontSections.tsx`, `StorefrontRetail.css`: editorial, categories, shows, news, and BST presentation.
- `src/client/public/ProductDetailModal.test.tsx`, `StorefrontSections.test.tsx`: revised copy/structure expectations and duplicate-status check.
- `scripts/review-storefront.mjs`: added contact route, all grid breakpoint assertions, actual rendered-font checks, reliable full-page captures, current synthetic show dates.
- `docs/storefront-refinement.md`: this review and handoff.

## N. Owner review choices

No decision blocks use of the changes. Review the look with your actual logo and product photos before publishing. The existing configurable hero is still honored; hide it through Storefront settings if you want exactly the proposed Updates > Inventory > Show > BST > Contact flow. Existing merchandising settings still determine featured/coming-soon inclusion; this visual pass does not silently change which products are published or shown. Currency still includes cents for continuity with the rest of the application.
