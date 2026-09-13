import {
  useEffect,
  useState,
} from "react";

import type {
  FormEvent,
  ReactNode,
} from "react";

import "./App.css";
import OrdersPage from "./client/pages/OrdersPage";

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

type Product = {
  id: number;
  itemId: string;
  name: string;
  type: "SEALED" | "SINGLE";
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

type SalesSummary = {
  totalSalesTransactions: number;
  totalUnitsSold: number;
  totalRevenue: string | number;
  totalCOGS: string | number;
  grossProfit: string | number;
  grossMargin: number;
  averageSaleValue: string | number;
  averageProfitPerSale: string | number;
  cashRevenue: string | number;
  digitalRevenue: string | number;
};

type ProductPerformanceItem = {
  productId: number;
  itemId: string;
  productName: string;
  unitsSold: number;
  revenue: string | number;
  cogs: string | number;
  grossProfit: string | number;
  grossMargin: number;
  roi: number;
  hasSales: boolean;
};

type ProductPerformance = {
  products: ProductPerformanceItem[];
  rankings: {
    bestSeller: ProductPerformanceItem | null;
    highestRevenue: ProductPerformanceItem | null;
    highestGrossProfit: ProductPerformanceItem | null;
    highestGrossMargin: ProductPerformanceItem | null;
    highestRoi: ProductPerformanceItem | null;
  };
};

type ApiStatus =
  | "loading"
  | "online"
  | "offline";

type NewProductForm = {
  itemId: string;
  name: string;
  type: "SEALED" | "SINGLE";
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
    label: "Dashboard",
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

function percent(
  value: number | null | undefined
) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
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

  const [salesSummary, setSalesSummary] =
    useState<SalesSummary | null>(null);

  const [
    productPerformance,
    setProductPerformance,
  ] = useState<ProductPerformance | null>(
    null
  );

  const [dashboardLoading, setDashboardLoading] =
    useState(true);

  const [dashboardError, setDashboardError] =
    useState<string | null>(null);

  const currentPage =
    navigation.find(
      (item) => item.id === activePage
    ) ?? navigation[0];

  // Load the data needed by the main dashboard.
  useEffect(() => {
    async function loadDashboard() {
      try {
        setDashboardLoading(true);
        setDashboardError(null);

        const [
          healthResponse,
          inventoryResponse,
          salesResponse,
          performanceResponse,
        ] = await Promise.all([
          fetch("/api/health"),
          fetch("/api/inventory"),
          fetch("/api/sales/summary"),
          fetch(
            "/api/sales/product-performance"
          ),
        ]);

        if (!healthResponse.ok) {
          throw new Error(
            "The API health check failed."
          );
        }

        setApiStatus("online");

        if (!inventoryResponse.ok) {
          throw new Error(
            "Inventory data could not be loaded."
          );
        }

        if (!salesResponse.ok) {
          throw new Error(
            "Sales summary could not be loaded."
          );
        }

        if (!performanceResponse.ok) {
          throw new Error(
            "Product performance could not be loaded."
          );
        }

        setInventory(
          await inventoryResponse.json()
        );

        setSalesSummary(
          await salesResponse.json()
        );

        setProductPerformance(
          await performanceResponse.json()
        );
      } catch (error) {
        console.error(
          "Dashboard loading error:",
          error
        );

        setApiStatus("offline");

        setDashboardError(
          error instanceof Error
            ? error.message
            : "Dashboard data could not be loaded."
        );
      } finally {
        setDashboardLoading(false);
      }
    }

    loadDashboard();
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
              salesSummary={salesSummary}
              productPerformance={
                productPerformance
              }
              loading={dashboardLoading}
              error={dashboardError}
            />
          )}

          {activePage === "products" && (
            <ProductsPage />
          )}
          {activePage === "orders" && (
          <OrdersPage />
          )}

          {activePage !== "dashboard" &&
            activePage !== "products" &&
            activePage !== "orders" && (
              <PagePlaceholder
                title={currentPage.label}
              />
            )}
        </section>
      </main>
    </div>
  );
}

// ---------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------

function Dashboard({
  inventory,
  salesSummary,
  productPerformance,
  loading,
  error,
}: {
  inventory: InventoryItem[];
  salesSummary: SalesSummary | null;
  productPerformance: ProductPerformance | null;
  loading: boolean;
  error: string | null;
}) {
  const totalInventoryValue =
    inventory.reduce(
      (total, item) =>
        total + Number(item.inventoryValue),
      0
    );

  const totalRetailValue =
    inventory.reduce(
      (total, item) =>
        total + Number(item.retailValue),
      0
    );

  const totalUnitsOnHand =
    inventory.reduce(
      (total, item) =>
        total + item.unitsOnHand,
      0
    );

  const productsInInventory =
    inventory.filter(
      (item) => item.unitsOnHand > 0
    ).length;

  if (loading) {
    return (
      <LoadingPage
        icon="DR"
        title="Loading Dashboard"
        message="Retrieving inventory and sales data..."
      />
    );
  }

  if (error) {
    return (
      <LoadingPage
        icon="!"
        title="Dashboard Unavailable"
        message={error}
      />
    );
  }

  const bestSeller =
    productPerformance?.rankings
      .bestSeller ?? null;

  const highestRevenue =
    productPerformance?.rankings
      .highestRevenue ?? null;

  const highestProfit =
    productPerformance?.rankings
      .highestGrossProfit ?? null;

  const highestRoi =
    productPerformance?.rankings
      .highestRoi ?? null;

  return (
    <>
      <div className="page-heading">
        <div>
          <h2>Business Overview</h2>

          <p>
            Live sealed inventory and
            sales performance.
          </p>
        </div>
      </div>

      <div className="metric-grid">
        <MetricCard
          label="Inventory Value"
          value={money(
            totalInventoryValue
          )}
          detail={`${totalUnitsOnHand} units on hand`}
        />

        <MetricCard
          label="Retail Value"
          value={money(
            totalRetailValue
          )}
          detail={`${productsInInventory} products in inventory`}
        />

        <MetricCard
          label="Lifetime Revenue"
          value={money(
            salesSummary?.totalRevenue
          )}
          detail={`${salesSummary?.totalSalesTransactions ?? 0} sales transactions`}
        />

        <MetricCard
          label="Gross Profit"
          value={money(
            salesSummary?.grossProfit
          )}
          detail={`${percent(
            salesSummary?.grossMargin
          )} gross margin`}
        />
      </div>

      <div className="dashboard-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>
                Sales Performance
              </h3>

              <p>
                Lifetime sealed product
                performance
              </p>
            </div>
          </div>

          <div
            style={{ padding: "20px" }}
          >
            <DashboardRow
              label="Units Sold"
              value={String(
                salesSummary?.totalUnitsSold ??
                  0
              )}
            />

            <DashboardRow
              label="Revenue"
              value={money(
                salesSummary?.totalRevenue
              )}
            />

            <DashboardRow
              label="COGS"
              value={money(
                salesSummary?.totalCOGS
              )}
            />

            <DashboardRow
              label="Gross Profit"
              value={money(
                salesSummary?.grossProfit
              )}
            />

            <DashboardRow
              label="Gross Margin"
              value={percent(
                salesSummary?.grossMargin
              )}
            />

            <DashboardRow
              label="Average Sale"
              value={money(
                salesSummary?.averageSaleValue
              )}
            />

            <DashboardRow
              label="Cash Revenue"
              value={money(
                salesSummary?.cashRevenue
              )}
            />

            <DashboardRow
              label="Digital Revenue"
              value={money(
                salesSummary?.digitalRevenue
              )}
              last
            />
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>
                Inventory Health
              </h3>

              <p>
                Current sealed inventory
              </p>
            </div>
          </div>

          <div
            style={{ padding: "20px" }}
          >
            <DashboardRow
              label="Units On Hand"
              value={String(
                totalUnitsOnHand
              )}
            />

            <DashboardRow
              label="Products In Stock"
              value={String(
                productsInInventory
              )}
            />

            <DashboardRow
              label="Inventory Basis"
              value={money(
                totalInventoryValue
              )}
            />

            <DashboardRow
              label="Retail Value"
              value={money(
                totalRetailValue
              )}
            />

            <DashboardRow
              label="Potential Gross Profit"
              value={money(
                totalRetailValue -
                  totalInventoryValue
              )}
              last
            />
          </div>
        </div>
      </div>

      <div
        className="panel"
        style={{ marginTop: "18px" }}
      >
        <div className="panel-header">
          <div>
            <h3>Product Leaders</h3>

            <p>
              Best-performing sealed
              products
            </p>
          </div>
        </div>

        <div
          style={{ padding: "20px" }}
        >
          <DashboardRow
            label="Best Seller"
            value={
              bestSeller
                ? `${bestSeller.productName} · ${bestSeller.unitsSold} units`
                : "No sales yet"
            }
          />

          <DashboardRow
            label="Highest Revenue"
            value={
              highestRevenue
                ? `${highestRevenue.productName} · ${money(
                    highestRevenue.revenue
                  )}`
                : "No sales yet"
            }
          />

          <DashboardRow
            label="Highest Gross Profit"
            value={
              highestProfit
                ? `${highestProfit.productName} · ${money(
                    highestProfit.grossProfit
                  )}`
                : "No sales yet"
            }
          />

          <DashboardRow
            label="Highest ROI"
            value={
              highestRoi
                ? `${highestRoi.productName} · ${percent(
                    highestRoi.roi
                  )}`
                : "No sales yet"
            }
            last
          />
        </div>
      </div>
    </>
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
  onClose,
  onSaved,
}: {
  mode: "add" | "edit";
  product?: Product;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const isEditing = mode === "edit";

  const [form, setForm] =
    useState<NewProductForm>({
      itemId: product?.itemId ?? "",
      name: product?.name ?? "",
      type: product?.type ?? "SEALED",
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
    }));
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const itemId = form.itemId.trim();
    const name = form.name.trim();

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

            // Parent/container relationships will
            // be added to the UI in a later step.
            ...(!isEditing
              ? {
                  parentProductId: null,
                  quantityPerParent: null,
                  active: true,
                }
              : {}),

            sellable: form.sellable,

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
  padding: "9px 10px",
  border: 0,
  borderRadius: "6px",
  background: "transparent",
  color: "#d0d0d3",
  cursor: "pointer",
  fontSize: "12px",
  textAlign: "left" as const,
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