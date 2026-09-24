import { inputStyle, secondaryButtonStyle } from "../components/uiStyles";
import { resolveOrderInventory } from "../../shared/orderConversion";
import { analyzeLandedCosts } from "../../shared/landedCostAnalysis";
import {
  Fragment,
  useEffect,
  useState,
} from "react";

import type {
  FormEvent,
  ReactNode,
} from "react";
import type { LandedCostMethod } from "../../shared/landedCostAnalysis";

// ---------------------------------------------------------
// TYPES
// ---------------------------------------------------------

type Product = {
  id: number;
  itemId: string;
  name: string;
  type: "SEALED" | "SINGLE";
  unitType: "CASE" | "BOX" | "ITEM";
  parentProductId: number | null;
  quantityPerParent: number | null;
  sellable: boolean;
  active: boolean;
  expectedSalePrice: string | number | null;
};

type OrderStatus =
  | "DRAFT"
  | "FINALIZED";

type OrderLine = {
  id: number;
  orderId: number;
  purchasedProductId: number;
  sellableProductId: number;
  quantityPurchased: number;
  productCost: string | number;
  sellableQuantity: number;
  landedCost: string | number | null;
  landedUnitCost: string | number | null;

  purchasedProduct?: Product;
  sellableProduct?: Product;
};

type Order = {
  id: number;
  orderNumber: string;
  orderDate: string;

  shippingCost: string | number;
  tariffCost: string | number;
  otherCost: string | number;
  adjustment: string | number;

  notes: string | null;

  status: OrderStatus;
  finalizedAt: string | null;

  createdAt: string;
  updatedAt: string;

  lines: OrderLine[];
};

type NewOrderForm = {
  orderDate: string;
  shippingCost: string;
  tariffCost: string;
  otherCost: string;
  adjustment: string;
  notes: string;
};

type NewLineForm = {
  purchasedProductId: string;
  quantityPurchased: string;
  priceEach: string;
};

type StatusFilter =
  | "ALL"
  | "DRAFT"
  | "FINALIZED";

// ---------------------------------------------------------
// FORMATTERS
// ---------------------------------------------------------

function money(
  value:
    | string
    | number
    | null
    | undefined
) {
  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
    }
  ).format(Number(value ?? 0));
}

function formatDate(value: string) {
  if (!value) {
    return "—";
  }

  return value.slice(0, 10);
}

// ---------------------------------------------------------
// COMPONENT PROPS
// ---------------------------------------------------------

type OrdersPageProps = {
  // Opens the existing New Order workflow immediately.
  // The Command Center uses this instead of duplicating the order form.
  initialOpenNewOrder?: boolean;

  // When true, render only the order workflow modals.
  // The normal Orders page remains unchanged when this is false.
  quickActionOnly?: boolean;

  // Called when the Command Center order workflow is closed.
  onQuickActionClose?: () => void;
};

// ---------------------------------------------------------
// ORDERS PAGE
// ---------------------------------------------------------

export default function OrdersPage({
  initialOpenNewOrder = false,
  quickActionOnly = false,
  onQuickActionClose,
}: OrdersPageProps = {}) {
  const [orders, setOrders] =
    useState<Order[]>([]);

  const [products, setProducts] =
    useState<Product[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("ALL");

  const [
    showNewOrderModal,
    setShowNewOrderModal,
  ] = useState(initialOpenNewOrder);

  const [
    selectedOrderId,
    setSelectedOrderId,
  ] = useState<number | null>(null);

  async function loadPageData() {
    try {
      setLoading(true);
      setError(null);

      const [
        ordersResponse,
        productsResponse,
      ] = await Promise.all([
        fetch("/api/orders"),
        fetch("/api/products"),
      ]);

      if (!ordersResponse.ok) {
        throw new Error(
          "Orders could not be loaded."
        );
      }

      if (!productsResponse.ok) {
        throw new Error(
          "Products could not be loaded."
        );
      }

      const ordersData =
        await ordersResponse.json();

      const productsData =
        await productsResponse.json();

      setOrders(ordersData);
      setProducts(productsData);
    } catch (error) {
      console.error(
        "Orders page loading error:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Orders could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPageData();
  }, []);

  // This makes the component reusable from the Command Center.
  // If the parent asks to open the workflow, reuse the exact same
  // New Order modal that the Orders page already uses.
  useEffect(() => {
    if (initialOpenNewOrder) {
      setShowNewOrderModal(true);
    }
  }, [initialOpenNewOrder]);

  const filteredOrders =
    orders.filter((order) => {
      if (statusFilter === "ALL") {
        return true;
      }

      return (
        order.status === statusFilter
      );
    });

  const draftOrders =
    orders.filter(
      (order) =>
        order.status === "DRAFT"
    );

  const finalizedOrders =
    orders.filter(
      (order) =>
        order.status === "FINALIZED"
    );

  const totalOrderSpend =
    finalizedOrders.reduce(
      (total, order) => {
        return (
          total +
          calculateOrderTotal(order)
        );
      },
      0
    );

  const selectedOrder =
    orders.find(
      (order) =>
        order.id === selectedOrderId
    ) ?? null;

  if (loading) {
    if (quickActionOnly) {
      return null;
    }

    return (
      <PageMessage
        icon="▤"
        title="Loading Orders"
        message="Retrieving purchase orders..."
      />
    );
  }

  if (error) {
    if (quickActionOnly) {
      return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            background: "rgba(0, 0, 0, 0.72)",
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "460px",
              padding: "24px",
              border: "1px solid #303137",
              borderRadius: "12px",
              background: "#17181c",
              boxShadow:
                "0 24px 70px rgba(0, 0, 0, 0.45)",
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: "18px",
              }}
            >
              Orders Unavailable
            </h2>

            <p
              style={{
                margin: "10px 0 20px",
                color: "#8b8c93",
                fontSize: "12px",
                lineHeight: 1.6,
              }}
            >
              {error}
            </p>

            <button
              type="button"
              onClick={onQuickActionClose}
              style={secondaryButtonStyle}
            >
              Close
            </button>
          </div>
        </div>
      );
    }

    return (
      <PageMessage
        icon="!"
        title="Orders Unavailable"
        message={error}
      />
    );
  }

  // The Command Center mounts OrdersPage in action-only mode.
  // In that mode, keep the normal Orders dashboard hidden and render
  // only the existing New Order -> Order Detail workflow.
  if (quickActionOnly) {
    return (
      <>
        {showNewOrderModal && (
          <NewOrderModal
            onClose={() => {
              setShowNewOrderModal(false);
              onQuickActionClose?.();
            }}
            onCreated={async (
              createdOrder
            ) => {
              setShowNewOrderModal(false);

              await loadPageData();

              setSelectedOrderId(
                createdOrder.id
              );
            }}
          />
        )}

        {selectedOrder && (
          <OrderDetailModal
            order={selectedOrder}
            products={products}
            onClose={() => {
              setSelectedOrderId(null);
              onQuickActionClose?.();
            }}
            onChanged={async (
              keepOpenOrderId
            ) => {
              await loadPageData();

              setSelectedOrderId(
                keepOpenOrderId
              );
            }}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="page-heading orders-heading">
        <div>
          <h2
            style={{
              margin: 0,
            }}
          >
            Purchase Orders
          </h2>

          <p className="orders-description">
            Record product purchases and
            finalize them into inventory.
          </p>
        </div>

        <button
          type="button"
          className="primary-button"
          onClick={() =>
            setShowNewOrderModal(true)
          }
        >
          + New Order
        </button>
      </div>

      <div className="orders-metrics">
        <OrderMetric
          label="Total Orders"
          value={String(orders.length)}
          detail="All purchase orders"
        />

        <OrderMetric
          label="Draft Orders"
          value={String(
            draftOrders.length
          )}
          detail="Waiting to be finalized"
        />

        <OrderMetric
          label="Finalized Orders"
          value={String(
            finalizedOrders.length
          )}
          detail="Added to inventory"
        />

        <OrderMetric
          label="Finalized Spend"
          value={money(totalOrderSpend)}
          detail="Product + additional costs"
        />
      </div>

      <div className="panel">
        <div className="panel-header orders-panel-header">
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: "15px",
              }}
            >
              Orders
            </h3>

            <p className="orders-description">
              {
                filteredOrders.length
              }{" "}
              {filteredOrders.length === 1
                ? "order"
                : "orders"}
            </p>
          </div>

          <div className="orders-filters">
            <FilterButton
              label="All"
              active={
                statusFilter === "ALL"
              }
              onClick={() =>
                setStatusFilter("ALL")
              }
            />

            <FilterButton
              label="Draft"
              active={
                statusFilter === "DRAFT"
              }
              onClick={() =>
                setStatusFilter("DRAFT")
              }
            />

            <FilterButton
              label="Finalized"
              active={
                statusFilter ===
                "FINALIZED"
              }
              onClick={() =>
                setStatusFilter(
                  "FINALIZED"
                )
              }
            />
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">
              ▤
            </span>

            <strong>
              No orders found
            </strong>

            <p>
              Create a purchase order to
              begin receiving inventory.
            </p>
          </div>
        ) : (
          <div
            style={{
              overflowX: "auto",
            }}
          >
            <table className="orders-table orders-history-table">
              <thead>
                <tr>
                  <TableHeader>
                    Order
                  </TableHeader>

                  <TableHeader>
                    Date
                  </TableHeader>

                  <TableHeader>
                    Products
                  </TableHeader>

                  <TableHeader>
                    Product Cost
                  </TableHeader>

                  <TableHeader>
                    Additional
                  </TableHeader>

                  <TableHeader>
                    Total
                  </TableHeader>

                  <TableHeader>
                    Status
                  </TableHeader>

                  <TableHeader>
                    View
                  </TableHeader>
                </tr>
              </thead>

              <tbody>
                {filteredOrders.map(
                  (order) => {
                    const productCost =
                      calculateProductCost(
                        order
                      );

                    const additionalCost =
                      calculateAdditionalCost(
                        order
                      );

                    return (
                      <Fragment key={order.id}><tr
                        className="orders-row expandable-row"
                        onClick={(event) => { if (!(event.target as HTMLElement).closest("button, a, input, select, summary")) setSelectedOrderId(selectedOrderId === order.id ? null : order.id); }}
                      >
                        <TableCell>
                          <strong
                            style={{
                              color:
                                "#e5e5e7",
                            }}
                          >
                            {
                              order.orderNumber
                            }
                          </strong>
                        </TableCell>

                        <TableCell>
                          {formatDate(
                            order.orderDate
                          )}
                        </TableCell>

                        <TableCell>
                          {
                            order.lines
                              ?.length ?? 0
                          }
                        </TableCell>

                        <TableCell>
                          {money(
                            productCost
                          )}
                        </TableCell>

                        <TableCell>
                          {money(
                            additionalCost
                          )}
                        </TableCell>

                        <TableCell>
                          <strong
                            style={{
                              color:
                                "#e5e5e7",
                            }}
                          >
                            {money(
                              productCost +
                                additionalCost
                            )}
                          </strong>
                        </TableCell>

                        <TableCell>
                          <OrderStatusBadge
                            status={
                              order.status
                            }
                          />
                        </TableCell>

                        <TableCell>
                          <button
                            type="button"
                            aria-expanded={selectedOrderId === order.id}
                            aria-controls={`order-detail-${order.id}`}
                            aria-label={`Details for ${order.orderNumber}`}
                            onClick={() =>
                              setSelectedOrderId(
                                selectedOrderId === order.id ? null : order.id
                              )
                            }
                            style={
                              smallButtonStyle
                            }
                          >
                            {selectedOrderId === order.id ? "Collapse \u25be" : "Expand \u25b8"}
                          </button>
                        </TableCell>
                      </tr>
                      {selectedOrderId === order.id && <tr><td colSpan={8} className="expanded-row-detail">
                        <div id={`order-detail-${order.id}`}>
                          <OrderDetailModal inline order={order} products={products}
                            onClose={() => setSelectedOrderId(null)}
                            onChanged={async (id) => { await loadPageData(); setSelectedOrderId(id); }} />
                        </div>
                      </td></tr>}
                      </Fragment>
                    );
                  }
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNewOrderModal && (
        <NewOrderModal
          onClose={() =>
            setShowNewOrderModal(false)
          }
          onCreated={async (
            createdOrder
          ) => {
            setShowNewOrderModal(false);

            await loadPageData();

            setSelectedOrderId(
              createdOrder.id
            );
          }}
        />
      )}


    </>
  );
}

// ---------------------------------------------------------
// NEW ORDER MODAL
// ---------------------------------------------------------

function NewOrderModal({
  order,
  onClose,
  onCreated,
}: {
  order?: Order;
  onClose: () => void;
  onCreated: (
    order: Order
  ) => Promise<void>;
}) {
  const [form, setForm] =
    useState<NewOrderForm>({
      orderDate:
        order?.orderDate.slice(0, 10) ?? new Date()
          .toISOString()
          .slice(0, 10),
      shippingCost: order?.shippingCost.toString() ?? "",
      tariffCost: order?.tariffCost.toString() ?? "",
      otherCost: order?.otherCost.toString() ?? "",
      adjustment: order?.adjustment.toString() ?? "",
      notes: order?.notes ?? "",
    });

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  function updateForm<
    K extends keyof NewOrderForm,
  >(
    field: K,
    value: NewOrderForm[K]
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!form.orderDate) {
      setError(
        "Order date is required."
      );

      return;
    }

    try {
      setSaving(true);
      setError(null);

      const response = await fetch(
        order ? `/api/orders/${order.id}` : "/api/orders",
        {
          method: order ? "PATCH" : "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            orderDate:
              form.orderDate,

            shippingCost:
              numberOrZero(
                form.shippingCost
              ),

            tariffCost:
              numberOrZero(
                form.tariffCost
              ),

            otherCost:
              numberOrZero(
                form.otherCost
              ),

            adjustment:
              numberOrZero(
                form.adjustment
              ),

            notes:
              form.notes.trim() ||
              null,
          }),
        }
      );

      const body =
        await response
          .json()
          .catch(() => null);

      if (!response.ok) {
        throw new Error(
          body?.error ??
            "Order could not be saved."
        );
      }

      await onCreated(body);
    } catch (error) {
      console.error(
        "Order creation error:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Order could not be saved."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      onClose={onClose}
      title={order ? "Edit Draft Order" : "New Order"}
      subtitle="Create a draft purchase order. Inventory is not added until the order is finalized."
    >
      <form onSubmit={handleSubmit}>
        <div style={twoColumnStyle}>
          <FormField
            label="Order Date"
          >
            <input
              type="date"
              autoFocus
              value={form.orderDate}
              onChange={(event) =>
                updateForm(
                  "orderDate",
                  event.target.value
                )
              }
              style={inputStyle}
            />
          </FormField>
        </div>

        <div style={twoColumnStyle}>
          <MoneyField
            label="Shipping"
            value={form.shippingCost}
            onChange={(value) =>
              updateForm(
                "shippingCost",
                value
              )
            }
          />

          <MoneyField
            label="Tariffs"
            value={form.tariffCost}
            onChange={(value) =>
              updateForm(
                "tariffCost",
                value
              )
            }
          />

          <MoneyField
            label="Other Costs"
            value={form.otherCost}
            onChange={(value) =>
              updateForm(
                "otherCost",
                value
              )
            }
          />

          <MoneyField
            label="Adjustment (discount / credit)"
            value={form.adjustment}
            onChange={(value) =>
              updateForm(
                "adjustment",
                value
              )
            }
            allowNegative
          />
          <p className="orders-adjustment-hint">Use a negative amount for a discount or credit, e.g. -50.00 reduces the order total by $50.</p>
        </div>

        <FormField
          label="Notes"
          hint="Optional notes about this purchase."
        >
          <textarea
            value={form.notes}
            onChange={(event) =>
              updateForm(
                "notes",
                event.target.value
              )
            }
            rows={3}
            style={{
              ...inputStyle,
              resize:
                "vertical" as const,
            }}
          />
        </FormField>

        {error && (
          <ErrorMessage
            message={error}
          />
        )}

        <ModalActions
          onCancel={onClose}
          saving={saving}
          submitLabel={order ? "Save Changes" : "Create Order"}
        />
      </form>
    </ModalShell>
  );
}

// ---------------------------------------------------------
// ORDER DETAIL MODAL
// ---------------------------------------------------------

function OrderDetailModal({
  inline = false,
  order,
  products,
  onClose,
  onChanged,
}: {
  inline?: boolean;
  order: Order;
  products: Product[];
  onClose: () => void;
  onChanged: (
    orderId: number
  ) => Promise<void>;
}) {
  const [showAddLine, setShowAddLine] =
    useState(false);

  const [editingLine, setEditingLine] = useState<OrderLine | null>(null);
  const [editingOrder, setEditingOrder] = useState(false);

  const [working, setWorking] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [landedCostView, setLandedCostView] =
    useState<LandedCostMethod>("STORED");

  const productCost =
    calculateProductCost(order);

  const additionalCost =
    calculateAdditionalCost(order);

  const total =
    productCost + additionalCost;

  const isDraft =
    order.status === "DRAFT";

  const landedCostAnalyses = isDraft ? null : {
    STORED: analyzeLandedCosts(order, "STORED"),
    BLEND: analyzeLandedCosts(order, "BLEND"),
    QUANTITY: analyzeLandedCosts(order, "QUANTITY"),
  };

  const activeLandedCostAnalysis =
    landedCostAnalyses?.[landedCostView] ?? null;

  async function removeLine(line: OrderLine) {
    if (!isDraft || !window.confirm("Remove this product line from the draft order?")) return;
    try {
      setWorking(true);
      setError(null);
      const response = await fetch(`/api/orders/${order.id}/lines/${line.id}`, {method: "DELETE"});
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Could not remove the product line.");
      }
      await onChanged(order.id);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not remove the product line.");
    } finally {
      setWorking(false);
    }
  }

  async function finalizeOrder() {
    if (!isDraft) {
      return;
    }

    if (!order.lines?.length) {
      setError(
        "Add at least one product before finalizing this order."
      );

      return;
    }

    const confirmed =
      window.confirm(
        `Finalize ${order.orderNumber}?\n\n` +
          `Total: ${money(productCost + additionalCost)}\n\n` +
          "This will deduct the full total from SEALED funds, create inventory batches, and lock this order. Finalized orders cannot be edited."
      );

    if (!confirmed) {
      return;
    }

    try {
      setWorking(true);
      setError(null);

      const response = await fetch(
        `/api/orders/${order.id}/finalize`,
        {
          method: "POST",
        }
      );

      const body =
        await response
          .json()
          .catch(() => null);

      if (!response.ok) {
        throw new Error(
          body?.error ??
            "Order could not be finalized."
        );
      }

      await onChanged(order.id);

      // Finalizing an order changes both sealed inventory and sealed funds.
      // Let the Command Center and other listening components refresh
      // immediately without requiring a full-page reload.
      window.dispatchEvent(
        new Event("business-data-changed")
      );
    } catch (error) {
      console.error(
        "Order finalization error:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Order could not be finalized."
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <ModalShell inline={inline}
      onClose={onClose}
      title={order.orderNumber}
      subtitle={`${formatDate(
        order.orderDate
      )} · ${
        order.status === "DRAFT"
          ? "Draft Order"
          : "Finalized Order"
      }`}
      wide
    >
      {isDraft && <button type="button" style={smallButtonStyle} disabled={working} onClick={() => setEditingOrder(true)}>Edit Order Information & Costs</button>}
      <div className="orders-summary-grid">
        <SummaryBox
          label="Product Cost"
          value={money(productCost)}
        />

        <SummaryBox
          label="Additional Costs"
          value={money(
            additionalCost
          )}
        />

        <SummaryBox
          label="Order Total"
          value={money(total)}
        />

        <SummaryBox
          label="Status"
          value={
            order.status === "DRAFT"
              ? "Draft"
              : "Finalized"
          }
        />
      </div>

      <div
        style={{
          marginTop: "24px",
        }}
      >
        <div
          className="orders-section-header"
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: "14px",
              }}
            >
              Products
            </h3>

            <p
              className="orders-description"
            >
              {order.lines?.length ??
                0}{" "}
              product{" "}
              {(order.lines?.length ??
                0) === 1
                ? "line"
                : "lines"}
            </p>
          </div>

          {isDraft && (
            <button
              type="button"
              style={
                smallButtonStyle
              }
              onClick={() =>
                setShowAddLine(true)
              }
            >
              + Add Product
            </button>
          )}
        </div>

        {!order.lines?.length ? (
          <div
            className="orders-empty"
          >
            No products have been added
            to this order yet.
          </div>
        ) : (
          <div
            style={{
              overflowX: "auto",
            }}
          >
            <table className="orders-table">
              <thead>
                <tr>
                  <TableHeader>
                    Product Purchased
                  </TableHeader>

                  <TableHeader>
                    Quantity Purchased
                  </TableHeader>

                  <TableHeader>
                    Purchase Price Each
                  </TableHeader>

                  <TableHeader>
                    Product Cost
                  </TableHeader>

                  <TableHeader>
                    Inventory Created
                  </TableHeader>

                  <TableHeader>
                    Landed Cost
                  </TableHeader>

                  <TableHeader>
                    Landed Cost per Sellable Unit
                  </TableHeader>
                  {isDraft && <TableHeader>Actions</TableHeader>}
                </tr>
              </thead>

              <tbody>
                {order.lines.map(
                  (line) => (
                    <tr
                      key={line.id}
                      className="orders-row"
                    >
                      <TableCell>
                        {getProductLabel(
                          line.purchasedProduct,
                          line.purchasedProductId,
                          products
                        )}
                      </TableCell>

                      <TableCell>
                        {line.quantityPurchased}
                      </TableCell>

                      <TableCell>
                        {/* Use the saved line total, not today's catalog price. */}
                        {line.quantityPurchased > 0
                          ? money(Number(line.productCost) / line.quantityPurchased)
                          : "\u2014"}
                      </TableCell>

                      <TableCell>
                        {money(line.productCost)}
                      </TableCell>

                      <TableCell>
                        {line.sellableQuantity}{" \u00d7 "}
                        {getProductLabel(
                          line.sellableProduct,
                          line.sellableProductId,
                          products
                        )}
                      </TableCell>

                      <TableCell>
                        {line.landedCost ===
                        null
                          ? "—"
                          : money(
                              line.landedCost
                            )}
                      </TableCell>

                      <TableCell>
                        {line.landedUnitCost ===
                        null
                          ? "—"
                          : money(
                              line.landedUnitCost
                            )}
                      </TableCell>
                      {isDraft && <TableCell>
                        <details className="orders-action-menu">
                          <summary aria-label="Product line actions">&hellip;</summary>
                          <div>
                            <button type="button" disabled={working} onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); setEditingLine(line); }}>Edit product</button>
                            <button type="button" className="orders-remove" disabled={working} onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); void removeLine(line); }}>Remove product</button>
                          </div>
                        </details>
                      </TableCell>}
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!isDraft && activeLandedCostAnalysis && landedCostAnalyses && (
        <section className="orders-landed-analysis" aria-labelledby={`landed-analysis-${order.id}`}>
          <div className="orders-landed-header">
            <div>
              <h3 id={`landed-analysis-${order.id}`}>Landed Cost Analysis</h3>
              <p>
                Stored is the actual recorded accounting cost. Blend and Quantity are read-only estimates.
              </p>
            </div>
            <div className="orders-landed-control" aria-label="Landed Cost View">
              <span>Landed Cost View</span>
              <div role="group">
                {(["STORED", "BLEND", "QUANTITY"] as LandedCostMethod[]).map(method => (
                  <button key={method} type="button" aria-pressed={landedCostView === method}
                    className={landedCostView === method ? "is-active" : ""}
                    onClick={() => setLandedCostView(method)}>
                    {method === "STORED" ? "Stored" : method === "BLEND" ? "50/50 Blend" : "Quantity"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="table-scroll">
            <table className="orders-table orders-landed-table">
              <thead><tr>
                <TableHeader>Product</TableHeader>
                <TableHeader>Sellable Qty</TableHeader>
                <TableHeader>Product Cost</TableHeader>
                <TableHeader>Allocated Shipping</TableHeader>
                <TableHeader>Total Landed Cost</TableHeader>
                <TableHeader>Landed / Unit</TableHeader>
                <TableHeader>Expected Sale Price</TableHeader>
                <TableHeader>Expected Profit / Unit</TableHeader>
                <TableHeader>Expected Margin</TableHeader>
                <TableHeader>Unit Cost Comparison</TableHeader>
              </tr></thead>
              <tbody>{order.lines.map((line, index) => {
                const analysis = activeLandedCostAnalysis.lines[index];
                const stored = landedCostAnalyses.STORED.lines[index];
                const blend = landedCostAnalyses.BLEND.lines[index];
                const quantity = landedCostAnalyses.QUANTITY.lines[index];
                const expectedPrice = line.sellableProduct?.expectedSalePrice ??
                  products.find(product => product.id === line.sellableProductId)?.expectedSalePrice ?? null;
                const expectedProfit = expectedPrice === null ? null : Number(expectedPrice) - analysis.landedUnitCost;
                const expectedMargin = expectedPrice === null || Number(expectedPrice) === 0
                  ? null : expectedProfit! / Number(expectedPrice);
                return <tr key={line.id}>
                  <TableCell>{getProductLabel(line.sellableProduct, line.sellableProductId, products)}</TableCell>
                  <TableCell>{line.sellableQuantity}</TableCell>
                  <TableCell>{money(line.productCost)}</TableCell>
                  <TableCell>{money(analysis.allocatedShipping)}</TableCell>
                  <TableCell>{money(analysis.landedCost)}</TableCell>
                  <TableCell>
                    <strong>{money(analysis.landedUnitCost)}</strong>
                    {analysis.differenceFromStoredUnitCost !== null && (
                      <span className={analysis.differenceFromStoredUnitCost >= 0 ? "orders-landed-delta is-up" : "orders-landed-delta is-down"}>
                        {analysis.differenceFromStoredUnitCost >= 0 ? "+" : ""}{money(analysis.differenceFromStoredUnitCost)} vs stored
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{expectedPrice === null ? "—" : money(expectedPrice)}</TableCell>
                  <TableCell>{expectedProfit === null ? "—" : money(expectedProfit)}</TableCell>
                  <TableCell>{expectedMargin === null ? "—" : `${(expectedMargin * 100).toFixed(1)}%`}</TableCell>
                  <TableCell><div className="orders-landed-comparison">
                    <span><em>Stored</em>{money(stored.landedUnitCost)}</span>
                    <span><em>50/50</em>{money(blend.landedUnitCost)}</span>
                    <span><em>Quantity</em>{money(quantity.landedUnitCost)}</span>
                  </div></TableCell>
                </tr>;
              })}</tbody>
            </table>
          </div>
          <div className={activeLandedCostAnalysis.reconciled ? "orders-landed-reconciliation" : "orders-landed-reconciliation is-error"}>
            <span>{landedCostView === "STORED" ? "Recorded accounting total" : "Analytical estimate"}</span>
            <strong>{money(activeLandedCostAnalysis.calculatedTotal)}</strong>
            <span>Order total {money(activeLandedCostAnalysis.expectedTotal)}</span>
            <span>{activeLandedCostAnalysis.reconciled ? "Reconciled to the cent" : `Difference ${money(activeLandedCostAnalysis.reconciliationDifference)}`}</span>
          </div>
        </section>
      )}

      <div className="orders-cost-breakdown">
        <CostRow
          label="Products"
          value={money(productCost)}
        />

        <CostRow
          label="Shipping"
          value={money(
            order.shippingCost
          )}
        />

        <CostRow
          label="Tariffs"
          value={money(
            order.tariffCost
          )}
        />

        <CostRow
          label="Other Costs"
          value={money(
            order.otherCost
          )}
        />

        <CostRow
          label="Adjustment"
          value={money(
            order.adjustment
          )}
        />

        <CostRow
          label="Total"
          value={money(total)}
          strong
        />
      </div>

      {order.notes && (
        <div
          style={{
            marginTop: "22px",
          }}
        >
          <span style={fieldLabelStyle}>
            NOTES
          </span>

          <p
            style={{
              margin:
                "7px 0 0",
              color: "#a7a7ad",
              fontSize: "12px",
              lineHeight: 1.6,
            }}
          >
            {order.notes}
          </p>
        </div>
      )}

      {error && (
        <ErrorMessage
          message={error}
        />
      )}

      <div
        style={{
          display: "flex",
          justifyContent:
            "flex-end",
          gap: "10px",
          marginTop: "26px",
          paddingTop: "20px",
          borderTop:
            "1px solid #24252a",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={
            secondaryButtonStyle
          }
        >
          Close
        </button>

        {isDraft && (
          <button
            type="button"
            className="primary-button"
            disabled={working}
            onClick={finalizeOrder}
          >
            {working
              ? "Finalizing..."
              : "Finalize Order"}
          </button>
        )}
      </div>

      {editingOrder && isDraft && (
        <NewOrderModal order={order} onClose={() => setEditingOrder(false)} onCreated={async () => {
          setEditingOrder(false);
          await onChanged(order.id);
        }} />
      )}
      {editingLine && isDraft && (
        <AddOrderLineModal order={order} products={products} line={editingLine}
          onClose={() => setEditingLine(null)} onAdded={async () => {
            setEditingLine(null);
            await onChanged(order.id);
          }} />
      )}
      {showAddLine && isDraft && (
        <AddOrderLineModal
          order={order}
          products={products}
          onClose={() =>
            setShowAddLine(false)
          }
          onAdded={async () => {
            setShowAddLine(false);

            await onChanged(
              order.id
            );
          }}
        />
      )}
    </ModalShell>
  );
}

// ---------------------------------------------------------
// ADD ORDER LINE
// ---------------------------------------------------------

function AddOrderLineModal({
  order,
  line,
  products,
  onClose,
  onAdded,
}: {
  order: Order;
  line?: OrderLine;
  products: Product[];
  onClose: () => void;
  onAdded: () => Promise<void>;
}) {
  const activeProducts =
    products.filter(
      (product) => product.active && product.type === "SEALED"
    );

  const [form, setForm] = useState<NewLineForm>({
    purchasedProductId: (line?.purchasedProductId ?? activeProducts[0]?.id)?.toString() ?? "",
    quantityPurchased: line?.quantityPurchased.toString() ?? "1",
    priceEach: line ? (Number(line.productCost) / line.quantityPurchased).toFixed(2) : "",
  });

  let inventoryPreview = null;
  let conversionError: string | null = null;
  try {
    inventoryPreview = resolveOrderInventory(
      products, Number(form.purchasedProductId), Number(form.quantityPurchased)
    );
  } catch (error) {
    conversionError = error instanceof Error ? error.message : "Invalid conversion.";
  }
  // Older lines may have totals that do not divide into an exact cent price.
  // Preserve that total unless the user changes quantity or price.
  const preserveLineTotal = line !== undefined &&
    form.quantityPurchased === line.quantityPurchased.toString() &&
    form.priceEach === (Number(line.productCost) / line.quantityPurchased).toFixed(2);
  const productCost = preserveLineTotal ? Number(line.productCost)
    : Math.round(Number(form.priceEach) * 100) * Number(form.quantityPurchased) / 100;

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  function updateForm<
    K extends keyof NewLineForm,
  >(
    field: K,
    value: NewLineForm[K]
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const purchasedProductId =
      Number(
        form.purchasedProductId
      );

    const quantityPurchased = Number(form.quantityPurchased);
    const priceEach = Number(form.priceEach);
    if (conversionError) {
      setError(conversionError);
      return;
    }
    if (!Number.isFinite(priceEach) || priceEach <= 0) {
      setError("Purchase price each must be greater than zero.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const response = await fetch(
        line ? `/api/orders/${order.id}/lines/${line.id}` : `/api/orders/${order.id}/lines`,
        {
          method: line ? "PATCH" : "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            purchasedProductId,
            quantityPurchased,
            ...(preserveLineTotal ? {productCost: line.productCost} : {priceEach}),
          }),
        }
      );

      const body =
        await response
          .json()
          .catch(() => null);

      if (!response.ok) {
        throw new Error(
          body?.error ??
            "Product could not be added to the order."
        );
      }

      await onAdded();
    } catch (error) {
      console.error(
        "Order line creation error:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Product could not be added."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      onClose={onClose}
      title={line ? "Edit Product Line" : "Add Product"}
      subtitle={`${line ? "Update" : "Add"} a product line in ${order.orderNumber}. Inventory conversion uses the current catalog.`}
    >
      <form onSubmit={handleSubmit}>
        <FormField
          label="Purchased Product"
          hint="The product exactly as it was purchased."
        >
          <select
            value={
              form.purchasedProductId
            }
            onChange={(event) =>
              updateForm(
                "purchasedProductId", event.target.value
              )
            }
            style={inputStyle}
          >
            {activeProducts.map(
              (product) => (
                <option
                  key={product.id}
                  value={product.id}
                >
                  {product.itemId} —{" "}
                  {product.name}
                </option>
              )
            )}
          </select>
        </FormField>

        <div style={twoColumnStyle}>
          <FormField
            label="Purchased Quantity"
          >
            <input
              type="number"
              min="1"
              step="1"
              value={
                form.quantityPurchased
              }
              onChange={(event) =>
                updateForm(
                  "quantityPurchased",
                  event.target.value
                )
              }
              style={inputStyle}
            />
          </FormField>

          <MoneyField
            label="Purchase Price Each"
            value={form.priceEach}
            onChange={(value) =>
              updateForm(
                "priceEach",
                value
              )
            }
          />
        </div>

        <div style={twoColumnStyle}>
          <SummaryBox label="Total Product Cost" value={money(Number.isFinite(productCost) ? productCost : 0)} />
          <SummaryBox
            label="Inventory Created on Finalization"
            value={inventoryPreview
              ? `${inventoryPreview.quantity} \u00d7 ${inventoryPreview.product.name}`
              : "Conversion unavailable"}
          />
        </div>
        {conversionError && <ErrorMessage message={conversionError} />}

        {error && (
          <ErrorMessage
            message={error}
          />
        )}

        <ModalActions
          onCancel={onClose}
          saving={saving}
          submitLabel={line ? "Save Changes" : "Add Product"}
        />
      </form>
    </ModalShell>
  );
}

// ---------------------------------------------------------
// CALCULATIONS
// ---------------------------------------------------------

function calculateProductCost(
  order: Order
) {
  return (
    order.lines?.reduce(
      (total, line) =>
        total +
        Number(
          line.productCost ?? 0
        ),
      0
    ) ?? 0
  );
}

function calculateAdditionalCost(
  order: Order
) {
  return (
    Number(
      order.shippingCost ?? 0
    ) +
    Number(
      order.tariffCost ?? 0
    ) +
    Number(
      order.otherCost ?? 0
    ) +
    Number(
      order.adjustment ?? 0
    )
  );
}

function calculateOrderTotal(
  order: Order
) {
  return (
    calculateProductCost(order) +
    calculateAdditionalCost(order)
  );
}

function numberOrZero(
  value: string
) {
  if (value.trim() === "") {
    return 0;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function getProductLabel(
  includedProduct:
    | Product
    | undefined,
  productId: number,
  products: Product[]
) {
  const product =
    includedProduct ??
    products.find(
      (item) =>
        item.id === productId
    );

  if (!product) {
    return `Product #${productId}`;
  }

  return `${product.itemId} — ${product.name}`;
}

// ---------------------------------------------------------
// SHARED ORDER UI
// ---------------------------------------------------------

function OrderMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="metric-card">
      <span className="metric-label">
        {label}
      </span>

      <strong className="metric-value">
        {value}
      </strong>

      <span className="metric-detail">
        {detail}
      </span>
    </article>
  );
}

function FilterButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active ? "orders-filter is-active" : "orders-filter"}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

function OrderStatusBadge({
  status,
}: {
  status: OrderStatus;
}) {
  const finalized =
    status === "FINALIZED";

  return (
    <span
      className={finalized ? "orders-status is-finalized" : "orders-status is-draft"}
    >
      {finalized
        ? "Finalized"
        : "Draft"}
    </span>
  );
}

function TableHeader({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <th className="orders-th">
      {children}
    </th>
  );
}

function TableCell({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <td className="orders-td">
      {children}
    </td>
  );
}

function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        marginBottom: "12px",
      }}
    >
      <label style={fieldLabelStyle}>
        {label}
      </label>

      {children}

      {hint && (
        <p
          style={{
            margin: "6px 0 0",
            color: "#696a71",
            fontSize: "11px",
            lineHeight: 1.5,
          }}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

function MoneyField({
  label,
  value,
  onChange,
  allowNegative = false,
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
  allowNegative?: boolean;
}) {
  return (
    <FormField label={label}>
      <div
        style={{
          position: "relative",
        }}
      >
        <span style={currencyStyle}>
          $
        </span>

        <input
          type="number"
          min={
            allowNegative
              ? undefined
              : "0"
          }
          step="0.01"
          value={value}
          onChange={(event) =>
            onChange(
              event.target.value
            )
          }
          placeholder="0.00"
          style={{
            ...inputStyle,
            paddingLeft: "28px",
          }}
        />
      </div>
    </FormField>
  );
}

function ModalShell({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
  inline = false,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  inline?: boolean;
}) {
  if (inline) return <section className="inline-order-detail" aria-label={title}>
    <header className="orders-modal-header"><div><h3>{title}</h3><p>{subtitle}</p></div></header>
    <div className="inline-order-body">{children}</div>
  </section>;
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <div
        className="modal-surface orders-modal"
        style={{
          maxWidth: wide
            ? "920px"
            : "620px",
        }}
      >
        <div className="orders-modal-header">
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: "18px",
              }}
            >
              {title}
            </h2>

            <p
              style={{
                margin: "6px 0 0",
                color: "#777880",
                fontSize: "12px",
              }}
            >
              {subtitle}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={closeButtonStyle}
          >
            ×
          </button>
        </div>

        <div
          style={{
            padding: "24px",
            maxHeight: "75vh",
            overflowY: "auto",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function ModalActions({
  onCancel,
  saving,
  submitLabel,
}: {
  onCancel: () => void;
  saving: boolean;
  submitLabel: string;
}) {
  return (
    <div className="orders-modal-actions">
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        style={
          secondaryButtonStyle
        }
      >
        Cancel
      </button>

      <button
        type="submit"
        className="primary-button"
        disabled={saving}
      >
        {saving
          ? "Saving..."
          : submitLabel}
      </button>
    </div>
  );
}

function ErrorMessage({
  message,
}: {
  message: string;
}) {
  return (
    <div className="orders-error">
      {message}
    </div>
  );
}

function SummaryBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="orders-summary-box">
      <span
        style={{
          color: "#777880",
          fontSize: "10px",
          fontWeight: 700,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>

      <strong
        style={{
          marginTop: "6px",
          color: "#e5e5e7",
          fontSize: "17px",
        }}
      >
        {value}
      </strong>
    </div>
  );
}

function CostRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent:
          "space-between",
        gap: "20px",
        padding: "8px 0",

        borderTop: strong
          ? "1px solid #303137"
          : "none",

        marginTop: strong
          ? "5px"
          : 0,

        paddingTop: strong
          ? "13px"
          : "8px",
      }}
    >
      <span
        style={{
          color: strong
            ? "#d0d0d3"
            : "#777880",

          fontSize: "12px",
          fontWeight: strong
            ? 700
            : 400,
        }}
      >
        {label}
      </span>

      <strong
        style={{
          color: "#e5e5e7",
          fontSize: "12px",
        }}
      >
        {value}
      </strong>
    </div>
  );
}

function PageMessage({
  icon,
  title,
  message,
}: {
  icon: string;
  title: string;
  message: string;
}) {
  return (
    <div className="page-placeholder">
      <div className="placeholder-icon">
        {icon}
      </div>

      <h2>{title}</h2>

      <p>{message}</p>
    </div>
  );
}

// ---------------------------------------------------------
// STYLES
// ---------------------------------------------------------

const smallButtonStyle = {
  boxSizing:
    "border-box" as const,
  padding: "7px 10px",
  border:
    "1px solid #303137",
  borderRadius: "7px",
  background: "#1d1e23",
  color: "#c8c8cd",
  cursor: "pointer",
  fontSize: "11px",
  fontWeight: 650,
};


const fieldLabelStyle = {
  display: "block",
  marginBottom: "7px",
  color: "#d0d0d3",
  fontSize: "12px",
  fontWeight: 650,
};

const twoColumnStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(200px, 1fr))",
  gap: "14px",
};

const currencyStyle = {
  position:
    "absolute" as const,
  left: "13px",
  top: "50%",
  transform:
    "translateY(-50%)",
  color: "#777880",
};

const closeButtonStyle = {
  border: 0,
  background: "transparent",
  color: "#777880",
  cursor: "pointer",
  fontSize: "20px",
};
