Double Rare Collectibles — Codex UI Prompt Pack

Use these prompts sequentially. The repository-root AGENTS.md contains the persistent business rules, architecture, and safety constraints, so these prompts intentionally stay task-focused and avoid repeating global context.

Prompt 1 — UI Foundation

Perform a focused UI architecture pass on the current app.

Implement:
- a cohesive design system in App.css
- normalized typography, spacing, panels, buttons, inputs, badges, tables, modal surfaces, empty states, and section headers
- improved sidebar and topbar styling
- reduced repeated inline styling where safe
- lightweight reusable UI primitives only where they are genuinely reused
- stronger responsive behavior without sacrificing desktop information density

Keep the dark professional direction.
Use restrained green for positive primary actions, neutral styling for secondary actions, and red only for destructive/error states.

Do not redesign workflows in this pass.

Run the project validation checks when finished and report changed files plus the validation result.

Prompt 2 — Command Center Overhaul

Overhaul the Command Center UI.

Keep this hierarchy:

1. Quick Actions
   - New Order
   - Record Sale

2. Show Operations
   - ActiveShowPanel / Start Show workflow

3. Business Position
   - FundsPanel
   - Sealed Inventory summary

Goals:
- make the Command Center feel like the operational cockpit of the business
- improve hierarchy, spacing, typography, panel balance, and responsive layout
- keep Quick Actions compact on desktop
- make Show Operations visually prominent
- make Funds and Sealed Inventory feel like one coherent business-position section
- preserve the existing modal workflows
- preserve automatic business-data refresh behavior
- avoid reporting clutter

Implement the changes and run the project validation checks.

Prompt 3 — Orders Page Overhaul

Give the Orders page a substantial UI/UX overhaul.

Improve:
- page header and summary metrics
- Draft vs Finalized visual distinction
- order table readability
- monetary column alignment
- compact ⋯ row actions
- order detail presentation
- product-line presentation
- cost summary hierarchy
- Add/Edit Product modal
- Edit Draft Order modal
- Finalize Order confirmation
- responsive behavior

Make the Adjustment field clearly communicate that negative values can represent discounts or credits.

Preserve the current workflow behavior while improving presentation and usability.

Implement the changes and run the project validation checks.

Prompt 4 — Inventory Page Overhaul

Overhaul the Inventory page UI.

Focus on:
- stronger inventory summary metrics
- better product inventory table readability
- clearer cost vs retail distinction
- stronger Units On Hand emphasis
- improved potential profit and margin presentation
- polished zero-stock states
- sorting/filter affordances where they fit the existing implementation
- compact ⋯ row actions where appropriate
- responsive horizontal table overflow

Make the page feel like a professional inventory-control surface rather than a raw database table.

Implement the changes and run the project validation checks.

Prompt 5 — Sales Page Overhaul

Overhaul the Sales page UI.

Improve:
- page summary metrics
- sales history table
- Revenue / COGS / Gross Profit / Margin readability
- search and filter presentation
- Record Sale modal
- line-item entry layout
- product stock visibility
- sale detail presentation
- Show association visibility
- compact detail/action affordances

Keep the general sales flow and Active Show sales flow visually distinct where appropriate.

Implement the changes and run the project validation checks.

Prompt 6 — Shows + Active Show Overhaul

Perform a major UI refinement of ShowsPage and ActiveShowPanel.

Show workflows are one of the most important operational areas in the app.

For ActiveShowPanel, improve at-a-glance visibility of:
- Show name
- date
- status
- starting Singles inventory
- current linked sealed sales
- primary Show actions
- End Show workflow
- ending reconciliation review
- resulting Singles business-position change

For ShowsPage:
- make it a strong historical/admin surface
- improve visit history readability
- improve status badges
- use compact ⋯ row actions
- reduce duplication with Command Center operations

Make active Show operations feel fast and obvious during an event.

Implement the changes and run the project validation checks.

Prompt 7 — Funds Panel Overhaul

Overhaul FundsPanel visually.

Improve:
- total hierarchy
- SEALED vs SINGLES readability
- Cash vs Digital breakdown
- recent activity/history presentation
- Add Funds modal
- positive vs negative movement styling
- warning state for unallocated Singles funds
- responsive layout

Keep FundsPanel compact enough to work well inside Command Center while still making the important balances obvious.

Implement the changes and run the project validation checks.

Prompt 8 — Products Page Overhaul

Overhaul the Products page UI.

Improve:
- catalog table density
- product type and unit badges
- active/inactive states
- sellable state visibility
- Expected Sale Price presentation
- parent/child product relationship readability
- Add/Edit Product modal
- filters
- compact ⋯ row actions
- empty states

Make CASE / BOX / ITEM relationships easy to understand visually.

Implement the changes and run the project validation checks.

Prompt 9 — Cross-App Consistency Pass

Perform a final cross-app UI consistency pass.

Normalize:
- typography scale
- spacing rhythm
- section headers
- card/panel borders and radii
- button hierarchy
- positive-action styling
- destructive-action styling
- input heights
- form labels
- modal headers and footers
- table headers and rows
- status badges
- metric cards
- empty states
- loading states
- error states
- ⋯ action menus
- horizontal overflow
- responsive grids
- page width behavior
- sidebar/topbar consistency

Remove obvious one-off visual inconsistencies without introducing unnecessary abstraction.

Make the whole application feel like one cohesive product.

Run the project validation checks and report all changed files.

Prompt 10 — UX Polish Pass

Perform a pragmatic UX polish pass based on daily business use.

Look for:
- unclear button labels
- unnecessary helper text
- excessive whitespace
- cramped tables
- weak alignment
- repetitive headings
- awkward modal sizing
- poor keyboard focus states
- accessibility contrast issues
- inconsistent confirmation patterns
- inputs missing useful hints
- business-critical values that are visually buried

Make useful improvements without introducing new business features.

Run the project validation checks.

Optional Later Prompt — Reports Foundation

Use this only after the operational UI has been used with real data.

Design and implement the first Reports page.

Information architecture:

Reports
- Overview
- Sales
- Inventory
- Shows

Keep Reports read-only and focused on understanding the business.

Do not duplicate Command Center operational workflows.

Use existing APIs and data where practical before adding new backend endpoints.

Start with a focused, useful reporting experience rather than a broad analytics platform.

Run the project validation checks.