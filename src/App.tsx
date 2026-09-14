import {
  useEffect,
  useState,
} from "react";

import type {
  FormEvent,
  ReactNode,
} from "react";

import "./App.css";
import FundsPanel from "./client/components/FundsPanel";
import OrdersPage from "./client/pages/OrdersPage";
import InventoryPage from "./client/pages/InventoryPage";
import SalesPage from "./client/pages/SalesPage";
import ShowsPage from "./client/pages/ShowsPage";
import { matchingBoxName } from "./shared/caseProduct";
import ActiveShowPanel from "./client/components/ActiveShowPanel";

// ---------------------------------------------------------
// TYPES
// ---------------------------------------------------------

type Page =
  | "dashboard"
  | "products"
  | "orders"
  | "inventory"
  | "sales"
  | "shows";

type ProductUnitType = "CASE" | "BOX" | "ITEM";

type Product = {
  id: number;
  itemId: string;
  name: string;
  type: "SEALED" | "SINGLE";
  unitType: ProductUnitType;
  parentProductId: number | null;
  quantityPerParent: number | null;
  sellable: boolean;
  active: boolean;
  expectedSalePrice: string | number | null;
  createdAt: string;
  updatedAt: string;
};

type InventoryItem = {
  productId: number;
  itemId: string;
  productName: string;
  unitsReceived: number;
  unitsSold: number;
  unitsOnHand: number;
  inventoryValue: string | number;
  expectedSalePrice: string | number | null;
  retailValue: string | number;
  potentialGrossProfit: string | number;
  potentialGrossMargin: number;
  batchCount: number;
};


type ApiStatus =
  | "loading"
  | "online"
  | "offline";

type NewProductForm = {
  itemId: string;
  name: string;
  type: "SEALED" | "SINGLE";
  unitType: ProductUnitType;
  parentProductId: string;
  quantityPerParent: string;
  boxItemId: string;
  boxesPerCase: string;
  boxExpectedSalePrice: string;
  expectedSalePrice: string;
  sellable: boolean;
};

type ProductFilter =
  | "active"
  | "inactive"
  | "all";

// ---------------------------------------------------------
// NAVIGATION
// ---------------------------------------------------------

const navigation: {
  id: Page;
  label: string;
  icon: string;
}[] = [
  {
    id: "dashboard",
    label: "Command Center",
    icon: "▦",
  },
  {
    id: "products",
    label: "Products",
    icon: "◇",
  },
  {
    id: "orders",
    label: "Orders",
    icon: "▤",
  },
  {
    id: "inventory",
    label: "Inventory",
    icon: "▣",
  },
  {
    id: "sales",
    label: "Sales",
    icon: "$",
  },
  {
    id: "shows",
    label: "Shows",
    icon: "★",
  },
];

// ---------------------------------------------------------
// FORMATTERS
// ---------------------------------------------------------

function money(
  value: string | number | null | undefined
) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value ?? 0));
}

// ---------------------------------------------------------
// APP
// ---------------------------------------------------------

function App() {
  const [activePage, setActivePage] =
    useState<Page>("dashboard");

  const [apiStatus, setApiStatus] =
    useState<ApiStatus>("loading");

  const [inventory, setInventory] =
    useState<InventoryItem[]>([]);



  const [dashboardLoading, setDashboardLoading] =
    useState(true);

  const [dashboardError, setDashboardError] =
    useState<string | null>(null);

  // Command Center workflows stay on the Command Center.
  // Each quick action mounts the existing page workflow in modal-only mode
  // instead of navigating away and duplicating business logic.
  const [
    commandAction,
    setCommandAction,
  ] = useState<
    "NEW_ORDER" | "RECORD_SALE" | null
  >(null);

  const currentPage =
    navigation.find(
      (item) => item.id === activePage
    ) ?? navigation[0];

  // Load the data needed by the main dashboard.
  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        setDashboardLoading(true);
        setDashboardError(null);

        const [healthResponse, inventoryResponse] =
          await Promise.all([
            fetch("/api/health"),
            fetch("/api/inventory"),
          ]);

        if (!healthResponse.ok) {
          throw new Error(
            "The API health check failed."
          );
        }

        if (!inventoryResponse.ok) {
          throw new Error(
            "Inventory data could not be loaded."
          );
        }

        if (cancelled) {
          return;
        }

        setApiStatus("online");

        setInventory(
          await inventoryResponse.json()
        );
      } catch (error) {
        console.error(
          "Dashboard loading error:",
          error
        );

        if (cancelled) {
          return;
        }

        setApiStatus("offline");

        setDashboardError(
          error instanceof Error
            ? error.message
            : "Dashboard data could not be loaded."
        );
      } finally {
        if (!cancelled) {
          setDashboardLoading(false);
        }
      }
    }

    // Shared business workflows dispatch this event after data changes.
    // Refresh only the inventory snapshot here so the Command Center stays
    // visible instead of flashing back to its full loading screen.
    async function refreshInventorySnapshot() {
      try {
        const inventoryResponse =
          await fetch("/api/inventory");

        if (!inventoryResponse.ok) {
          throw new Error(
            "Inventory data could not be refreshed."
          );
        }

        const inventoryData =
          await inventoryResponse.json();

        if (!cancelled) {
          setInventory(inventoryData);
        }
      } catch (error) {
        console.error(
          "Command Center inventory refresh error:",
          error
        );
      }
    }

    function handleBusinessDataChanged() {
      void refreshInventorySnapshot();
    }

    void loadDashboard();

    window.addEventListener(
      "business-data-changed",
      handleBusinessDataChanged
    );

    return () => {
      cancelled = true;

      window.removeEventListener(
        "business-data-changed",
        handleBusinessDataChanged
      );
    };
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            DR
          </div>

          <div className="brand-text">
            <span className="brand-name">
              Double Rare
            </span>

            <span className="brand-subtitle">
              Collectibles
            </span>
          </div>
        </div>

        <nav className="navigation">
          <span className="nav-section-label">
            BUSINESS
          </span>

          {navigation.map((item) => (
            <button
              key={item.id}
              type="button"
              className={
                activePage === item.id
                  ? "nav-item active"
                  : "nav-item"
              }
              onClick={() =>
                setActivePage(item.id)
              }
            >
              <span className="nav-icon">
                {item.icon}
              </span>

              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div
            className={
              apiStatus === "online"
                ? "status-dot"
                : "status-dot status-offline"
            }
          />

          <div>
            <span className="status-title">
              Local Database
            </span>

            <span className="status-subtitle">
              {apiStatus === "online"
                ? "Connected"
                : apiStatus === "loading"
                  ? "Connecting..."
                  : "Disconnected"}
            </span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              DOUBLE RARE COLLECTIBLES
            </p>

            <h1>{currentPage.label}</h1>
          </div>

          <div className="topbar-actions">
            <div className="api-status">
              <span
                className={
                  apiStatus === "online"
                    ? "status-dot"
                    : "status-dot status-offline"
                }
              />

              {apiStatus === "online"
                ? "API Online"
                : apiStatus === "loading"
                  ? "Connecting"
                  : "API Offline"}
            </div>
          </div>
        </header>

        <section className="page-content">
          {activePage === "dashboard" && (
            <Dashboard
              inventory={inventory}
              loading={dashboardLoading}
              error={dashboardError}
              onNewOrder={() =>
                setCommandAction("NEW_ORDER")
              }
              onRecordSale={() =>
                setCommandAction("RECORD_SALE")
              }
            />
          )}

          {activePage === "products" && (
            <ProductsPage />
          )}
          {activePage === "orders" && (
          <OrdersPage />
          )}
          {activePage === "inventory" && <InventoryPage />}
          {activePage === "sales" && <SalesPage />}
          {activePage === "shows" && <ShowsPage />}

          {activePage !== "dashboard" &&
            activePage !== "inventory" &&
            activePage !== "sales" &&
            activePage !== "shows" &&
            activePage !== "products" &&
            activePage !== "orders" && (
              <PagePlaceholder
                title={currentPage.label}
              />
            )}
        </section>

        {commandAction === "NEW_ORDER" && (
          <OrdersPage
            initialOpenNewOrder
            quickActionOnly
            onQuickActionClose={() =>
              setCommandAction(null)
            }
          />
        )}

        {commandAction === "RECORD_SALE" && (
          <SalesPage
            initialOpenRecordSale
            quickActionOnly
            onQuickActionClose={() =>
              setCommandAction(null)
            }
          />
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------

function Dashboard({
  inventory,
  loading,
  error,
  onNewOrder,
  onRecordSale,
}: {
  inventory: InventoryItem[];
  loading: boolean;
  error: string | null;
  onNewOrder: () => void;
  onRecordSale: () => void;
}) {
  const totalInventoryValue = inventory.reduce(
    (total, item) => total + Number(item.inventoryValue),
    0
  );

  const totalRetailValue = inventory.reduce(
    (total, item) => total + Number(item.retailValue),
    0
  );

  const totalUnitsOnHand = inventory.reduce(
    (total, item) => total + item.unitsOnHand,
    0
  );

  const productsInInventory = inventory.filter(
    (item) => item.unitsOnHand > 0
  ).length;

  if (loading) {
    return (
      <LoadingPage
        icon="DR"
        title="Loading Command Center"
        message="Retrieving current business data..."
      />
    );
  }

  if (error) {
    return (
      <LoadingPage
        icon="!"
        title="Command Center Unavailable"
        message={error}
      />
    );
  }

  return (
    <>
      <div
        className="page-heading"
        style={{ marginBottom: "16px" }}
      >
        <div>
          <h2>Command Center</h2>
          <p>
            Run the day-to-day business from one place.
          </p>
        </div>
      </div>

      {/* Keep the two most common non-Show workflows easy to reach without
          stretching them across the entire Command Center. */}
      <section style={{ marginBottom: "18px" }}>
        <CommandCenterSectionHeader
          title="Quick Actions"
        />

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          <CommandAction
            icon="+"
            title="New Order"
            detail="Buy sealed inventory"
            onClick={onNewOrder}
          />

          <CommandAction
            icon="$"
            title="Record Sale"
            detail="Sell sealed product"
            onClick={onRecordSale}
          />
        </div>
      </section>

      {/* Shows are the primary operational workflow, so keep the current
          Show state near the top of Command Center. */}
      <section style={{ marginBottom: "20px" }}>
        <CommandCenterSectionHeader
          title="Show Operations"
          detail="Start a Show or continue the active Show"
        />

        <ActiveShowPanel />
      </section>

      <section>
        <CommandCenterSectionHeader
          title="Business Position"
          detail="Funds and sealed inventory"
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 1fr)",
            gap: "14px",
            alignItems: "stretch",
          }}
        >
          <div id="command-center-funds">
            <FundsPanel />
          </div>

          <div
            className="panel"
            style={{
              height: "100%",
              boxSizing: "border-box",
            }}
          >
            <div className="panel-header">
              <div>
                <h3>Sealed Inventory</h3>
                <p>Current inventory position</p>
              </div>
            </div>

            <div style={{ padding: "18px 20px" }}>
              <DashboardRow
                label="Inventory Cost Value"
                value={money(totalInventoryValue)}
              />
              <DashboardRow
                label="Retail Value"
                value={money(totalRetailValue)}
              />
              <DashboardRow
                label="Potential Gross Profit"
                value={money(totalRetailValue - totalInventoryValue)}
              />
              <DashboardRow
                label="Units On Hand"
                value={String(totalUnitsOnHand)}
              />
              <DashboardRow
                label="Products In Stock"
                value={String(productsInInventory)}
                last
              />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function CommandCenterSectionHeader({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: "10px",
        marginBottom: "9px",
      }}
    >
      <span
        style={{
          color: "#9a9ba2",
          fontSize: "11px",
          fontWeight: 800,
          letterSpacing: "0.09em",
          textTransform: "uppercase",
        }}
      >
        {title}
      </span>

      {detail && (
        <span
          style={{
            color: "#5f6067",
            fontSize: "11px",
          }}
        >
          {detail}
        </span>
      )}
    </div>
  );
}

function CommandAction({
  icon,
  title,
  detail,
  onClick,
}: {
  icon: string;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        width: "220px",
        maxWidth: "100%",
        minHeight: "58px",
        padding: "10px 13px",
        border: "1px solid #2f6f4a",
        borderRadius: "9px",
        background: "#163a28",
        color: "#f3fff8",
        cursor: "pointer",
        textAlign: "left",
        boxShadow: "0 1px 0 rgba(255, 255, 255, 0.03) inset",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "grid",
          placeItems: "center",
          width: "34px",
          height: "34px",
          flex: "0 0 34px",
          border: "1px solid #3d8159",
          borderRadius: "8px",
          background: "#205338",
          color: "#d9ffe8",
          fontSize: "17px",
          fontWeight: 900,
        }}
      >
        {icon}
      </span>

      <span style={{ minWidth: 0 }}>
        <strong
          style={{
            display: "block",
            color: "#f5fff8",
            fontSize: "14px",
            lineHeight: 1.2,
            fontWeight: 800,
          }}
        >
          {title}
        </strong>
        <span
          style={{
            display: "block",
            marginTop: "3px",
            color: "#a9cbb6",
            fontSize: "11px",
            lineHeight: 1.25,
          }}
        >
          {detail}
        </span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------
// PRODUCTS PAGE
// ---------------------------------------------------------

function ProductsPage() {
  const [products, setProducts] =
    useState<Product[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [actionError, setActionError] =
    useState<string | null>(null);

  const [showAddProduct, setShowAddProduct] =
    useState(false);

  const [editingProduct, setEditingProduct] =
    useState<Product | null>(null);

  const [openMenuId, setOpenMenuId] =
    useState<number | null>(null);

  const [filter, setFilter] =
    useState<ProductFilter>("active");

  async function loadProducts() {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        "/api/products"
      );

      if (!response.ok) {
        throw new Error(
          "Products could not be loaded."
        );
      }

      setProducts(
        await response.json()
      );
    } catch (error) {
      console.error(
        "Product loading error:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Products could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProducts();
  }, []);

  const activeProducts =
    products.filter(
      (product) => product.active
    );

  const inactiveProducts =
    products.filter(
      (product) => !product.active
    );

  const filteredProducts =
    products.filter((product) => {
      if (filter === "active") {
        return product.active;
      }

      if (filter === "inactive") {
        return !product.active;
      }

      return true;
    });

  async function setProductActiveState(
    product: Product
  ) {
    try {
      setActionError(null);
      setOpenMenuId(null);

      const action = product.active
        ? "deactivate"
        : "reactivate";

      const response = await fetch(
        `/api/products/${product.id}/${action}`,
        {
          method: "PATCH",
        }
      );

      if (!response.ok) {
        const responseBody =
          await response
            .json()
            .catch(() => null);

        throw new Error(
          responseBody?.error ??
            `Product could not be ${action}d.`
        );
      }

      await loadProducts();
    } catch (error) {
      console.error(
        "Product status update error:",
        error
      );

      setActionError(
        error instanceof Error
          ? error.message
          : "Product status could not be updated."
      );
    }
  }

  if (loading) {
    return (
      <LoadingPage
        icon="◇"
        title="Loading Products"
        message="Retrieving the product catalog..."
      />
    );
  }

  if (error) {
    return (
      <LoadingPage
        icon="!"
        title="Products Unavailable"
        message={error}
      />
    );
  }

  return (
    <>
      <div
        className="page-heading"
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems: "center",
          gap: "20px",
        }}
      >
        <div>
          <h2>Product Catalog</h2>

          <p>
            Manage the products used by
            orders, inventory, and sales.
          </p>
        </div>

        <button
          type="button"
          className="primary-button"
          onClick={() => {
            setActionError(null);
            setShowAddProduct(true);
          }}
        >
          + Add Product
        </button>
      </div>

      <div
        className="metric-grid"
        style={{
          marginBottom: "18px",
        }}
      >
        <MetricCard
          label="Total Products"
          value={String(
            products.length
          )}
          detail={`${activeProducts.length} active`}
        />

        <MetricCard
          label="Sealed Products"
          value={String(
            products.filter(
              (product) =>
                product.type === "SEALED"
            ).length
          )}
          detail="Sealed catalog items"
        />

        <MetricCard
          label="Sellable Products"
          value={String(
            activeProducts.filter(
              (product) =>
                product.sellable
            ).length
          )}
          detail="Active and available for sales"
        />

        <MetricCard
          label="Inactive Products"
          value={String(
            inactiveProducts.length
          )}
          detail="Preserved for history"
        />
      </div>

      <div className="panel">
        <div
          className="panel-header"
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "center",
            gap: "18px",
          }}
        >
          <div>
            <h3>Products</h3>

            <p>
              {filteredProducts.length}{" "}
              {filter === "all"
                ? "total"
                : filter}{" "}
              {filteredProducts.length === 1
                ? "product"
                : "products"}
            </p>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px",
              border:
                "1px solid #2b2c31",
              borderRadius: "9px",
              background: "#111216",
            }}
          >
            {(
              [
                ["active", "Active"],
                ["inactive", "Inactive"],
                ["all", "All"],
              ] as const
            ).map(
              ([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setFilter(value);
                    setOpenMenuId(null);
                  }}
                  style={{
                    padding: "7px 11px",
                    border: 0,
                    borderRadius: "6px",
                    background:
                      filter === value
                        ? "#2a2b31"
                        : "transparent",
                    color:
                      filter === value
                        ? "#ededf0"
                        : "#777880",
                    cursor: "pointer",
                    fontSize: "11px",
                    fontWeight: 700,
                  }}
                >
                  {label}
                </button>
              )
            )}
          </div>
        </div>

        {actionError && (
          <div
            style={{
              margin:
                "16px 20px 0",
              padding:
                "11px 13px",
              border:
                "1px solid rgba(220, 70, 70, 0.25)",
              borderRadius: "8px",
              background:
                "rgba(220, 70, 70, 0.08)",
              color: "#e47b7b",
              fontSize: "12px",
            }}
          >
            {actionError}
          </div>
        )}

        {filteredProducts.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">
              ◇
            </span>

            <strong>
              No {filter === "all" ? "" : filter} products
            </strong>

            <p>
              {filter === "active"
                ? "Add a product or reactivate an inactive product."
                : filter === "inactive"
                  ? "Products you deactivate will appear here."
                  : "Add your first product to begin building the catalog."}
            </p>
          </div>
        ) : (
          <div
            style={{
              overflowX: "auto",
              overflowY: "visible",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse:
                  "collapse",
                minWidth: "880px",
              }}
            >
              <thead>
                <tr>
                  <ProductHeader>
                    Item ID
                  </ProductHeader>

                  <ProductHeader>
                    Product
                  </ProductHeader>

                  <ProductHeader>
                    Type
                  </ProductHeader>

                  <ProductHeader>
                    Unit Type
                  </ProductHeader>

                  <ProductHeader>
                    Conversion
                  </ProductHeader>

                  <ProductHeader>
                    Expected Price
                  </ProductHeader>

                  <ProductHeader>
                    Sellable
                  </ProductHeader>

                  <ProductHeader>
                    Status
                  </ProductHeader>

                  <ProductHeader>
                    Actions
                  </ProductHeader>
                </tr>
              </thead>

              <tbody>
                {filteredProducts.map(
                  (product) => (
                    <tr
                      key={product.id}
                      style={{
                        borderTop:
                          "1px solid #24252a",
                        opacity:
                          product.active
                            ? 1
                            : 0.72,
                      }}
                    >
                      <ProductCell>
                        <span
                          style={{
                            fontFamily:
                              "monospace",
                            color:
                              "#b8b8bd",
                          }}
                        >
                          {product.itemId}
                        </span>
                      </ProductCell>

                      <ProductCell>
                        <strong
                          style={{
                            color:
                              "#e5e5e7",
                          }}
                        >
                          {product.name}
                        </strong>
                      </ProductCell>

                      <ProductCell>
                        {product.type}
                      </ProductCell>

                      <ProductCell>
                        {product.unitType}
                      </ProductCell>

                      <ProductCell>
                        {product.parentProductId !== null
                          ? `${product.quantityPerParent ?? "?"} per ${products.find(
                              (parent) => parent.id === product.parentProductId
                            )?.itemId ?? "unknown parent"}`
                          : products.filter(
                              (child) => child.parentProductId === product.id
                            ).map(
                              (child) => `${child.quantityPerParent ?? "?"} × ${child.itemId}`
                            ).join(", ") || "—"}
                      </ProductCell>

                      <ProductCell>
                        {product.expectedSalePrice ===
                        null
                          ? "—"
                          : money(
                              product.expectedSalePrice
                            )}
                      </ProductCell>

                      <ProductCell>
                        <StatusBadge
                          active={
                            product.sellable
                          }
                          activeText="Yes"
                          inactiveText="No"
                        />
                      </ProductCell>

                      <ProductCell>
                        <StatusBadge
                          active={
                            product.active
                          }
                          activeText="Active"
                          inactiveText="Inactive"
                        />
                      </ProductCell>

                      <ProductCell>
                        <ProductActionsMenu
                          product={product}
                          open={
                            openMenuId ===
                            product.id
                          }
                          onToggle={() =>
                            setOpenMenuId(
                              openMenuId ===
                                product.id
                                ? null
                                : product.id
                            )
                          }
                          onEdit={() => {
                            setOpenMenuId(null);
                            setActionError(null);
                            setEditingProduct(
                              product
                            );
                          }}
                          onToggleActive={() =>
                            setProductActiveState(
                              product
                            )
                          }
                        />
                      </ProductCell>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAddProduct && (
        <ProductModal
          mode="add"
          products={products}
          onClose={() =>
            setShowAddProduct(false)
          }
          onSaved={async () => {
            setShowAddProduct(false);
            await loadProducts();
          }}
        />
      )}

      {editingProduct && (
        <ProductModal
          mode="edit"
          products={products}
          product={editingProduct}
          onClose={() =>
            setEditingProduct(null)
          }
          onSaved={async () => {
            setEditingProduct(null);
            await loadProducts();
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------
// PRODUCT ACTIONS MENU
// ---------------------------------------------------------

function ProductActionsMenu({
  product,
  open,
  onToggle,
  onEdit,
  onToggleActive,
}: {
  product: Product;
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
}) {
  return (
    <div
      style={{
        position: "relative",
        display: "inline-block",
      }}
    >
      <button
        type="button"
        aria-label={`Actions for ${product.name}`}
        aria-expanded={open}
        onClick={onToggle}
        style={{
          width: "32px",
          height: "30px",
          border:
            "1px solid #303137",
          borderRadius: "7px",
          background: open
            ? "#26272d"
            : "#1a1b20",
          color: "#b8b8bd",
          cursor: "pointer",
          fontSize: "18px",
          lineHeight: 1,
        }}
      >
        ⋯
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "36px",
            zIndex: 20,
            width: "150px",
            padding: "6px",
            border:
              "1px solid #303137",
            borderRadius: "9px",
            background: "#18191e",
            boxShadow:
              "0 14px 35px rgba(0, 0, 0, 0.45)",
          }}
        >
          <button
            type="button"
            onClick={onEdit}
            style={menuItemStyle}
          >
            Edit product
          </button>

          <button
            type="button"
            onClick={onToggleActive}
            style={{
              ...menuItemStyle,
              color: product.active
                ? "#e4a0a0"
                : "#7fd18d",
            }}
          >
            {product.active
              ? "Deactivate"
              : "Reactivate"}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------
// PRODUCT MODAL
// ---------------------------------------------------------

function ProductModal({
  mode,
  product,
  products,
  onClose,
  onSaved,
}: {
  mode: "add" | "edit";
  product?: Product;
  products: Product[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const isEditing = mode === "edit";
  const existingBox = products.find((child) => child.parentProductId === product?.id);

  const [form, setForm] =
    useState<NewProductForm>({
      itemId: product?.itemId ?? "",
      name: product?.name ?? "",
      type: product?.type ?? "SEALED",
      unitType: product?.unitType ?? "BOX",
      parentProductId: product?.parentProductId?.toString() ?? "",
      quantityPerParent: product?.quantityPerParent?.toString() ?? "",
      boxItemId: existingBox?.itemId ?? "",
      boxesPerCase: existingBox?.quantityPerParent?.toString() ?? "",
      boxExpectedSalePrice: existingBox?.expectedSalePrice?.toString() ?? "",
      expectedSalePrice:
        product?.expectedSalePrice ===
          null ||
        product?.expectedSalePrice ===
          undefined
          ? ""
          : String(
              product.expectedSalePrice
            ),
      sellable:
        product?.sellable ?? true,
    });

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  function updateForm<
    K extends keyof NewProductForm,
  >(
    field: K,
    value: NewProductForm[K]
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "unitType" && value === "CASE" ? {type: "SEALED" as const} : {}),
    }));
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const itemId = form.itemId.trim();
    const name = form.name.trim();

    if (form.unitType === "CASE" && (
      !form.boxItemId.trim() || !Number.isSafeInteger(Number(form.boxesPerCase)) ||
      Number(form.boxesPerCase) <= 0
    )) {
      setError("Enter a Box Item ID and a positive whole-number boxes-per-case quantity.");
      return;
    }
    if (form.unitType !== "CASE" && form.parentProductId && (
      !Number.isInteger(Number(form.quantityPerParent)) ||
      Number(form.quantityPerParent) <= 0
    )) {
      setError("Units per parent must be a positive whole number.");
      return;
    }

    if (!itemId) {
      setError(
        "Item ID is required."
      );
      return;
    }

    if (!name) {
      setError(
        "Product name is required."
      );
      return;
    }

    if (
      form.expectedSalePrice !== "" &&
      Number(form.expectedSalePrice) < 0
    ) {
      setError(
        "Expected sale price cannot be negative."
      );
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const endpoint = isEditing
        ? `/api/products/${product?.id}`
        : "/api/products";

      const response = await fetch(
        endpoint,
        {
          method: isEditing
            ? "PATCH"
            : "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            itemId,
            name,
            type: form.type,
            unitType: form.unitType,

            // The contained product stores its parent and conversion quantity.
            parentProductId: form.unitType !== "CASE" && form.parentProductId ? Number(form.parentProductId) : null,
            quantityPerParent: form.unitType !== "CASE" && form.parentProductId ? Number(form.quantityPerParent) : null,
            ...(form.unitType === "CASE" ? {
              boxItemId: form.boxItemId,
              boxesPerCase: Number(form.boxesPerCase),
              boxExpectedSalePrice: form.boxExpectedSalePrice,
            } : {}),
            ...(!isEditing
              ? {
                  active: true,
                }
              : {}),

            sellable: form.unitType === "CASE" ? false : form.sellable,

            expectedSalePrice:
              form.expectedSalePrice ===
              ""
                ? null
                : Number(
                    form.expectedSalePrice
                  ),
          }),
        }
      );

      if (!response.ok) {
        const responseBody =
          await response
            .json()
            .catch(() => null);

        throw new Error(
          responseBody?.error ??
            (isEditing
              ? "Product could not be updated."
              : "Product could not be created.")
        );
      }

      await onSaved();
    } catch (error) {
      console.error(
        isEditing
          ? "Product update error:"
          : "Product creation error:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : isEditing
            ? "Product could not be updated."
            : "Product could not be created."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background:
          "rgba(0, 0, 0, 0.72)",
        backdropFilter: "blur(4px)",
      }}
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
        style={{
          width: "100%",
          maxWidth: "560px",
          border:
            "1px solid #2b2c31",
          borderRadius: "14px",
          background: "#17181c",
          boxShadow:
            "0 24px 70px rgba(0, 0, 0, 0.45)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent:
              "space-between",
            gap: "20px",
            padding: "22px 24px",
            borderBottom:
              "1px solid #24252a",
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: "18px",
              }}
            >
              {isEditing
                ? "Edit Product"
                : "Add Product"}
            </h2>

            <p
              style={{
                margin: "6px 0 0",
                color: "#777880",
                fontSize: "12px",
              }}
            >
              {isEditing
                ? "Update this product's catalog details."
                : "Create a new product in the Double Rare catalog."}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              border: 0,
              background:
                "transparent",
              color: "#777880",
              cursor: "pointer",
              fontSize: "20px",
            }}
          >
            ×
          </button>
        </div>

        <form
          className="product-form-grid"
          onSubmit={handleSubmit}
          style={{
            padding: "24px",
          }}
        >
          <FormField
            label="Item ID"
            hint="A unique internal identifier, such as PRIS-BOX."
          >
            <input
              value={form.itemId}
              onChange={(event) =>
                updateForm(
                  "itemId",
                  event.target.value
                )
              }
              placeholder="PRIS-BOX"
              autoFocus
              style={inputStyle}
            />
          </FormField>

          <FormField
            label="Product Name"
            hint="The name you want displayed throughout the app."
          >
            <input
              value={form.name}
              onChange={(event) =>
                updateForm(
                  "name",
                  event.target.value
                )
              }
              placeholder="Prismatic Evolutions Box"
              style={inputStyle}
            />
          </FormField>

          <FormField
            label="Product Type"
            hint="Singles are supported by the data model, but we're currently focused on sealed inventory."
          >
            <select
              value={form.type}
              disabled={form.unitType === "CASE"}
              onChange={(event) =>
                updateForm(
                  "type",
                  event.target
                    .value as
                    | "SEALED"
                    | "SINGLE"
                )
              }
              style={inputStyle}
            >
              <option value="SEALED">
                Sealed
              </option>

              <option value="SINGLE">
                Single
              </option>
            </select>
          </FormField>

          <FormField label="Unit Type">
            <select
              value={form.unitType}
              onChange={(event) =>
                updateForm(
                  "unitType",
                  event.target.value as ProductUnitType
                )
              }
              style={inputStyle}
            >
              <option value="CASE">
                Case
              </option>

              <option value="BOX">
                Box
              </option>

              <option value="ITEM">
                Item
              </option>
            </select>
          </FormField>

          {form.unitType === "CASE" && (
            <>
              <FormField label="Matching Box Name" hint="The Case and its matching Box are saved together. Cases are never sellable.">
                <input readOnly value={matchingBoxName(form.name)} style={inputStyle} />
              </FormField>
              <FormField label="Box Item ID" hint="Use a unique ID, or the ID of an existing unlinked Box with this matching name.">
                <input required value={form.boxItemId}
                  onChange={(event) => updateForm("boxItemId", event.target.value)} style={inputStyle} />
              </FormField>
              <FormField label="Boxes per Case">
                <input type="number" min="1" step="1" required value={form.boxesPerCase}
                  onChange={(event) => updateForm("boxesPerCase", event.target.value)} style={inputStyle} />
              </FormField>
              <FormField label="Expected Sale Price per Box">
                <input type="number" min="0" step="0.01" value={form.boxExpectedSalePrice}
                  onChange={(event) => updateForm("boxExpectedSalePrice", event.target.value)} style={inputStyle} />
              </FormField>
            </>
          )}

          {form.unitType !== "CASE" && <>
          <FormField
            label="Parent / Container Product"
            hint="For a Box sold from a Case, select its Case here. Leave blank for products without a container."
          >
            <select
              value={form.parentProductId}
              onChange={(event) => updateForm("parentProductId", event.target.value)}
              style={inputStyle}
            >
              <option value="">No parent</option>
              {products.filter((parent) =>
                parent.id !== product?.id &&
                (parent.unitType !== "CASE" || parent.id === product?.parentProductId) &&
                (parent.active || parent.id === product?.parentProductId)
              ).map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.itemId} — {parent.name} ({parent.unitType})
                </option>
              ))}
            </select>
          </FormField>

          {form.parentProductId && (
            <FormField
              label="Units per Parent"
              hint="Example: enter 20 on the Box product when one Case contains 20 Boxes. This sets catalog metadata; it does not change inventory."
            >
              <input
                type="number"
                min="1"
                step="1"
                required
                value={form.quantityPerParent}
                onChange={(event) => updateForm("quantityPerParent", event.target.value)}
                style={inputStyle}
              />
            </FormField>
          )}

          <FormField
            label="Expected Sale Price"
            hint="Used to calculate retail inventory value and potential profit."
          >
            <div
              style={{
                position: "relative",
              }}
            >
              <span
                style={{
                  position:
                    "absolute",
                  left: "13px",
                  top: "50%",
                  transform:
                    "translateY(-50%)",
                  color: "#777880",
                }}
              >
                $
              </span>

              <input
                type="number"
                min="0"
                step="0.01"
                value={
                  form.expectedSalePrice
                }
                onChange={(event) =>
                  updateForm(
                    "expectedSalePrice",
                    event.target.value
                  )
                }
                placeholder="0.00"
                style={{
                  ...inputStyle,
                  paddingLeft:
                    "28px",
                }}
              />
            </div>
          </FormField>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginTop: "4px",
              color: "#d0d0d3",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={form.sellable}
              onChange={(event) =>
                updateForm(
                  "sellable",
                  event.target.checked
                )
              }
            />

            Sellable product
          </label>

          <p
            style={{
              margin:
                "6px 0 0 25px",
              color: "#696a71",
              fontSize: "11px",
              lineHeight: 1.5,
            }}
          >
            Turn this off for a
            container or purchase-only
            product that is not sold
            directly.
          </p>
          </>}

          {error && (
            <div
              style={{
                marginTop: "20px",
                padding:
                  "11px 13px",
                border:
                  "1px solid rgba(220, 70, 70, 0.25)",
                borderRadius: "8px",
                background:
                  "rgba(220, 70, 70, 0.08)",
                color: "#e47b7b",
                fontSize: "12px",
              }}
            >
              {error}
            </div>
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
              disabled={saving}
              style={secondaryButtonStyle}
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
                : isEditing
                  ? "Save Changes"
                  : "Add Product"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// FORM HELPERS
// ---------------------------------------------------------

const inputStyle = {
  width: "100%",
  boxSizing:
    "border-box" as const,
  padding: "11px 12px",
  border:
    "1px solid #303137",
  borderRadius: "8px",
  outline: "none",
  background: "#101115",
  color: "#e5e5e7",
  fontSize: "13px",
};

const secondaryButtonStyle = {
  padding: "10px 15px",
  border:
    "1px solid #303137",
  borderRadius: "8px",
  background: "#1d1e23",
  color: "#b8b8bd",
  cursor: "pointer",
};

const menuItemStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  display: "block",
  padding: "9px 10px",
  border: 0,
  borderRadius: "6px",
  background: "transparent",
  color: "#d0d0d3",
  cursor: "pointer",
  fontSize: "12px",
  textAlign: "left" as const,
  whiteSpace: "nowrap" as const,
};

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
      className="form-field"
      style={{
        marginBottom: "19px",
      }}
    >
      <label
        style={{
          display: "block",
          marginBottom: "7px",
          color: "#d0d0d3",
          fontSize: "12px",
          fontWeight: 650,
        }}
      >
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

// ---------------------------------------------------------
// SHARED UI
// ---------------------------------------------------------

function ProductHeader({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <th
      style={{
        padding: "14px 20px",
        textAlign: "left",
        color: "#777880",
        fontSize: "11px",
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function ProductCell({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <td
      style={{
        padding: "16px 20px",
        color: "#a7a7ad",
        fontSize: "13px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </td>
  );
}

function StatusBadge({
  active,
  activeText,
  inactiveText,
}: {
  active: boolean;
  activeText: string;
  inactiveText: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "5px 9px",
        borderRadius: "999px",
        background: active
          ? "rgba(63, 185, 80, 0.10)"
          : "rgba(255, 255, 255, 0.05)",
        color: active
          ? "#66c878"
          : "#777880",
        fontSize: "11px",
        fontWeight: 700,
      }}
    >
      {active
        ? activeText
        : inactiveText}
    </span>
  );
}

function DashboardRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent:
          "space-between",
        gap: "20px",
        padding: "12px 0",
        borderBottom: last
          ? "none"
          : "1px solid #24252a",
      }}
    >
      <span
        style={{
          color: "#777880",
          fontSize: "12px",
        }}
      >
        {label}
      </span>

      <strong
        style={{
          color: "#e5e5e7",
          fontSize: "12px",
          fontWeight: 650,
          textAlign: "right",
        }}
      >
        {value}
      </strong>
    </div>
  );
}

function MetricCard({
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

function LoadingPage({
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

function PagePlaceholder({
  title,
}: {
  title: string;
}) {
  return (
    <div className="page-placeholder">
      <div className="placeholder-icon">
        DR
      </div>

      <h2>{title}</h2>

      <p>
        This section will be built next.
      </p>
    </div>
  );
}

export default App;

