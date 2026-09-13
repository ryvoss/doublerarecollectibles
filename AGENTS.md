# Double Rare Collectibles - Codex Project Instructions

## Project Purpose

This application manages the operations of Double Rare Collectibles, a Pokemon collectibles business.

The MVP focuses primarily on sealed Pokemon inventory, purchasing, sales, FIFO cost accounting, profitability, and show tracking.

The user is still learning software development, so code should remain readable, practical, and well-commented.

Avoid unnecessary abstraction or overengineering.

---

## Tech Stack

Frontend:
- React
- TypeScript
- Vite

Backend:
- Node.js
- TypeScript
- Express

Database:
- PostgreSQL
- Prisma ORM

Environment:
- Windows
- VS Code

API:
- Express runs on port 3002

Frontend development server:
- Vite runs on port 5173
- Vite proxies /api requests to Express

---

## Important Development Rules

1. Preserve existing working functionality unless the task explicitly requires changing it.

2. Prefer small, incremental changes.

3. Do not redesign unrelated parts of the application while implementing a requested feature.

4. Before modifying a file, inspect the current implementation and related dependencies.

5. When changing the Prisma schema, inspect all affected API routes and frontend types before making assumptions.

6. Do not infer database relationships from product names.

7. Business calculations should be performed or validated by the backend when possible.

8. Historical financial values must never change because a product's current price changes.

9. Finalized financial transactions should be treated as immutable unless a future explicit correction workflow is added.

10. Favor correctness and auditability over clever code.

11. Add helpful comments to TypeScript code so a newer developer can understand the reasoning.

12. Prisma schema comments should be minimal. Section headers are fine.

13. Do not build future features unless they are required for the current MVP task.

14. Do not implement Singles accounting unless explicitly requested.

15. Do not implement the Funds ledger yet unless explicitly requested.

---

# Business Rules

## Products

Products are the source of truth for inventory items that can be purchased.

Every Product has:

- Item ID
- Name
- Product Type
- Unit Type
- Sellable status
- Active status
- Expected sale price

Product Type currently supports:

- SEALED
- SINGLE

Product Unit Type currently supports:

- CASE
- BOX
- ITEM

Do not infer Unit Type from a product name.

For example:

"CN Prism Case"

must not automatically be treated as CASE merely because the name contains "Case".

Use Product.unitType.

---

## Product Hierarchy

The current Product model contains:

- parentProductId
- quantityPerParent

This relationship is intended to support container conversion.

Example:

CN Prism Box
- parentProduct = CN Prism Case
- quantityPerParent = 20

This represents:

1 CN Prism Case = 20 CN Prism Boxes

The frontend may present this relationship from the more intuitive Case perspective, but do not reverse or redesign the database relationship without first reviewing the existing schema and application behavior.

For the MVP, Pokemon cases generally contain repeated units of one sellable product.

---

## Inventory Tracking

Sealed inventory is tracked at the lowest sellable unit.

Example:

If a case contains 20 boxes and 1 case is purchased:

Inventory created = 20 boxes.

The case itself should not become 1 sellable inventory unit if the business sells the individual boxes.

Inventory quantity is:

Units Received - Units Sold

Inventory value is based on remaining historical landed cost.

---

## Orders

Orders represent purchases from vendors.

An Order can contain multiple product lines.

The primary purpose of creating an order is adding inventory.

The intended future Order UI is:

Order Information

Products
- Product Purchased
- Quantity Purchased
- Purchase Price Each
- Product Cost
- Inventory Created
- Landed Cost Per Sellable Unit

Then:

Additional Order Costs
- Shipping
- Tariffs
- Other Costs
- Adjustment

Then totals and Finalize Order.

Product Cost stored in the database represents the TOTAL product cost for that order line.

Example:

Quantity = 2
Price Each = $700

Product Cost = $1,400

The UI may ask for Price Each, but the backend/database should store:

productCost = quantity * priceEach

---

## Case Conversion

Eventually, Order creation should require only:

- Purchased Product
- Quantity Purchased
- Purchase Price

The backend should derive:

- Sellable Product
- Sellable Quantity

Do not trust manually entered sellable quantities once automatic conversion is implemented.

Example:

Purchased:
2 CN Prism Cases

Catalog conversion:
1 Case = 20 CN Prism Boxes

Inventory created:

40 CN Prism Boxes

This conversion should come from Product metadata.

---

## Additional Order Costs

Orders may include:

- Shipping
- Tariffs
- Other Cost
- Adjustment

Adjustment may be positive or negative.

Additional order costs are allocated across order lines proportionally according to Product Cost.

Example:

Product A cost = $1,000
Product B cost = $500

Total product cost = $1,500

Product A receives 2/3 of additional costs.

Product B receives 1/3.

---

## Landed Cost

Landed Cost equals:

Product Cost
+ allocated Shipping
+ allocated Tariffs
+ allocated Other Cost
+ allocated Adjustment

Landed Unit Cost equals:

Line Landed Cost / Sellable Quantity

Example:

20 boxes are created.

Final allocated landed cost = $1,400.

Landed Unit Cost = $70 per box.

Historical landed costs must remain unchanged after the order is finalized.

---

## Inventory Batches

Every finalized Order Line creates a separate InventoryBatch.

Batches for the same Product remain separate.

Example:

Order 1:
20 Prism Boxes @ $60 landed cost

Order 2:
20 Prism Boxes @ $75 landed cost

These are separate inventory batches.

Do not average them into one batch.

---

## Sales

Sales track detailed sealed-product transactions.

A sale includes:

- Sale Number
- Sale Date
- Payment Method
- Optional Show Visit
- Product
- Quantity
- Unit Sale Price

Revenue:

quantity * unit sale price

COGS uses FIFO inventory costing.

Gross Profit:

Revenue - COGS

Gross Margin:

Gross Profit / Revenue

If Revenue is zero, Gross Margin should be zero.

---

## FIFO COGS

Inventory must be consumed from the oldest available InventoryBatch first.

FIFO ordering currently uses:

1. Order Date
2. Inventory Batch ID as tie-breaker

Sales create SaleAllocation records that identify exactly which inventory batches were consumed.

Do not replace FIFO with average cost.

---

## Exact-Cent Accounting

Financial calculations must reconcile exactly to cents.

Do not allow rounding errors to create or destroy money.

Order landed-cost allocation should ensure the final allocated cents exactly equal the total additional cost.

FIFO batch depletion should also preserve exact historical batch value.

---

## Product Profitability

Product metrics may include:

- Revenue
- COGS
- Gross Profit
- Gross Margin
- ROI

Product ROI:

Gross Profit / COGS

Products with zero sales or zero COGS must not incorrectly rank as the highest ROI product.

---

## Expected Sale Price

Product.expectedSalePrice is used only for current retail/potential inventory calculations.

Changing expectedSalePrice must NEVER change:

- Historical landed cost
- Historical COGS
- Historical gross profit
- Historical ROI

---

# Shows

A Show represents a recurring event.

Example:

"St. Louis Card Show"

A ShowVisit represents one specific date for that show.

Example:

St. Louis Card Show
September 12, 2026

Sealed sales may reference a ShowVisit.

Show-level sealed revenue must come from actual Sale records.

Do not infer sealed revenue from beginning versus ending inventory.

---

# Singles

Singles accounting is intentionally deferred for the MVP.

The database currently contains some ShowVisit singles fields, but do not expand or build Singles workflows unless explicitly requested.

The architecture should remain capable of supporting Singles later.

Potential future Singles tracking will likely occur at Show level rather than individual card transaction level.

---

# Payment Methods

Current payment methods:

- CASH
- DIGITAL

Payment Method describes how money was received.

It is separate from revenue source.

Examples of revenue source:

- Sealed
- Singles

Do not treat Cash/Digital as business categories.

---

# Future Funds System

Do not build this unless explicitly requested.

Eventually the application should track actual money available across accounts such as:

- Cash
- Bank
- Digital/Venmo/etc.

The preferred architecture is a ledger:

FundingAccount

FundTransaction

Do NOT implement one global mutable "moneyOnHand" number.

Future order finalization should eventually:

1. Finalize inventory/accounting
2. Create inventory batches
3. Withdraw the complete order total from the selected funding account

These actions should happen atomically in one database transaction.

If inventory creation fails, funds should not be deducted.

If funds deduction fails, the order should not finalize.

Transfers between funding accounts are not revenue or profit.

---

# Current Prisma Product Model Behavior

Product currently includes:

- id
- itemId
- name
- type
- unitType
- parentProductId
- quantityPerParent
- sellable
- active
- expectedSalePrice

unitType supports:

CASE
BOX
ITEM

Existing products were migrated with BOX as the default.

Some existing products may need to be manually corrected to CASE.

---

# Product API Rules

The Products API already has important behavior that must be preserved:

- Item IDs are normalized to uppercase.
- Item ID duplicate checking is case-insensitive.
- GET all Products returns active and inactive products.
- Product creation validates Product Type.
- Product creation validates Unit Type.
- Product editing validates Product Type and Unit Type.
- Products may be deactivated.
- Products may be reactivated.

Do not remove or weaken the existing duplicate Item ID protections.

---

# Order Status

Orders support:

DRAFT
FINALIZED

Draft orders may be modified.

Finalized orders should be treated as historical accounting records.

Order finalization currently:

- validates the order
- calculates landed cost allocation
- updates order lines
- creates InventoryBatch records
- marks the Order FINALIZED

These operations occur inside a Prisma database transaction.

Preserve transactional finalization.

---

# Sales Immutability

Sales currently finalize immediately.

There is currently no update/delete sales workflow.

Do not add casual editing of finalized sales.

Any future correction mechanism should preserve an audit trail.

---

# Concurrency

The MVP is currently primarily intended for one user.

Existing FIFO sales behavior is not yet designed for heavy concurrent multi-user transactions.

Do not claim the application is concurrency-safe without reviewing and improving the transaction/locking strategy.

This can remain technical debt for the MVP.

---

# Frontend Guidelines

The frontend uses a custom dark charcoal/red design.

Preserve the existing visual design unless asked to redesign it.

The Products page currently supports:

- Product list
- Filtering
- Add Product
- Edit Product
- Deactivate
- Reactivate
- Row action menu

Row actions use a three-dot menu.

Do not replace these with large inline action buttons unless requested.

---

# Current MVP Priority

Work in this general dependency order:

1. Products
2. Product case/box conversion metadata
3. Orders
4. Automatic order inventory conversion
5. Inventory Batches
6. Inventory
7. Sales
8. FIFO COGS
9. Profitability
10. Shows
11. Reporting
12. Dashboard

Funds and Singles accounting come later.

---

# Current Work In Progress

The Product schema and Product API now support:

CASE
BOX
ITEM

The next planned task is updating the Products UI so users can:

- Choose Unit Type when creating a Product
- Change Unit Type when editing a Product
- See Unit Type in the Products table

After that, implement Product conversion metadata so a Case can resolve into its sellable Box quantity.

Do not modify the Orders workflow until the Product conversion foundation is complete.

---

# Coding Style

Use TypeScript.

Prefer explicit readable code over compact clever code.

Add comments where business logic may not be obvious.

Use descriptive variable names.

Keep route handlers understandable to a newer developer.

Avoid `any` unless unavoidable.

Use `import type` for TypeScript-only frontend imports because the project uses `verbatimModuleSyntax`.

Do not introduce a new framework or state-management library without a clear need.

Do not add dependencies just to solve something that can be done cleanly with the existing stack.

---

# Prisma

This project uses Prisma 7.

Prisma client output:

src/generated/prisma

Prisma configuration is stored separately from schema.prisma.

Do not add a datasource URL to schema.prisma unless the existing Prisma 7 configuration is intentionally being changed.

After Prisma schema changes, normally run:

npx prisma format

npx prisma validate

npx prisma migrate dev --name <migration-name>

npx prisma generate

Do not reset or wipe the database unless explicitly authorized.

---

# Local Development

Database:

npx prisma dev

API:

npx tsx src/server/server.ts

Frontend:

npm run dev

Expected ports:

Frontend:
http://localhost:5173

API:
http://localhost:3002

---

# Validation Before Finishing Changes

For meaningful code changes:

1. Inspect all related files first.
2. Make the smallest coherent change.
3. Check TypeScript errors.
4. Run relevant application/database validation.
5. Explain what changed.
6. Explain any remaining technical debt.
7. Do not silently change business rules.

When a requirement is ambiguous, ask before changing accounting or inventory behavior.