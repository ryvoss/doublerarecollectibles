import {
  useEffect,
  useState,
} from "react";
import ProductModal from "./client/components/ProductModal";

import type { ReactNode } from "react";

import "./App.css";
import FundsPanel from "./client/components/FundsPanel";
import OrdersPage from "./client/pages/OrdersPage";
import InventoryPage from "./client/pages/InventoryPage";
import SalesPage from "./client/pages/SalesPage";
import ShowsPage from "./client/pages/ShowsPage";
import ActiveShowPanel from "./client/components/ActiveShowPanel";
import ReportsPage from "./client/pages/ReportsPage";
import PublicSiteManagerPage from "./client/pages/PublicSiteManagerPage";

// ---------------------------------------------------------
// TYPES
// ---------------------------------------------------------

type Page =
  | "dashboard"
  | "products"
  | "orders"
  | "inventory"
  | "sales"
  | "shows"
  | "reports"
  | "publicSite";

type ProductUnitType = "CASE" | "BOX" | "ITEM";

type Product = {
  id: number;
  itemId: string;
  name: string;
  displayName: string | null;
  shortDescription: string | null;
  imageUrl: string | null;
  type: "SEALED" | "SINGLE";
  unitType: ProductUnitType;
  parentProductId: number | null;
  quantityPerParent: number | null;
  sellable: boolean;
  active: boolean;
  expectedSalePrice: string | number | null;
  publicVisible: boolean;
  publicPrice: string | number | null;
  featured: boolean;
  packsPerBox: number | null;
  packDisplayName: string | null;
  defaultPackPrice: string | number | null;
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
  { id: "reports", label: "Reports", icon: "▥" },
  { id: "publicSite", label: "Public Site", icon: "◎" },
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
        {import.meta.env.MODE === "test" && <div className="test-environment-banner" role="status">TEST ENVIRONMENT — DISPOSABLE DATA</div>}
        <header className="topbar">
          <div>
            <p className="eyebrow">
              DOUBLE RARE COLLECTIBLES
            </p>

            <h1>{currentPage.label}</h1>
          </div>

          <div className="topbar-actions">
            <a className="admin-site-link" href="/">
              Main Site
            </a>

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
          {activePage === "reports" && <ReportsPage />}
          {activePage === "publicSite" && <PublicSiteManagerPage />}

          {activePage !== "dashboard" &&
            activePage !== "inventory" &&
            activePage !== "sales" &&
            activePage !== "shows" &&
            activePage !== "products" &&
            activePage !== "orders" &&
            activePage !== "reports" &&
            activePage !== "publicSite" && (
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
    <div className="command-center">
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
      <section className="command-section">
        <CommandCenterSectionHeader
          title="Quick Actions"
        />

        <div className="command-actions">
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
      <section className="command-section command-show">
        <CommandCenterSectionHeader
          title="Show Operations"
          detail="Start a Show or continue the active Show"
        />

        <ActiveShowPanel />
      </section>

      <section className="command-section">
        <CommandCenterSectionHeader
          title="Business Position"
          detail="Funds and sealed inventory"
        />

        <div className="command-position-grid">
          <div id="command-center-funds">
            <FundsPanel />
          </div>

          <div
            className="panel command-inventory"
          >
            <div className="panel-header">
              <div>
                <h3>Sealed Inventory</h3>
                <p>Current inventory position</p>
              </div>
            </div>

            <div className="command-inventory-body">
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
    </div>
  );
}

function CommandCenterSectionHeader({title, detail}: {title: string; detail?: string}) {
  return <div className="command-section-header">
    <h3>{title}</h3>
    {detail && <p>{detail}</p>}
  </div>;
}

function CommandAction({icon, title, detail, onClick}: {
  icon: string; title: string; detail: string; onClick: () => void;
}) {
  return <button type="button" className="command-action" onClick={onClick}>
    <span className="command-action-icon" aria-hidden="true">{icon}</span>
    <span><strong>{title}</strong><span className="command-action-detail">{detail}</span></span>
    <span className="command-action-arrow" aria-hidden="true">&rarr;</span>
  </button>;
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
    <div className="products-page">
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
          className="panel-header products-toolbar"
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
                  aria-pressed={filter === value}
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
            <table className="products-table"
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
                    Public
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
                      className={product.active ? "product-row" : "product-row is-inactive"}
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
                        <span className="product-badge">{product.type}</span>
                      </ProductCell>

                      <ProductCell>
                        <span className={`product-badge product-unit-${product.unitType.toLowerCase()}`}>{product.unitType}</span>
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
                        <div className="product-public-status">
                          <StatusBadge
                            active={product.publicVisible}
                            activeText={product.featured ? "Featured" : "Visible"}
                            inactiveText="Hidden"
                          />
                          {product.publicVisible && (
                            <span>
                              {product.publicPrice === null
                                ? product.expectedSalePrice === null
                                  ? "No price"
                                  : `${money(product.expectedSalePrice)} fallback`
                                : money(product.publicPrice)}
                            </span>
                          )}
                        </div>
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
          onImageChanged={(productId, imageUrl) => {
            setProducts((current) => current.map((product) =>
              product.id === productId ? { ...product, imageUrl } : product
            ));
            setEditingProduct((current) => current?.id === productId
              ? { ...current, imageUrl }
              : current);
          }}
        />
      )}
    </div>
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

// ---------------------------------------------------------
// FORM HELPERS
// ---------------------------------------------------------



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

// ---------------------------------------------------------
// SHARED UI
// ---------------------------------------------------------

function ProductHeader({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <th>
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
    <td>
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
