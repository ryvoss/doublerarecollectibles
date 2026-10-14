import { adminFetch } from "../adminFetch";
import { controlStyle } from "../components/uiStyles";
import { Fragment, useEffect, useState } from "react";
import type { ReactNode } from "react";
import PublicListingManager from "../components/PublicListingManager";

type InventoryItem = {
  productId: number;
  itemId: string;
  productName: string;
  productType: "SEALED" | "SINGLE";
  unitsPurchased: number;
  unitsReceived: number;
  unitsInbound: number;
  unitsSold: number;
  unitsOnHand: number;
  inventoryValue: number;
  onHandInventoryValue: number;
  inboundInventoryValue: number;
  expectedSalePrice: number;
  retailValue: number;
  potentialGrossProfit: number;
  batchCount: number;
  packPoolCount: number;
  unitType: "CASE" | "BOX" | "ITEM";
  packsPerBox: number | null;
  packDisplayName: string | null;
  defaultPackPrice: number | null;
};

type PackInventoryItem = {
  sourceBoxProductId: number;
  itemId: string;
  sourceBoxProductName: string;
  packDisplayName: string;
  packsOnHand: number;
  remainingCostBasis: number;
  costPerPack: number;
  defaultPackPrice: number | null;
  expectedRetailValue: number | null;
  potentialGrossProfit: number | null;
  potentialGrossMargin: number | null;
  poolCount: number;
};

type PackBreakdownPreview = {
  availableBoxes: number;
  quantityBoxes: number;
  packsPerBox: number;
  packDisplayName: string;
  packsCreated: number;
  transferredCostBasis: number;
  costPerPack: number;
  defaultPackPrice: number | null;
  expectedRetailValue: number | null;
};

type InventoryDetail = {
  product: {id: number; itemId: string; name: string};
  batches: {
    batchId: number;
    orderNumber: string;
    orderDate: string;
    quantityPurchased: number;
    quantityReceived: number;
    quantityInbound: number;
    quantitySold: number;
    quantityConverted: number;
    quantityRemaining: number;
    landedCost: number;
    landedUnitCost: number;
    allocatedCost: number;
    remainingValue: number;
    onHandValue: number;
    inboundValue: number;
    correctionCount: number;
    corrections: Array<{
      id: number;
      reason: string;
      notes: string | null;
      createdAt: string;
      oldOrderTotal: number;
      newOrderTotal: number;
      changes: Array<{ id: number; field: string; oldValue: number; newValue: number }>;
    }>;
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
  const [sort, setSort] = useState("name");
  const [stockFilter, setStockFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<InventoryDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [showPublicListings, setShowPublicListings] = useState(false);
  const [packInventory, setPackInventory] = useState<PackInventoryItem[]>([]);
  const [breakdown, setBreakdown] = useState<InventoryItem | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [inventoryResponse, packResponse] = await Promise.all([
          adminFetch("/api/inventory", {signal: controller.signal}),
          adminFetch("/api/pack-pools/inventory", {signal: controller.signal}),
        ]);
        if (!inventoryResponse.ok || !packResponse.ok) throw new Error("Inventory could not be loaded.");
        const [data, packData] = await Promise.all([
          inventoryResponse.json() as Promise<InventoryItem[]>,
          packResponse.json() as Promise<PackInventoryItem[]>,
        ]);
        if (!controller.signal.aborted) {
          setItems(data.filter((item) => item.productType === "SEALED"));
          setPackInventory(packData);
        }
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
        const response = await adminFetch(`/api/inventory/${selectedId}`, {signal: controller.signal});
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
  ).sort((a, b) => {
    const difference = sort === "stock" ? b.unitsOnHand - a.unitsOnHand
      : sort === "cost" ? b.inventoryValue - a.inventoryValue
      : sort === "profit" ? b.potentialGrossProfit - a.potentialGrossProfit
      : a.productName.localeCompare(b.productName);
    return difference || a.productId - b.productId;
  });
  // Sum monetary API values in cents; batch accounting remains on the backend.
  const totalValue = (items.reduce((sum, item) => sum + Math.round(item.inventoryValue * 100), 0) +
    packInventory.reduce((sum, item) => sum + Math.round(item.remainingCostBasis * 100), 0)) / 100;
  const totalOnHandValue = (items.reduce((sum, item) => sum + Math.round(item.onHandInventoryValue * 100), 0) +
    packInventory.reduce((sum, item) => sum + Math.round(item.remainingCostBasis * 100), 0)) / 100;
  const totalInboundValue = items.reduce((sum, item) => sum + Math.round(item.inboundInventoryValue * 100), 0) / 100;
  const totalRetail = (items.reduce((sum, item) => sum + Math.round(item.retailValue * 100), 0) +
    packInventory.reduce((sum, item) => sum + Math.round((item.expectedRetailValue ?? 0) * 100), 0)) / 100;

  return (
    <div className="inventory-page">
      <div className="page-heading">
        <div><h2>Sealed Inventory</h2><p>Owned inventory is recorded at finalization; only received units are physically available.</p></div>
        <div className="inventory-page-actions">
          <button className="primary-button" type="button" onClick={() => setShowPublicListings(true)}>Manage Public Listings</button>
          <button className="secondary-button" type="button" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Refresh</button>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      {message && <p className="inventory-success" role="status">{message}</p>}
      {loading ? <p role="status">Loading inventory...</p> : !error && <>
        <div className="metric-grid inventory-metrics">
          <Metric detail={`${items.filter((item) => item.unitsOnHand > 0).length} products in stock`} label="Units on Hand" value={String(items.reduce((sum, item) => sum + item.unitsOnHand, 0))} />
          <Metric detail="Not yet physically received" label="Inbound Units" value={String(items.reduce((sum, item) => sum + item.unitsInbound, 0))} />
          <Metric detail="Received sealed stock and derived packs" label="On-Hand Inventory at Cost" value={money(totalOnHandValue)} />
          <Metric detail="Owned inventory still on the way" label="Inventory In Transit at Cost" value={money(totalInboundValue)} />
          <Metric detail="On hand + in transit" label="Total Owned Inventory Cost" value={money(totalValue)} />
          <Metric detail="Estimate at current product prices" label="Expected Retail Value" value={money(totalRetail)} />
          <Metric detail={totalRetail > 0 ? `${((totalRetail - totalOnHandValue) / totalRetail * 100).toFixed(1)}% potential margin` : "Margin unavailable without retail value"} label="Potential Gross Profit" value={money(totalRetail - totalOnHandValue)} />
        </div>
        <section className="panel">
          <div className="panel-header inventory-toolbar">
            <input aria-label="Search inventory" placeholder="Search Item ID or product" value={search} onChange={(event) => setSearch(event.target.value)} style={controlStyle} />
            <select aria-label="Stock filter" value={stockFilter} onChange={(event) => setStockFilter(event.target.value)} style={controlStyle}>
              <option value="all">All products</option><option value="in">In stock</option><option value="out">Out of stock</option>
            </select>
            <select aria-label="Sort inventory" value={sort} onChange={(event) => setSort(event.target.value)} style={controlStyle}>
              <option value="name">Product name A-Z</option><option value="stock">Most units on hand</option>
              <option value="cost">Highest inventory cost</option><option value="profit">Highest potential profit</option>
            </select>
          </div>
          <p className="inventory-caption">{visibleItems.length} of {items.length} products. Totals above include all listed inventory. Retail estimates use current expected prices; unset prices count as zero.</p>
          {visibleItems.length === 0 ? <div className="empty-state"><strong>{items.length === 0 ? "No sealed inventory yet" : "No matching products"}</strong><p>{items.length === 0 ? "Finalize a purchase order to receive inventory." : "Try another search or stock filter."}</p></div> :
            <Table headings={["Item ID", "Product", "Purchased", "Received", "Inbound", "Sold", "On Hand", "Owned Cost", "Expected Price", "Retail Value", "Potential Profit", "Margin", "Batches", "Actions"]}>
              {visibleItems.map((item) => <Fragment key={item.productId}><tr className="expandable-row" onClick={(event) => {
                if ((event.target as HTMLElement).closest("button, a, input, select")) return;
                if (selectedId !== item.productId) { setDetail(null); setDetailError(null); setSelectedId(item.productId); }
                else setSelectedId(null);
              }} style={{background: selectedId === item.productId ? "#202025" : undefined}}>
                <Cell>{item.itemId}</Cell><Cell><strong>{item.productName}</strong></Cell>
                <Cell>{item.unitsPurchased}</Cell><Cell>{item.unitsReceived}</Cell><Cell>{item.unitsInbound}</Cell><Cell>{item.unitsSold}</Cell><Cell><span className={item.unitsOnHand > 0 ? "inventory-stock" : "inventory-stock is-empty"}>{item.unitsOnHand > 0 ? item.unitsOnHand : "Out of stock"}</span></Cell>
                <Cell>{money(item.inventoryValue)}</Cell><Cell>{money(item.expectedSalePrice)}</Cell><Cell>{money(item.retailValue)}</Cell>
                <Cell><span className={item.potentialGrossProfit < 0 ? "inventory-negative" : "inventory-profit"}>{money(item.potentialGrossProfit)}</span></Cell>
                <Cell>{item.retailValue > 0 ? `${(item.potentialGrossProfit / item.retailValue * 100).toFixed(1)}%` : "N/A"}</Cell>
                <Cell><button type="button" className="inventory-batch-toggle"
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
                }}>{selectedId === item.productId ? "Batches \u25b4" : `Batches (${item.batchCount}) \u25be`}</button></Cell>
                <Cell>{item.unitType === "BOX" && <button type="button" className="inventory-breakdown-button" disabled={item.unitsOnHand <= 0} onClick={() => {
                  setMessage(null);
                  setBreakdown(item);
                }}>Break Down</button>}</Cell>
              </tr>
              {selectedId === item.productId && <tr>
                <td colSpan={14} className="inventory-expanded">
                  <section id={`inventory-batches-${item.productId}`} aria-label={`Batches for ${item.productName}`}
                    className="inventory-batch-section">
                    <h4 style={{margin: "0 0 6px", color: "#e5e5e7"}}>{item.productName} — Purchase Batches</h4>
                    <p style={{margin: "0 0 16px", color: "#898a91", fontSize: "12px"}}>Oldest purchase first (FIFO). Each batch keeps its own historical cost.</p>
                    {detailError ? <p role="alert">{detailError}</p> : !detail || detail.product.id !== item.productId ?
                      <p role="status">Loading batches...</p> : detail.batches.length === 0 ?
                      <p>No inventory batches yet.</p> :
                      <div style={{display: "grid", gap: "12px"}}>
                        {detail.batches.map((batch) => <article key={batch.batchId}
                          className="inventory-batch-card">
                          <div style={{display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", marginBottom: "14px"}}>
                            <strong style={{fontSize: "13px", color: "#e5e5e7"}}>Batch #{batch.batchId} · {batch.orderNumber}</strong>
                            <span style={{fontSize: "12px", color: "#a7a7ad"}}>Purchased {batch.orderDate.slice(0, 10)}{batch.quantityRemaining === 0 ? " · Depleted" : ""}</span>
                          </div>
                          <dl className="inventory-batch-values">
                            <BatchValue label="Purchased / Owned" value={String(batch.quantityPurchased)} />
                            <BatchValue label="Physically Received" value={String(batch.quantityReceived)} />
                            <BatchValue label="Inbound" value={String(batch.quantityInbound)} />
                            <BatchValue label="Sold" value={String(batch.quantitySold)} />
                            <BatchValue label="Converted to Packs" value={String(batch.quantityConverted)} />
                            <BatchValue label="On Hand" value={String(batch.quantityRemaining)} />
                            <BatchValue label="Original Landed Cost" value={money(batch.landedCost)} />
                            <BatchValue label="Cost per Unit" value={money(batch.landedUnitCost)} />
                            <BatchValue label="COGS Allocated" value={money(batch.allocatedCost)} />
                            <BatchValue label="On-Hand Cost" value={money(batch.onHandValue)} />
                            <BatchValue label="Inbound Cost" value={money(batch.inboundValue)} />
                            <BatchValue label="Total Owned Cost" value={money(batch.remainingValue)} />
                          </dl>
                          {batch.correctionCount > 0 && <details className="inventory-correction-history"><summary><span className="orders-corrected-badge">Corrected{batch.correctionCount > 1 ? ` ×${batch.correctionCount}` : ""}</span> View cost history</summary><div>{batch.corrections.map((correction, index) => <article key={correction.id}><strong>Correction #{index + 1} · {correction.reason}</strong><small>{new Date(correction.createdAt).toLocaleDateString()} · Order total {money(correction.oldOrderTotal)} → {money(correction.newOrderTotal)}</small>{correction.changes.map(change => <span key={change.id}>{inventoryCorrectionLabel(change.field)}: {inventoryCorrectionValue(change.field, change.oldValue)} → {inventoryCorrectionValue(change.field, change.newValue)}</span>)}</article>)}</div></details>}
                        </article>)}
                      </div>}
                  </section>
                </td>
              </tr>}
              </Fragment>)}
            </Table>}
        </section>
        <PackInventorySection items={packInventory} />
      </>}
      {showPublicListings && (
        <PublicListingManager onClose={() => setShowPublicListings(false)} />
      )}
      {breakdown && <PackBreakdownModal item={breakdown} onClose={() => setBreakdown(null)} onComplete={(text) => {
        setBreakdown(null);
        setMessage(text);
        setSelectedId(null);
        setRefresh((value) => value + 1);
        window.dispatchEvent(new Event("business-data-changed"));
      }} />}
    </div>
  );
}

function Metric({label, value, detail}: {label: string; value: string; detail: string}) {
  return <article className="metric-card"><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong><span className="metric-detail">{detail}</span></article>;
}

function BatchValue({label, value}: {label: string; value: string}) {
  return <div>
    <dt style={{color: "#898a91", fontSize: "11px", marginBottom: "5px"}}>{label}</dt>
    <dd style={{margin: 0, color: "#e5e5e7", fontSize: "13px", fontVariantNumeric: "tabular-nums"}}>{value}</dd>
  </div>;
}

function Table({headings, children}: {headings: string[]; children: ReactNode}) {
  return <div className="table-scroll"><table className="inventory-table">
    <thead><tr>{headings.map((heading) => <th key={heading} >{heading}</th>)}</tr></thead>
    <tbody>{children}</tbody>
  </table></div>;
}

function Cell({children}: {children: ReactNode}) {
  return <td >{children}</td>;
}

function inventoryCorrectionLabel(field: string) {
  return ({ SHIPPING_COST: "Shipping", TARIFF_COST: "Tariffs", OTHER_COST: "Other Cost", ADJUSTMENT: "Adjustment", PRODUCT_COST: "Product Cost", LANDED_COST: "Landed Cost", LANDED_UNIT_COST: "Landed Cost / Unit" } as Record<string, string>)[field] ?? field;
}

function inventoryCorrectionValue(field: string, value: number) {
  return field === "LANDED_UNIT_COST" ? `$${value.toFixed(6)}` : money(value);
}

function PackInventorySection({items}: {items: PackInventoryItem[]}) {
  const totalPacks = items.reduce((sum, item) => sum + item.packsOnHand, 0);
  const totalCost = items.reduce((sum, item) => sum + Math.round(item.remainingCostBasis * 100), 0) / 100;
  return <section className="panel pack-inventory-panel" aria-labelledby="pack-inventory-title">
    <div className="panel-header pack-inventory-header"><div><span>Inventory transformation</span><h3 id="pack-inventory-title">Pack Inventory</h3><p>Current PackPool inventory prepared from sealed boxes. This is a breakout of inventory already included in the totals above.</p></div><div><strong>{totalPacks}</strong><span>Packs on hand</span><small>{money(totalCost)} cost basis</small></div></div>
    {items.length === 0 ? <div className="empty-state"><strong>No pack inventory yet</strong><p>Use Break Down on a Box product to configure and prepare packs before a Show.</p></div> : <div className="table-scroll"><table className="pack-inventory-table">
      <thead><tr><th>Derived Pack Inventory</th><th>Packs On Hand</th><th>Remaining Cost</th><th>Cost / Pack</th><th>Default Price</th><th>Expected Retail</th><th>Potential Profit</th><th>Potential Margin</th></tr></thead>
      <tbody>{items.map(item => <tr key={item.sourceBoxProductId}><td><strong>{item.packDisplayName}</strong><small>From {item.sourceBoxProductName} · {item.itemId} · {item.poolCount} pool{item.poolCount === 1 ? "" : "s"}</small></td><td>{item.packsOnHand}</td><td>{money(item.remainingCostBasis)}</td><td>{money(item.costPerPack)}</td><td>{item.defaultPackPrice === null ? "—" : money(item.defaultPackPrice)}</td><td>{item.expectedRetailValue === null ? "—" : money(item.expectedRetailValue)}</td><td>{item.potentialGrossProfit === null ? "—" : money(item.potentialGrossProfit)}</td><td>{item.potentialGrossMargin === null ? "—" : `${(item.potentialGrossMargin * 100).toFixed(1)}%`}</td></tr>)}</tbody>
    </table></div>}
  </section>;
}

function PackBreakdownModal({item, onClose, onComplete}: {
  item: InventoryItem;
  onClose: () => void;
  onComplete: (message: string) => void;
}) {
  const initiallyConfigured = item.packsPerBox !== null && item.packDisplayName !== null;
  const [quantity, setQuantity] = useState("1");
  const [packsPerBox, setPacksPerBox] = useState(item.packsPerBox?.toString() ?? "");
  const [packDisplayName, setPackDisplayName] = useState(item.packDisplayName ?? item.productName.replace(/\s+Box$/i, "") + " Pack");
  const [defaultPackPrice, setDefaultPackPrice] = useState(item.defaultPackPrice?.toString() ?? "");
  const [preview, setPreview] = useState<PackBreakdownPreview | null>(null);
  const [previewing, setPreviewing] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const amount = Number(quantity);
    const packCount = Number(packsPerBox);
    const packPrice = defaultPackPrice === "" ? null : Number(defaultPackPrice);
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > item.unitsOnHand) {
      setPreview(null);
      setPreviewing(false);
      setError(`Enter a whole number from 1 to ${item.unitsOnHand}.`);
      return;
    }
    if (!Number.isSafeInteger(packCount) || packCount <= 0 || !packDisplayName.trim()) {
      setPreview(null);
      setPreviewing(false);
      setError(null);
      return;
    }
    if (packPrice !== null && (!Number.isFinite(packPrice) || packPrice < 0)) {
      setPreview(null);
      setPreviewing(false);
      setError("Default pack price must be a valid non-negative amount.");
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        setPreviewing(true);
        setError(null);
        const response = await adminFetch("/api/pack-pools/break-down-preview", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            sourceBoxProductId: item.productId,
            quantityBoxes: amount,
            ...(!initiallyConfigured ? {
              packsPerBox: packCount,
              packDisplayName: packDisplayName.trim(),
              defaultPackPrice: packPrice,
            } : {}),
          }),
          signal: controller.signal,
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error ?? "Breakdown preview could not be calculated.");
        if (!controller.signal.aborted) setPreview(body as PackBreakdownPreview);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setPreview(null);
          setError(cause instanceof Error ? cause.message : "Breakdown preview could not be calculated.");
        }
      } finally {
        if (!controller.signal.aborted) setPreviewing(false);
      }
    }, 150);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [defaultPackPrice, initiallyConfigured, item.productId, item.unitsOnHand, packDisplayName, packsPerBox, quantity]);

  async function confirm() {
    const amount = Number(quantity);
    if (!preview || preview.quantityBoxes !== amount) return;
    try {
      setSaving(true);
      setError(null);
      const response = await adminFetch("/api/pack-pools/break-down", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        // No Show Visit is sent: this creates normal prep inventory.
        body: JSON.stringify({
          sourceBoxProductId: item.productId,
          quantityBoxes: amount,
          ...(!initiallyConfigured ? {
            packsPerBox: Number(packsPerBox),
            packDisplayName: packDisplayName.trim(),
            defaultPackPrice: defaultPackPrice === "" ? null : Number(defaultPackPrice),
          } : {}),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Box inventory could not be broken down.");
      onComplete(`Converted ${amount} × ${item.productName} into ${preview.packsCreated} ${preview.packDisplayName}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Box inventory could not be broken down.");
      setSaving(false);
    }
  }

  return <div className="modal-backdrop inventory-breakdown-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section className="modal-surface inventory-breakdown-modal" role="dialog" aria-modal="true" aria-labelledby="inventory-breakdown-title">
      <header><div><span>Inventory transformation</span><h2 id="inventory-breakdown-title">Break Down Box</h2><p>Transfer sealed box inventory and its exact FIFO cost basis into Pack Inventory.</p></div><button type="button" aria-label="Close" disabled={saving} onClick={onClose}>×</button></header>
      <div className="inventory-breakdown-body">
        <div className="inventory-breakdown-products"><div><span>Source Box</span><strong>{item.productName}</strong><small>{item.unitsOnHand} currently available</small></div><b aria-hidden="true">→</b><div><span>Derived Pack Inventory</span><strong>{packDisplayName.trim() || "Configure below"}</strong><small>{packsPerBox ? `1 Box = ${packsPerBox} Packs` : "Pack metadata required"}</small></div></div>
        {!initiallyConfigured && <div className="inventory-breakdown-configuration">
          <strong>Configure this Box</strong><p>This configuration is saved on the Box Product and reused for future breakdowns.</p>
          <label><span>Packs per Box</span><input type="number" min="1" step="1" value={packsPerBox} disabled={saving} onChange={event => setPacksPerBox(event.target.value)} placeholder="18" /></label>
          <label><span>Pack Display Name</span><input value={packDisplayName} maxLength={160} disabled={saving} onChange={event => setPackDisplayName(event.target.value)} placeholder="Gem 6 Pack" /></label>
          <label><span>Default Pack Price <small>Optional</small></span><input type="number" min="0" step="0.01" value={defaultPackPrice} disabled={saving} onChange={event => setDefaultPackPrice(event.target.value)} placeholder="0.00" /></label>
        </div>}
        <label className="inventory-breakdown-quantity"><span>Boxes to break down</span><input type="number" min="1" max={item.unitsOnHand} step="1" value={quantity} disabled={saving} onChange={event => setQuantity(event.target.value)} /></label>
        {previewing ? <p className="inventory-breakdown-loading" role="status">Calculating FIFO cost transfer…</p> : preview && <dl className="inventory-breakdown-preview">
          <BreakdownValue label="Packs Created" value={String(preview.packsCreated)} />
          <BreakdownValue label="Transferred FIFO Cost" value={money(preview.transferredCostBasis)} />
          <BreakdownValue label="Cost per Pack" value={money(preview.costPerPack)} />
          <BreakdownValue label="Default Pack Price" value={preview.defaultPackPrice === null ? "Not set" : money(preview.defaultPackPrice)} />
          <BreakdownValue label="Expected Retail Created" value={preview.expectedRetailValue === null ? "Unavailable" : money(preview.expectedRetailValue)} />
        </dl>}
        <p className="inventory-breakdown-note">This moves inventory cost only. It creates no Sale, revenue, or FundEntry and is not attached to a Show.</p>
        {error && <p className="inventory-breakdown-error" role="alert">{error}</p>}
      </div>
      <footer><button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancel</button><button type="button" className="primary-button" disabled={saving || previewing || !preview} onClick={() => void confirm()}>{saving ? "Breaking Down…" : preview ? `${initiallyConfigured ? "Break Down" : "Save & Break Down"} — Create ${preview.packsCreated} Packs` : initiallyConfigured ? "Break Down" : "Save & Break Down"}</button></footer>
    </section>
  </div>;
}

function BreakdownValue({label, value}: {label: string; value: string}) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}
