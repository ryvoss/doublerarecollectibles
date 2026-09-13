import { Fragment, useEffect, useState } from "react";
import type { ReactNode } from "react";

type InventoryItem = {
  productId: number;
  itemId: string;
  productName: string;
  productType: "SEALED" | "SINGLE";
  unitsReceived: number;
  unitsSold: number;
  unitsOnHand: number;
  inventoryValue: number;
  expectedSalePrice: number;
  retailValue: number;
  potentialGrossProfit: number;
  batchCount: number;
};

type InventoryDetail = {
  product: {id: number; itemId: string; name: string};
  batches: {
    batchId: number;
    orderNumber: string;
    orderDate: string;
    quantityReceived: number;
    quantitySold: number;
    quantityRemaining: number;
    landedCost: number;
    landedUnitCost: number;
    allocatedCost: number;
    remainingValue: number;
  }[];
};

const money = (value: number) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD",
}).format(value);

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<InventoryDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/inventory", {signal: controller.signal});
        if (!response.ok) throw new Error("Inventory could not be loaded.");
        const data: InventoryItem[] = await response.json();
        if (!controller.signal.aborted) setItems(data.filter((item) => item.productType === "SEALED"));
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Inventory could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    if (selectedId === null) return;
    const controller = new AbortController();
    async function loadDetail() {
      setDetail(null);
      setDetailError(null);
      try {
        const response = await fetch(`/api/inventory/${selectedId}`, {signal: controller.signal});
        if (!response.ok) throw new Error("Inventory batches could not be loaded.");
        const data: InventoryDetail = await response.json();
        if (!controller.signal.aborted) setDetail(data);
      } catch (error) {
        if (!controller.signal.aborted) setDetailError(error instanceof Error ? error.message : "Inventory batches could not be loaded.");
      }
    }
    void loadDetail();
    return () => controller.abort();
  }, [selectedId, refresh]);

  const query = search.trim().toLowerCase();
  const visibleItems = items.filter((item) =>
    `${item.itemId} ${item.productName}`.toLowerCase().includes(query) &&
    (stockFilter === "all" || (stockFilter === "in" ? item.unitsOnHand > 0 : item.unitsOnHand === 0))
  );
  // Sum monetary API values in cents; batch accounting remains on the backend.
  const totalValue = items.reduce((sum, item) => sum + Math.round(item.inventoryValue * 100), 0) / 100;
  const totalRetail = items.reduce((sum, item) => sum + Math.round(item.retailValue * 100), 0) / 100;

  return (
    <>
      <div className="panel-header">
        <div><h3>Sealed Inventory</h3><p>Active, sellable products. Inventory is added when orders are finalized.</p></div>
        <button className="primary-button" type="button" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Refresh</button>
      </div>
      {error && <p role="alert">{error}</p>}
      {loading ? <p role="status">Loading inventory...</p> : !error && <>
        <div className="metric-grid">
          <Metric label="Units on Hand" value={String(items.reduce((sum, item) => sum + item.unitsOnHand, 0))} />
          <Metric label="Historical Inventory Cost" value={money(totalValue)} />
          <Metric label="Expected Retail Value" value={money(totalRetail)} />
          <Metric label="Potential Gross Profit" value={money(totalRetail - totalValue)} />
        </div>
        <section className="panel">
          <div className="panel-header">
            <input aria-label="Search inventory" placeholder="Search Item ID or product" value={search} onChange={(event) => setSearch(event.target.value)} style={controlStyle} />
            <select aria-label="Stock filter" value={stockFilter} onChange={(event) => setStockFilter(event.target.value)} style={controlStyle}>
              <option value="all">All products</option><option value="in">In stock</option><option value="out">Out of stock</option>
            </select>
          </div>
          <p style={{padding: "0 20px", color: "#898a91"}}>Totals above include all listed inventory. Retail estimates use current expected prices; unset prices count as zero.</p>
          {visibleItems.length === 0 ? <p style={{padding: "20px"}}>No inventory matches. Finalize a purchase order to receive stock.</p> :
            <Table headings={["Item ID", "Product", "Received", "Sold", "On Hand", "Historical Cost", "Expected Price", "Retail Value", "Batches"]}>
              {visibleItems.map((item) => <Fragment key={item.productId}><tr style={{background: selectedId === item.productId ? "#202025" : undefined}}>
                <Cell>{item.itemId}</Cell><Cell>{item.productName}</Cell>
                <Cell>{item.unitsReceived}</Cell><Cell>{item.unitsSold}</Cell><Cell>{item.unitsOnHand}</Cell>
                <Cell>{money(item.inventoryValue)}</Cell><Cell>{money(item.expectedSalePrice)}</Cell><Cell>{money(item.retailValue)}</Cell>
                <Cell><button type="button" style={controlStyle}
                  aria-label={`${selectedId === item.productId ? "Hide" : "View"} batches for ${item.productName}`}
                  aria-expanded={selectedId === item.productId}
                  aria-controls={`inventory-batches-${item.productId}`}
                  onClick={() => {
                  if (selectedId !== item.productId) {
                    setDetail(null);
                    setDetailError(null);
                    setSelectedId(item.productId);
                  } else {
                    setSelectedId(null);
                  }
                }}>{selectedId === item.productId ? "Hide Batches \u25b4" : `View Batches (${item.batchCount}) \u25be`}</button></Cell>
              </tr>
              {selectedId === item.productId && <tr>
                <td colSpan={9} style={{padding: "0 20px 20px", background: "#131418", borderBottom: "1px solid #353039"}}>
                  <section id={`inventory-batches-${item.productId}`} aria-label={`Batches for ${item.productName}`}
                    style={{borderLeft: "3px solid #a63737", padding: "16px 20px"}}>
                    <h4 style={{margin: "0 0 6px", color: "#e5e5e7"}}>{item.productName} — Purchase Batches</h4>
                    <p style={{margin: "0 0 16px", color: "#898a91", fontSize: "12px"}}>Oldest purchase first (FIFO). Each batch keeps its own historical cost.</p>
                    {detailError ? <p role="alert">{detailError}</p> : !detail || detail.product.id !== item.productId ?
                      <p role="status">Loading batches...</p> : detail.batches.length === 0 ?
                      <p>No inventory batches yet.</p> :
                      <div style={{display: "grid", gap: "12px"}}>
                        {detail.batches.map((batch) => <article key={batch.batchId}
                          style={{padding: "16px", background: "#1b1c21", border: "1px solid #303137", borderRadius: "8px"}}>
                          <div style={{display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", marginBottom: "14px"}}>
                            <strong style={{fontSize: "13px", color: "#e5e5e7"}}>Batch #{batch.batchId} · {batch.orderNumber}</strong>
                            <span style={{fontSize: "12px", color: "#a7a7ad"}}>Purchased {batch.orderDate.slice(0, 10)}{batch.quantityRemaining === 0 ? " · Depleted" : ""}</span>
                          </div>
                          <dl style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "16px", margin: 0}}>
                            <BatchValue label="Received" value={String(batch.quantityReceived)} />
                            <BatchValue label="Sold" value={String(batch.quantitySold)} />
                            <BatchValue label="Remaining Units" value={String(batch.quantityRemaining)} />
                            <BatchValue label="Original Landed Cost" value={money(batch.landedCost)} />
                            <BatchValue label="Cost per Unit" value={money(batch.landedUnitCost)} />
                            <BatchValue label="COGS Allocated" value={money(batch.allocatedCost)} />
                            <BatchValue label="Remaining Value" value={money(batch.remainingValue)} />
                          </dl>
                        </article>)}
                      </div>}
                  </section>
                </td>
              </tr>}
              </Fragment>)}
            </Table>}
        </section>
      </>}
    </>
  );
}

function Metric({label, value}: {label: string; value: string}) {
  return <article className="metric-card"><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong></article>;
}

function BatchValue({label, value}: {label: string; value: string}) {
  return <div>
    <dt style={{color: "#898a91", fontSize: "11px", marginBottom: "5px"}}>{label}</dt>
    <dd style={{margin: 0, color: "#e5e5e7", fontSize: "13px", fontVariantNumeric: "tabular-nums"}}>{value}</dd>
  </div>;
}

function Table({headings, children}: {headings: string[]; children: ReactNode}) {
  return <div style={{overflowX: "auto"}}><table style={{width: "100%", borderCollapse: "collapse", minWidth: "950px"}}>
    <thead><tr>{headings.map((heading) => <th key={heading} style={{padding: "14px 20px", textAlign: "left", color: "#898a91", fontSize: "11px", whiteSpace: "nowrap"}}>{heading}</th>)}</tr></thead>
    <tbody>{children}</tbody>
  </table></div>;
}

function Cell({children}: {children: ReactNode}) {
  return <td style={{padding: "16px 20px", borderTop: "1px solid #24252a", color: "#a7a7ad", fontSize: "13px", whiteSpace: "nowrap"}}>{children}</td>;
}

const controlStyle = {
  padding: "9px 12px", border: "1px solid #303137", borderRadius: "7px",
  background: "#18191d", color: "#c8c8cd", fontSize: "12px",
};
