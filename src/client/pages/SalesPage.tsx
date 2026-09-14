import {
  Fragment,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  FormEvent,
  ReactNode,
} from "react";

import ProductProfitability from "./ProductProfitability";

// ---------------------------------------------------------
// TYPES
// ---------------------------------------------------------

type Product = {
  id: number;
  itemId: string;
  name: string;
  type: "SEALED" | "SINGLE";
  unitType: "CASE" | "BOX" | "ITEM";
  active: boolean;
  sellable: boolean;
  expectedSalePrice: string | number | null;
};

type Stock = {
  productId: number;
  unitsOnHand: number;
};

type ShowVisit = {
  id: number;
  visitDate: string;
  finalizedAt: string | null;

  // The lifecycle fields are optional here so this component
  // remains compatible with older API responses while the
  // Show workflow is being upgraded.
  status?: "PLANNED" | "ACTIVE" | "FINALIZED";
};

type Show = {
  id: number;
  name: string;
  visits: ShowVisit[];
};

type SaleLine = {
  id: number;
  product: Product;
  quantity: number;
  unitSalePrice: string | number;
  revenue: string | number;
  cogs: string | number;
  grossProfit: string | number;
  grossMargin: string | number;

  allocations: {
    id: number;
    inventoryBatchId: number;
    quantity: number;
    unitCost: string | number;
    totalCost: string | number;
  }[];
};

type Sale = {
  id: number;
  saleNumber: string;
  saleDate: string;
  paymentMethod: "CASH" | "DIGITAL";
  notes: string | null;
  finalizedAt: string | null;
  lines: SaleLine[];

  showVisit: {
    visitDate: string;

    show: {
      name: string;
    };
  } | null;
};

type DraftLine = {
  key: number;
  productId: string;
  quantity: string;
  unitSalePrice: string;
};

// ---------------------------------------------------------
// COMPONENT PROPS
// ---------------------------------------------------------

type SalesPageProps = {
  // When supplied, Sales opens directly into Record Sale
  // and automatically attaches the sale to this Show Visit.
  initialShowVisitId?: number | null;

  // Optional callback used when another screen, such as the
  // Active Show workflow, wants to know a sale was completed.
  onSaleRecorded?: (sale: Sale) => void;

  // Optional callback for leaving the embedded/show workflow.
  onCancelShowSale?: () => void;
};

// ---------------------------------------------------------
// FORMATTERS
// ---------------------------------------------------------

const money = (
  value: string | number
) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value));

const percent = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);

// Historical totals use stored sale values, not current
// catalog prices.
function total(
  lines: SaleLine[],
  field:
    | "revenue"
    | "cogs"
    | "grossProfit"
) {
  return (
    lines.reduce(
      (sum, line) =>
        sum +
        Math.round(
          Number(line[field]) * 100
        ),
      0
    ) / 100
  );
}

// ---------------------------------------------------------
// SALES PAGE
// ---------------------------------------------------------

export default function SalesPage({
  initialShowVisitId = null,
  onSaleRecorded,
  onCancelShowSale,
}: SalesPageProps = {}) {
  const [sales, setSales] = useState<
    Sale[]
  >([]);

  const [products, setProducts] =
    useState<Product[]>([]);

  const [stock, setStock] = useState<
    Stock[]
  >([]);

  const [shows, setShows] = useState<
    Show[]
  >([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] = useState<
    string | null
  >(null);

  const [refresh, setRefresh] =
    useState(0);

  // If Sales was opened from an Active Show, immediately
  // open the sale form. Normal Sales-page navigation still
  // starts with the form closed.
  const [adding, setAdding] =
    useState(
      initialShowVisitId !== null
    );

  const [expandedId, setExpandedId] =
    useState<number | null>(null);

  const [search, setSearch] =
    useState("");

  const [
    paymentFilter,
    setPaymentFilter,
  ] = useState("ALL");

  const [success, setSuccess] =
    useState<string | null>(null);

  // When Sales is launched from an Active Show Visit, use a compact
  // sale-entry experience instead of rendering the full Sales dashboard.
  const embeddedShowSale =
    initialShowVisitId !== null;

  // -------------------------------------------------------
  // LOAD SALES DATA
  // -------------------------------------------------------

  useEffect(() => {
    const controller =
      new AbortController();

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const responses =
          await Promise.all(
            [
              "sales",
              "products",
              "inventory",
              "shows",
            ].map((path) =>
              fetch(`/api/${path}`, {
                signal:
                  controller.signal,
              })
            )
          );

        if (
          responses.some(
            (response) =>
              !response.ok
          )
        ) {
          throw new Error(
            "Sales data could not be loaded. Check the API and refresh."
          );
        }

        const [
          saleData,
          productData,
          stockData,
          showData,
        ] = await Promise.all(
          responses.map(
            (response) =>
              response.json()
          )
        );

        if (
          controller.signal.aborted
        ) {
          return;
        }

        setSales(saleData);
        setProducts(productData);
        setStock(stockData);
        setShows(showData);
      } catch (error) {
        if (
          !controller.signal.aborted
        ) {
          setError(
            error instanceof Error
              ? error.message
              : "Sales data could not be loaded."
          );
        }
      } finally {
        if (
          !controller.signal.aborted
        ) {
          setLoading(false);
        }
      }
    }

    void load();

    return () =>
      controller.abort();
  }, [refresh]);

  // -------------------------------------------------------
  // PAGE TOTALS / FILTERING
  // -------------------------------------------------------

  const allLines = sales.flatMap(
    (sale) => sale.lines
  );

  const revenue = total(
    allLines,
    "revenue"
  );

  const profit = total(
    allLines,
    "grossProfit"
  );

  const visibleSales =
    sales.filter(
      (sale) =>
        (paymentFilter ===
          "ALL" ||
          sale.paymentMethod ===
            paymentFilter) &&
        `${sale.saleNumber} ${sale.lines
          .map(
            (line) =>
              `${line.product.itemId} ${line.product.name}`
          )
          .join(" ")}`
          .toLowerCase()
          .includes(
            search
              .trim()
              .toLowerCase()
          )
    );

  // -------------------------------------------------------
  // SALE FORM CALLBACKS
  // -------------------------------------------------------

  function handleCancelSale() {
    setAdding(false);

    // When Sales is being used by the Active Show workflow,
    // give the parent screen a chance to close that workflow.
    if (
      initialShowVisitId !== null
    ) {
      onCancelShowSale?.();
    }
  }

  function handleSaleSaved(
    sale: Sale
  ) {
    setAdding(false);

    setSuccess(
      `${sale.saleNumber} saved and finalized. Inventory has been updated.`
    );

    setExpandedId(sale.id);

    // Reload Sales, Inventory stock, Shows, and profitability.
    setRefresh(
      (value) => value + 1
    );

    // The Active Show workflow can use this to refresh its
    // own performance immediately after the sale is recorded.
    onSaleRecorded?.(sale);
  }

  // -------------------------------------------------------
  // RENDER
  // -------------------------------------------------------

  return (
    <>
      {!embeddedShowSale && (
        <div className="panel-header">
          <div>
            <h3>Sealed Sales</h3>
        
            <p>
              Sales finalize
              immediately and consume
              inventory using FIFO.
            </p>
          </div>
        
          <div
            style={{
              display: "flex",
              gap: "10px",
            }}
          >
            <button
              type="button"
              style={controlStyle}
              disabled={
                loading || adding
              }
              onClick={() =>
                setRefresh(
                  (value) =>
                    value + 1
                )
              }
            >
              Refresh
            </button>
        
            <button
              type="button"
              className="primary-button"
              disabled={
                loading ||
                !!error ||
                adding
              }
              onClick={() => {
                setSuccess(null);
                setAdding(true);
              }}
            >
              Record Sale
            </button>
          </div>
        </div>
      )}

      {success && !embeddedShowSale && (
        <p role="status">
          {success}
        </p>
      )}

      {error && (
        <p role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p role="status">
          Loading sales...
        </p>
      ) : (
        !error && (
          <>
            {!embeddedShowSale && (
              <div className="metric-grid">
                <Metric
                  label="Revenue"
                  value={money(
                    revenue
                  )}
                />
              
                <Metric
                  label="FIFO COGS"
                  value={money(
                    total(
                      allLines,
                      "cogs"
                    )
                  )}
                />
              
                <Metric
                  label="Gross Profit"
                  value={money(
                    profit
                  )}
                />
              
                <Metric
                  label="Gross Margin"
                  value={percent(
                    revenue > 0
                      ? profit /
                          revenue
                      : 0
                  )}
                />
              </div>
            )}

            {adding && (
              <NewSaleForm
                products={
                  products
                }
                stock={stock}
                shows={shows}
                lockedShowVisitId={
                  initialShowVisitId
                }
                onCancel={
                  handleCancelSale
                }
                onSaved={
                  handleSaleSaved
                }
              />
            )}

            {!embeddedShowSale && (
              <>
                <section className="panel">
                  <div className="panel-header">
                    <input
                      aria-label="Search sales"
                      style={
                        controlStyle
                      }
                      placeholder="Search sale or product"
                      value={search}
                      onChange={(
                        event
                      ) =>
                        setSearch(
                          event
                            .target
                            .value
                        )
                      }
                    />
                
                    <select
                      aria-label="Payment method filter"
                      style={
                        controlStyle
                      }
                      value={
                        paymentFilter
                      }
                      onChange={(
                        event
                      ) =>
                        setPaymentFilter(
                          event
                            .target
                            .value
                        )
                      }
                    >
                      <option value="ALL">
                        All payments
                      </option>
                
                      <option value="CASH">
                        Cash
                      </option>
                
                      <option value="DIGITAL">
                        Digital
                      </option>
                    </select>
                  </div>
                
                  {visibleSales.length ===
                  0 ? (
                    <p
                      style={{
                        padding:
                          "20px",
                      }}
                    >
                      No sales to
                      display.
                    </p>
                  ) : (
                    <Table
                      headings={[
                        "Sale",
                        "Date",
                        "Payment",
                        "Show Visit",
                        "Units",
                        "Revenue",
                        "FIFO COGS",
                        "Gross Profit",
                        "Details",
                      ]}
                    >
                      {visibleSales.map(
                        (sale) => (
                          <Fragment
                            key={
                              sale.id
                            }
                          >
                            <tr>
                              <Cell>
                                {
                                  sale.saleNumber
                                }
                              </Cell>
                
                              <Cell>
                                {sale.saleDate.slice(
                                  0,
                                  10
                                )}
                              </Cell>
                
                              <Cell>
                                {
                                  sale.paymentMethod
                                }
                              </Cell>
                
                              <Cell>
                                {sale.showVisit
                                  ? `${sale.showVisit.show.name} (${sale.showVisit.visitDate.slice(
                                      0,
                                      10
                                    )})`
                                  : "None"}
                              </Cell>
                
                              <Cell>
                                {sale.lines.reduce(
                                  (
                                    sum,
                                    line
                                  ) =>
                                    sum +
                                    line.quantity,
                                  0
                                )}
                              </Cell>
                
                              <Cell>
                                {money(
                                  total(
                                    sale.lines,
                                    "revenue"
                                  )
                                )}
                              </Cell>
                
                              <Cell>
                                {money(
                                  total(
                                    sale.lines,
                                    "cogs"
                                  )
                                )}
                              </Cell>
                
                              <Cell>
                                {money(
                                  total(
                                    sale.lines,
                                    "grossProfit"
                                  )
                                )}
                              </Cell>
                
                              <Cell>
                                <button
                                  type="button"
                                  style={
                                    controlStyle
                                  }
                                  aria-expanded={
                                    expandedId ===
                                    sale.id
                                  }
                                  aria-controls={`sale-${sale.id}`}
                                  onClick={() =>
                                    setExpandedId(
                                      expandedId ===
                                        sale.id
                                        ? null
                                        : sale.id
                                    )
                                  }
                                >
                                  {expandedId ===
                                  sale.id
                                    ? "Hide"
                                    : "View"}
                                </button>
                              </Cell>
                            </tr>
                
                            {expandedId ===
                              sale.id && (
                              <tr>
                                <td
                                  colSpan={
                                    9
                                  }
                                  style={{
                                    padding:
                                      "20px",
                                    background:
                                      "#131418",
                                  }}
                                >
                                  <section
                                    id={`sale-${sale.id}`}
                                    aria-label={`${sale.saleNumber} details`}
                                  >
                                    <p
                                      style={{
                                        color:
                                          "#a7a7ad",
                                      }}
                                    >
                                      Finalized
                                      sale ·
                                      Read-only
                                      {sale.notes
                                        ? ` · ${sale.notes}`
                                        : ""}
                                    </p>
                
                                    {sale.lines.map(
                                      (
                                        line
                                      ) => (
                                        <article
                                          key={
                                            line.id
                                          }
                                          style={{
                                            marginBottom:
                                              "14px",
                                            padding:
                                              "16px",
                                            border:
                                              "1px solid #303137",
                                            borderRadius:
                                              "8px",
                                          }}
                                        >
                                          <strong>
                                            {
                                              line.quantity
                                            }
                                            {
                                              " × "
                                            }
                                            {
                                              line
                                                .product
                                                .name
                                            }{" "}
                                            ·{" "}
                                            {money(
                                              line.unitSalePrice
                                            )}{" "}
                                            each
                                          </strong>
                
                                          <p>
                                            Revenue{" "}
                                            {money(
                                              line.revenue
                                            )}{" "}
                                            ·
                                            FIFO
                                            COGS{" "}
                                            {money(
                                              line.cogs
                                            )}{" "}
                                            ·
                                            Profit{" "}
                                            {money(
                                              line.grossProfit
                                            )}{" "}
                                            ·
                                            Margin{" "}
                                            {percent(
                                              Number(
                                                line.grossMargin
                                              )
                                            )}
                                          </p>
                
                                          <Table
                                            headings={[
                                              "Inventory Batch",
                                              "Units Consumed",
                                              "Unit Cost",
                                              "Allocated COGS",
                                            ]}
                                          >
                                            {line.allocations.map(
                                              (
                                                allocation
                                              ) => (
                                                <tr
                                                  key={
                                                    allocation.id
                                                  }
                                                >
                                                  <Cell>
                                                    #
                                                    {
                                                      allocation.inventoryBatchId
                                                    }
                                                  </Cell>
                
                                                  <Cell>
                                                    {
                                                      allocation.quantity
                                                    }
                                                  </Cell>
                
                                                  <Cell>
                                                    {money(
                                                      allocation.unitCost
                                                    )}
                                                  </Cell>
                
                                                  <Cell>
                                                    {money(
                                                      allocation.totalCost
                                                    )}
                                                  </Cell>
                                                </tr>
                                              )
                                            )}
                                          </Table>
                                        </article>
                                      )
                                    )}
                                  </section>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      )}
                    </Table>
                  )}
                </section>
                
                <ProductProfitability
                  refresh={refresh}
                />
              </>
            )}
          </>
        )
      )}
    </>
  );
}

// ---------------------------------------------------------
// NEW SALE FORM
// ---------------------------------------------------------

function NewSaleForm({
  products,
  stock,
  shows,
  lockedShowVisitId,
  onCancel,
  onSaved,
}: {
  products: Product[];
  stock: Stock[];
  shows: Show[];
  lockedShowVisitId:
    | number
    | null;
  onCancel: () => void;
  onSaved: (sale: Sale) => void;
}) {
  const available =
    products.filter(
      (product) =>
        product.type ===
          "SEALED" &&
        product.unitType !==
          "CASE" &&
        product.active &&
        product.sellable &&
        (stock.find(
          (item) =>
            item.productId ===
            product.id
        )?.unitsOnHand ??
          0) > 0
    );

  const [saleDate, setSaleDate] =
    useState(() => {
      const today = new Date();

      return `${today.getFullYear()}-${String(
        today.getMonth() + 1
      ).padStart(2, "0")}-${String(
        today.getDate()
      ).padStart(2, "0")}`;
    });

  const [payment, setPayment] =
    useState("CASH");

  // A Show-launched sale receives a locked visit ID.
  // A normal Sales-page sale can still choose any open visit.
  const [visitId, setVisitId] =
    useState(
      lockedShowVisitId !== null
        ? lockedShowVisitId.toString()
        : ""
    );

  const [notes, setNotes] =
    useState("");

  const nextKey = useRef(1);

  const submitting =
    useRef(false);

  const makeLine = (
    product:
      | Product
      | undefined,
    key: number
  ): DraftLine => ({
    key,
    productId:
      product?.id.toString() ??
      "",
    quantity: "1",
    unitSalePrice:
      product?.expectedSalePrice?.toString() ??
      "",
  });

  const [lines, setLines] =
    useState<DraftLine[]>(
      () => [
        makeLine(
          available[0],
          0
        ),
      ]
    );

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState<string | null>(
      null
    );

  const revenueCents =
    lines.reduce(
      (sum, line) =>
        sum +
        Math.round(
          Number(
            line.unitSalePrice
          ) * 100
        ) *
          Number(
            line.quantity
          ),
      0
    );

  // -------------------------------------------------------
  // RESOLVE LOCKED SHOW VISIT
  // -------------------------------------------------------

  const lockedVisit =
    lockedShowVisitId === null
      ? null
      : shows
          .flatMap((show) =>
            show.visits.map(
              (visit) => ({
                ...visit,
                showName:
                  show.name,
              })
            )
          )
          .find(
            (visit) =>
              visit.id ===
              lockedShowVisitId
          ) ?? null;

  const lockedVisitDate =
    lockedVisit?.visitDate.slice(0, 10) ??
    null;

  // A sale recorded from an Active Show belongs to that Show Visit,
  // so its sale date should always match the visit date rather than
  // defaulting to today's date.
  useEffect(() => {
    if (lockedVisitDate) {
      setSaleDate(lockedVisitDate);
    }
  }, [lockedVisitDate]);

  // -------------------------------------------------------
  // LINE EDITING
  // -------------------------------------------------------

  function updateLine(
    key: number,
    field:
      | "quantity"
      | "unitSalePrice",
    value: string
  ) {
    setLines((current) =>
      current.map((line) =>
        line.key === key
          ? {
              ...line,
              [field]:
                value,
            }
          : line
      )
    );
  }

  // -------------------------------------------------------
  // SAVE SALE
  // -------------------------------------------------------

  async function submit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (submitting.current) {
      return;
    }

    setError(null);

    // If this form was launched from an Active Show,
    // the Show Visit must still exist in the loaded Show data.
    if (
      lockedShowVisitId !==
        null &&
      !lockedVisit
    ) {
      setError(
        "The active Show Visit could not be found. Refresh the page before recording this sale."
      );

      return;
    }

    const usedProducts =
      new Set<number>();

    for (const line of lines) {
      const id = Number(
        line.productId
      );

      const quantity =
        Number(line.quantity);

      const price = Number(
        line.unitSalePrice
      );

      if (
        !available.some(
          (product) =>
            product.id === id
        ) ||
        usedProducts.has(id) ||
        !Number.isSafeInteger(
          quantity
        ) ||
        quantity <= 0 ||
        quantity >
          (stock.find(
            (item) =>
              item.productId ===
              id
          )?.unitsOnHand ??
            0) ||
        line.unitSalePrice.trim() ===
          "" ||
        !Number.isFinite(price) ||
        price < 0 ||
        price >
          99999999.99 ||
        Math.round(
          price * 100
        ) *
          quantity >
          9999999999
      ) {
        setError(
          "Each line needs a unique available product, an in-stock whole-number quantity, and a valid sale price."
        );

        return;
      }

      usedProducts.add(id);
    }

    if (
      !saleDate ||
      !lines.length
    ) {
      setError(
        "Enter a sale date and at least one product."
      );

      return;
    }

    submitting.current = true;
    setSaving(true);

    try {
      const response =
        await fetch(
          "/api/sales",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                saleDate,

                paymentMethod:
                  payment,

                // When launched from an Active Show this ID
                // cannot be changed by the user.
                showVisitId:
                  visitId
                    ? Number(
                        visitId
                      )
                    : null,

                notes:
                  notes.trim() ||
                  null,

                lines:
                  lines.map(
                    (line) => ({
                      productId:
                        Number(
                          line.productId
                        ),

                      quantity:
                        Number(
                          line.quantity
                        ),

                      unitSalePrice:
                        Number(
                          line.unitSalePrice
                        ),
                    })
                  ),
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
            "Sale could not be saved."
        );
      }

      onSaved(body);
    } catch (error) {
      setError(
        `${
          error instanceof Error
            ? error.message
            : "Sale could not be saved."
        } If the connection failed, refresh Sales before retrying so you can confirm whether the sale was already saved.`
      );
    } finally {
      submitting.current =
        false;

      setSaving(false);
    }
  }

  // -------------------------------------------------------
  // FORM
  // -------------------------------------------------------

  return (
    <section
      className="panel"
      style={{
        padding: "20px",
        marginBottom:
          "20px",
      }}
    >
      <h3
        style={{
          marginTop: 0,
        }}
      >
        Record Sale
      </h3>

      {lockedVisit ? (
        <p
          style={{
            color:
              "#a7a7ad",
          }}
        >
          Recording for{" "}
          <strong
            style={{
              color:
                "#e5e5e7",
            }}
          >
            {
              lockedVisit.showName
            }
          </strong>{" "}
          ·{" "}
          {lockedVisit.visitDate.slice(
            0,
            10
          )}
          . Saving finalizes
          this sale and deducts
          inventory.
        </p>
      ) : (
        <p
          style={{
            color:
              "#a7a7ad",
          }}
        >
          Saving finalizes
          this sale and deducts
          inventory. Review the
          details before saving.
        </p>
      )}

      <form onSubmit={submit}>
        <fieldset
          disabled={saving}
          style={{
            border: 0,
            padding: 0,
            margin: 0,
            minWidth: 0,
          }}
        >
          <div
            style={formGrid}
          >
            <Field label="Sale Number">
              <div
                style={{
                  ...controlStyle,
                  boxSizing:
                    "border-box",
                  minHeight:
                    "37px",
                  display:
                    "flex",
                  alignItems:
                    "center",
                  background:
                    "#141519",
                  color:
                    "#898a91",
                }}
              >
                Assigned automatically
              </div>
            </Field>

            <Field label="Sale Date">
              {lockedVisitDate ? (
                <div
                  style={{
                    ...controlStyle,
                    boxSizing:
                      "border-box",
                    minHeight:
                      "37px",
                    display:
                      "flex",
                    alignItems:
                      "center",
                    background:
                      "#141519",
                    color:
                      "#898a91",
                  }}
                >
                  {lockedVisitDate}
                </div>
              ) : (
                <input
                  required
                  type="date"
                  style={
                    controlStyle
                  }
                  value={
                    saleDate
                  }
                  onChange={(
                    event
                  ) =>
                    setSaleDate(
                      event
                        .target
                        .value
                    )
                  }
                />
              )}
            </Field>

            <Field label="Payment Method">
              <select
                style={
                  controlStyle
                }
                value={
                  payment
                }
                onChange={(
                  event
                ) =>
                  setPayment(
                    event
                      .target
                      .value
                  )
                }
              >
                <option value="CASH">
                  Cash
                </option>

                <option value="DIGITAL">
                  Digital
                </option>
              </select>
            </Field>

            {lockedVisit ? (
              <Field label="Show Visit">
                <div
                  style={{
                    ...controlStyle,
                    boxSizing:
                      "border-box",
                    minHeight:
                      "37px",
                    display:
                      "flex",
                    alignItems:
                      "center",
                    background:
                      "#141519",
                    color:
                      "#898a91",
                  }}
                >
                  {
                    lockedVisit.showName
                  }{" "}
                  ·{" "}
                  {lockedVisit.visitDate.slice(
                    0,
                    10
                  )}
                </div>
              </Field>
            ) : (
              <Field label="Show Visit (optional)">
                <select
                  style={
                    controlStyle
                  }
                  value={
                    visitId
                  }
                  onChange={(
                    event
                  ) =>
                    setVisitId(
                      event
                        .target
                        .value
                    )
                  }
                >
                  <option value="">
                    No show visit
                  </option>

                  {shows.flatMap(
                    (show) =>
                      show.visits
                        .filter(
                          (
                            visit
                          ) =>
                            !visit.finalizedAt &&
                            visit.status !==
                              "FINALIZED"
                        )
                        .map(
                          (
                            visit
                          ) => (
                            <option
                              key={
                                visit.id
                              }
                              value={
                                visit.id
                              }
                            >
                              {
                                show.name
                              }{" "}
                              ·{" "}
                              {visit.visitDate.slice(
                                0,
                                10
                              )}
                            </option>
                          )
                        )
                  )}
                </select>
              </Field>
            )}
          </div>

          {available.length ===
            0 && (
            <p>
              No sealed stock is
              available. Finalize
              a purchase order
              first.
            </p>
          )}

          {lines.map(
            (line) => (
              <div
                key={
                  line.key
                }
                style={{
                  ...formGrid,
                  borderTop:
                    "1px solid #303137",
                  paddingTop:
                    "16px",
                  marginTop:
                    "16px",
                }}
              >
                <Field label="Product">
                  <select
                    required
                    style={
                      controlStyle
                    }
                    value={
                      line.productId
                    }
                    onChange={(
                      event
                    ) => {
                      const product =
                        available.find(
                          (
                            item
                          ) =>
                            item.id ===
                            Number(
                              event
                                .target
                                .value
                            )
                        );

                      setLines(
                        (
                          current
                        ) =>
                          current.map(
                            (
                              item
                            ) =>
                              item.key ===
                              line.key
                                ? makeLine(
                                    product,
                                    line.key
                                  )
                                : item
                          )
                      );
                    }}
                  >
                    <option value="">
                      Select a
                      product
                    </option>

                    {available
                      .filter(
                        (
                          product
                        ) =>
                          product.id ===
                            Number(
                              line.productId
                            ) ||
                          !lines.some(
                            (
                              item
                            ) =>
                              Number(
                                item.productId
                              ) ===
                              product.id
                          )
                      )
                      .map(
                        (
                          product
                        ) => (
                          <option
                            key={
                              product.id
                            }
                            value={
                              product.id
                            }
                          >
                            {
                              product.itemId
                            }{" "}
                            ·{" "}
                            {
                              product.name
                            }{" "}
                            (
                            {
                              stock.find(
                                (
                                  item
                                ) =>
                                  item.productId ===
                                  product.id
                              )
                                ?.unitsOnHand
                            }{" "}
                            on hand)
                          </option>
                        )
                      )}
                  </select>
                </Field>

                <Field label="Quantity">
                  <input
                    required
                    type="number"
                    min="1"
                    step="1"
                    max={
                      stock.find(
                        (
                          item
                        ) =>
                          item.productId ===
                          Number(
                            line.productId
                          )
                      )
                        ?.unitsOnHand ??
                      0
                    }
                    style={
                      controlStyle
                    }
                    value={
                      line.quantity
                    }
                    onChange={(
                      event
                    ) =>
                      updateLine(
                        line.key,
                        "quantity",
                        event
                          .target
                          .value
                      )
                    }
                  />
                </Field>

                <Field label="Unit Sale Price">
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    style={
                      controlStyle
                    }
                    value={
                      line.unitSalePrice
                    }
                    onChange={(
                      event
                    ) =>
                      updateLine(
                        line.key,
                        "unitSalePrice",
                        event
                          .target
                          .value
                      )
                    }
                  />
                </Field>

                <div
                  style={{
                    alignSelf:
                      "end",
                  }}
                >
                  <button
                    type="button"
                    style={
                      controlStyle
                    }
                    disabled={
                      lines.length ===
                      1
                    }
                    onClick={() =>
                      setLines(
                        (
                          current
                        ) =>
                          current.filter(
                            (
                              item
                            ) =>
                              item.key !==
                              line.key
                          )
                      )
                    }
                  >
                    Remove Line
                  </button>
                </div>
              </div>
            )
          )}

          <button
            type="button"
            style={{
              ...controlStyle,
              marginTop:
                "16px",
            }}
            disabled={
              lines.length >=
              available.length
            }
            onClick={() => {
              const product =
                available.find(
                  (item) =>
                    !lines.some(
                      (
                        line
                      ) =>
                        Number(
                          line.productId
                        ) ===
                        item.id
                    )
                );

              setLines(
                (current) => [
                  ...current,
                  makeLine(
                    product,
                    nextKey.current++
                  ),
                ]
              );
            }}
          >
            Add Product
          </button>

          <div
            style={{
              marginTop:
                "16px",
            }}
          >
            <Field label="Notes">
              <textarea
                style={
                  controlStyle
                }
                rows={2}
                value={notes}
                onChange={(
                  event
                ) =>
                  setNotes(
                    event
                      .target
                      .value
                  )
                }
              />
            </Field>
          </div>

          <p>
            <strong>
              Total Revenue:{" "}
              {money(
                Number.isFinite(
                  revenueCents
                )
                  ? revenueCents /
                      100
                  : 0
              )}
            </strong>{" "}
            · FIFO cost and profit
            are calculated when
            saved.
          </p>

          {error && (
            <p role="alert">
              {error}
            </p>
          )}

          <div
            style={{
              display: "flex",
              justifyContent:
                "flex-end",
              gap: "10px",
            }}
          >
            <button
              type="button"
              style={
                controlStyle
              }
              onClick={
                onCancel
              }
            >
              Cancel
            </button>

            <button
              type="submit"
              className="primary-button"
              disabled={
                available.length ===
                0
              }
            >
              {saving
                ? "Saving..."
                : "Save & Finalize Sale"}
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}

// ---------------------------------------------------------
// SHARED UI
// ---------------------------------------------------------

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection:
          "column",
        gap: "7px",
        minWidth: 0,
        fontSize: "12px",
        color: "#c8c8cd",
      }}
    >
      {label}
      {children}
    </label>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <article className="metric-card">
      <span className="metric-label">
        {label}
      </span>

      <strong className="metric-value">
        {value}
      </strong>
    </article>
  );
}

function Table({
  headings,
  children,
}: {
  headings: string[];
  children: ReactNode;
}) {
  return (
    <div
      style={{
        overflowX:
          "auto",
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse:
            "collapse",
        }}
      >
        <thead>
          <tr>
            {headings.map(
              (heading) => (
                <th
                  key={
                    heading
                  }
                  style={{
                    padding:
                      "14px 16px",
                    textAlign:
                      "left",
                    color:
                      "#898a91",
                    fontSize:
                      "11px",
                    whiteSpace:
                      "nowrap",
                  }}
                >
                  {heading}
                </th>
              )
            )}
          </tr>
        </thead>

        <tbody>
          {children}
        </tbody>
      </table>
    </div>
  );
}

function Cell({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <td
      style={{
        padding:
          "14px 16px",
        borderTop:
          "1px solid #303137",
        fontSize: "13px",
        color: "#a7a7ad",
        whiteSpace:
          "nowrap",
      }}
    >
      {children}
    </td>
  );
}

const controlStyle = {
  padding: "10px 12px",
  border:
    "1px solid #303137",
  borderRadius: "7px",
  background: "#18191d",
  color: "#c8c8cd",
  fontSize: "12px",
  minWidth: 0,
};

const formGrid = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "14px",
};