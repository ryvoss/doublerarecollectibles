import { useEffect, useState } from "react";
import "./ReportsPage.css";
import WhatIfPage from "./WhatIfPage";

type Totals = { revenue: number; cogs: number; grossProfit: number; grossMargin: number; unitsSold: number; saleCount: number };
type Product = { productId: number; productName: string; itemId: string; revenue: number; cogs: number; grossProfit: number; grossMargin: number; unitsSold: number };
type Trend = { date: string; revenue: number; cogs: number; grossProfit: number; unitsSold: number; saleCount: number };
type Show = { showId: number; showName: string; visits: number; revenue: number; cogs: number; grossProfit: number; grossMargin: number; unitsSold: number; singlesInventoryChange: number; singlesFundsChange: number; singlesBusinessValueChange: number };
type Visit = { visitId: number; showId: number; showName: string; date: string; status: string; revenue: number; cogs: number; grossProfit: number; grossMargin: number; unitsSold: number; singlesInventoryChange: number | null; singlesFundsChange: number | null; singlesBusinessValueChange: number | null };
type Performance = { totals: Totals; products: Product[]; trends: Trend[]; shows: Show[]; visits: Visit[] };
type Inventory = { productId: number; productName: string; unitsReceived: number; unitsSold: number; unitsOnHand: number; inventoryValue: number; retailValue: number; potentialGrossProfit: number; potentialGrossMargin: number };
type Funds = { sealedBalance: string; singlesBalance: string; totalBusinessFunds: string };
type Section = "Overview" | "Sales" | "Inventory" | "Shows" | "What-If";
type Range = "all" | "month" | "lastMonth" | "30" | "year" | "custom";
const currency = (n: number | string) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n));
const integer = (n: number) => new Intl.NumberFormat("en-US").format(n);
const percent = (n: number) => `${(n * 100).toFixed(1)}%`;
const dateLabel = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
function rangeDates(range: Range, from: string, to: string) {
  if (range === "custom") return { from, to };
  if (range === "all") return { from: "", to: "" };
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const start = range === "month" ? new Date(y, m, 1) : range === "lastMonth" ? new Date(y, m - 1, 1) : range === "year" ? new Date(y, 0, 1) : new Date(y, m, now.getDate() - 29);
  const end = range === "lastMonth" ? new Date(y, m, 0) : now;
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: iso(start), to: iso(end) };
}
function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="metric-card"><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong>{detail && <span className="metric-detail">{detail}</span>}</div>;
}
function Empty({ message }: { message: string }) { return <div className="report-empty">{message}</div>; }
function Panel({ title, detail, children }: { title: string; detail?: string; children: React.ReactNode }) {
  return <section className="panel report-panel"><div className="panel-header"><div><h3>{title}</h3>{detail && <p>{detail}</p>}</div></div><div className="report-panel-body">{children}</div></section>;
}
function Bars({ rows, value, title, format = currency }: { rows: { label: string; amount: number }[]; value: string; title: string; format?: (n: number) => string }) {
  if (!rows.length) return <Empty message="No data for this comparison." />;
  const max = Math.max(...rows.map(row => Math.abs(row.amount)), 1);
  return <div className="report-bars" aria-label={title}>{rows.slice(0, 10).map((row, i) => <div className="report-bar-row" key={`${row.label}-${i}`} title={`${row.label}: ${format(row.amount)}`}><span className="report-bar-name">{row.label}</span><div className="report-bar-track"><span style={{ width: `${Math.max(2, Math.abs(row.amount) / max * 100)}%` }} /></div><strong>{format(row.amount)}</strong></div>)}{rows.length > 10 && <p className="report-note">Showing the top 10 of {rows.length} {value}.</p>}</div>;
}
function TrendChart({ rows }: { rows: Trend[] }) {
  if (!rows.length) return <Empty message="No sales in this date range." />;
  const max = Math.max(...rows.map(row => Math.max(row.revenue, row.cogs)), 1);
  return <><div className="report-trend-legend"><span>● Revenue</span><span>● COGS</span></div><div className="report-trend" role="img" aria-label="Revenue and COGS by sale date">{rows.map(row => <div className="report-trend-day" key={row.date} title={`${dateLabel(row.date)} · Revenue ${currency(row.revenue)} · COGS ${currency(row.cogs)} · Gross profit ${currency(row.grossProfit)}`}><div className="report-trend-columns"><span style={{ height: `${Math.max(2, row.revenue / max * 100)}%` }} /><span style={{ height: `${Math.max(2, row.cogs / max * 100)}%` }} /></div><small>{dateLabel(row.date)}</small></div>)}</div><p className="report-note">Hover over a day for exact Revenue, COGS, and Gross Profit.</p></>;
}
function Table({ heads, children }: { heads: string[]; children: React.ReactNode }) { return <div className="table-scroll report-table-scroll"><table className="report-table"><thead><tr>{heads.map(head => <th key={head}>{head}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }

export default function ReportsPage() {
  const [section, setSection] = useState<Section>("Overview");
  const [range, setRange] = useState<Range>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [productId, setProductId] = useState("");
  const [showId, setShowId] = useState("");
  const [performance, setPerformance] = useState<Performance | null>(null);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [funds, setFunds] = useState<Funds | null>(null);
  const [options, setOptions] = useState<{ products: { id: number; name: string }[]; shows: { id: number; name: string }[] }>({ products: [], shows: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => { const listener = () => setRefresh(n => n + 1); window.addEventListener("business-data-changed", listener); return () => window.removeEventListener("business-data-changed", listener); }, []);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (section === "What-If") return;
      setLoading(true); setError("");
      try {
        const dates = rangeDates(range, from, to);
        if (dates.from && dates.to && dates.from > dates.to) throw new Error("Start date must be before end date.");
        const query = new URLSearchParams();
        if (dates.from) query.set("from", dates.from);
        if (dates.to) query.set("to", dates.to);
        if (productId) query.set("productId", productId);
        if (section === "Shows" && showId) query.set("showId", showId);
        if (section === "Shows") query.set("showOnly", "1");
        const responses = await Promise.all([fetch(`/api/reports/performance?${query}`), fetch("/api/inventory"), fetch("/api/funds/summary"), fetch("/api/products"), fetch("/api/shows")]);
        if (responses.some(response => !response.ok)) throw new Error("Report data could not be loaded. Check that the API is running.");
        const [p, i, f, products, shows] = await Promise.all(responses.map(response => response.json()));
        if (!cancelled) { setPerformance(p); setInventory(i); setFunds(f); setOptions({ products: products.filter((item: { sellable: boolean; type: string }) => item.sellable && item.type === "SEALED").map((item: { id: number; name: string }) => ({ id: item.id, name: item.name })), shows: shows.map((item: { id: number; name: string }) => ({ id: item.id, name: item.name })) }); }
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : "Reports could not be loaded."); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load(); return () => { cancelled = true; };
  }, [section, range, from, to, productId, showId, refresh]);
  const filteredInventory = section === "Inventory" && productId ? inventory.filter(item => String(item.productId) === productId) : inventory;
  const stock = filteredInventory.filter(item => item.unitsOnHand > 0);
  const cost = stock.reduce((sum, item) => sum + Number(item.inventoryValue), 0), retail = stock.reduce((sum, item) => sum + Number(item.retailValue), 0);
  const potential = retail - cost, units = stock.reduce((sum, item) => sum + item.unitsOnHand, 0);
  const totals = performance?.totals;
  const selectedVisits = performance?.visits.filter(visit => !showId || String(visit.showId) === showId) ?? [];
  return <div className="reports-page"><div className="page-heading"><div><h2>Business Reports</h2><p>Performance, current position, and Show results from recorded business activity.</p></div></div>
    <div className="report-tabs" role="tablist" aria-label="Reports sections">{(["Overview", "Sales", "Inventory", "Shows", "What-If"] as Section[]).map(tab => <button key={tab} type="button" role="tab" aria-selected={section === tab} className={section === tab ? "is-active" : ""} onClick={() => setSection(tab)}>{tab}</button>)}</div>
    {section === "What-If" ? <WhatIfPage /> : <>
    <div className="panel report-filters"><label>Sale / visit date <select value={range} onChange={e => setRange(e.target.value as Range)}><option value="all">All Time</option><option value="month">This Month</option><option value="lastMonth">Last Month</option><option value="30">Last 30 Days</option><option value="year">This Year</option><option value="custom">Custom Range</option></select></label>{range === "custom" && <><label>From <input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label>To <input type="date" value={to} onChange={e => setTo(e.target.value)} /></label></>}{(section === "Sales" || section === "Inventory" || section === "Shows") && <label>Product <select value={productId} onChange={e => setProductId(e.target.value)}><option value="">All Products</option>{options.products.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}{section === "Shows" && <label>Recurring Show <select value={showId} onChange={e => setShowId(e.target.value)}><option value="">All Shows</option>{options.shows.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}</div>
    {(section === "Overview" || section === "Inventory") && <p className="report-note">Inventory and Funds are current balances. The date range applies to recorded sales and Show visits.</p>}
    {loading && <div className="panel report-state" role="status">Loading reports…</div>}{error && <div className="panel report-state" role="alert">{error} <button type="button" className="secondary-button" onClick={() => setRefresh(n => n + 1)}>Retry</button></div>}
    {!loading && !error && performance && totals && <>
      {section === "Overview" && <><div className="report-metrics"><Metric label="Sealed Revenue" value={currency(totals.revenue)} detail="Recorded sealed sales" /><Metric label="Gross Profit" value={currency(totals.grossProfit)} /><Metric label="Gross Margin" value={percent(totals.grossMargin)} /><Metric label="Inventory Cost Value" value={currency(cost)} detail="Current stock" /><Metric label="Inventory Retail Value" value={currency(retail)} /><Metric label="Potential Inventory Profit" value={currency(potential)} /><Metric label="Units On Hand" value={integer(units)} /><Metric label="Total Business Funds" value={currency(funds?.totalBusinessFunds ?? 0)} detail={`Sealed ${currency(funds?.sealedBalance ?? 0)} · Singles ${currency(funds?.singlesBalance ?? 0)}`} /></div><div className="report-two"><Panel title="Revenue and COGS over time" detail="Daily sealed sales in the selected range"><TrendChart rows={performance.trends} /></Panel><Panel title="Current business position" detail="Funds and inventory at current values"><div className="report-position"><div><span>Sealed Funds</span><strong>{currency(funds?.sealedBalance ?? 0)}</strong></div><div><span>Singles Funds</span><strong>{currency(funds?.singlesBalance ?? 0)}</strong></div><div><span>Inventory Cost Value</span><strong>{currency(cost)}</strong></div><div><span>Inventory Retail Potential</span><strong>{currency(retail)}</strong></div></div></Panel></div></>}
      {section === "Sales" && <><div className="report-metrics"><Metric label="Revenue" value={currency(totals.revenue)} /><Metric label="COGS" value={currency(totals.cogs)} /><Metric label="Gross Profit" value={currency(totals.grossProfit)} /><Metric label="Gross Margin" value={percent(totals.grossMargin)} /><Metric label="Units Sold" value={integer(totals.unitsSold)} /><Metric label="Sales" value={integer(totals.saleCount)} /><Metric label="Average Sale Value" value={currency(totals.saleCount ? totals.revenue / totals.saleCount : 0)} /><Metric label="Average Profit / Sale" value={currency(totals.saleCount ? totals.grossProfit / totals.saleCount : 0)} /></div><div className="report-two"><Panel title="Revenue and COGS over time"><TrendChart rows={performance.trends} /></Panel><Panel title="Top products by Revenue"><Bars title="Product Revenue" value="products" rows={performance.products.map(p => ({ label: p.productName, amount: p.revenue })).sort((a, b) => b.amount - a.amount)} /></Panel><Panel title="Top products by Gross Profit"><Bars title="Product Gross Profit" value="products" rows={performance.products.map(p => ({ label: p.productName, amount: p.grossProfit })).sort((a, b) => b.amount - a.amount)} /></Panel><Panel title="Top products by Units Sold"><Bars title="Product Units Sold" value="products" format={integer} rows={performance.products.map(p => ({ label: p.productName, amount: p.unitsSold })).sort((a, b) => b.amount - a.amount)} /></Panel></div><Panel title="Product performance" detail="Exact sealed sale totals by product"><Table heads={["Product", "Revenue", "COGS", "Gross Profit", "Gross Margin", "Units Sold"]}>{performance.products.map(p => <tr key={p.productId}><td><strong>{p.productName}</strong><small>{p.itemId}</small></td><td>{currency(p.revenue)}</td><td>{currency(p.cogs)}</td><td>{currency(p.grossProfit)}</td><td>{percent(p.grossMargin)}</td><td>{integer(p.unitsSold)}</td></tr>)}</Table>{!performance.products.length && <Empty message="No sealed product sales in this range." />}</Panel></>}
      {section === "Inventory" && <><div className="report-metrics"><Metric label="Inventory Cost Value" value={currency(cost)} /><Metric label="Inventory Retail Value" value={currency(retail)} /><Metric label="Potential Gross Profit" value={currency(potential)} /><Metric label="Potential Gross Margin" value={percent(retail ? potential / retail : 0)} /><Metric label="Units On Hand" value={integer(units)} /><Metric label="Products In Stock" value={integer(stock.length)} /></div><div className="report-two"><Panel title="Inventory cost by product"><Bars title="Inventory cost by product" value="products" rows={stock.map(i => ({ label: i.productName, amount: Number(i.inventoryValue) })).sort((a, b) => b.amount - a.amount)} /></Panel><Panel title="Retail potential by product"><Bars title="Retail value by product" value="products" rows={stock.map(i => ({ label: i.productName, amount: Number(i.retailValue) })).sort((a, b) => b.amount - a.amount)} /></Panel></div><Panel title="Inventory performance" detail="Current stock position and recorded sales in the selected date range"><Table heads={["Product", "Received", "Sold", "On Hand", "Cost Value", "Retail Value", "Revenue", "COGS", "Gross Profit", "Margin"]}>{filteredInventory.map(i => { const sold = performance.products.find(p => p.productId === i.productId); return <tr key={i.productId}><td><strong>{i.productName}</strong></td><td>{integer(i.unitsReceived)}</td><td>{integer(i.unitsSold)}</td><td>{integer(i.unitsOnHand)}</td><td>{currency(i.inventoryValue)}</td><td>{currency(i.retailValue)}</td><td>{currency(sold?.revenue ?? 0)}</td><td>{currency(sold?.cogs ?? 0)}</td><td>{currency(sold?.grossProfit ?? 0)}</td><td>{percent(sold?.grossMargin ?? 0)}</td></tr>; })}</Table>{!filteredInventory.length && <Empty message="No inventory products are available." />}</Panel></>}
      {section === "Shows" && <><div className="report-metrics"><Metric label="Show Visits" value={integer(performance.shows.reduce((n, s) => n + s.visits, 0))} /><Metric label="Sealed Revenue" value={currency(performance.shows.reduce((n, s) => n + s.revenue, 0))} /><Metric label="Sealed Gross Profit" value={currency(performance.shows.reduce((n, s) => n + s.grossProfit, 0))} /><Metric label="Units Sold" value={integer(performance.shows.reduce((n, s) => n + s.unitsSold, 0))} /><Metric label="Singles Inventory Change" value={currency(performance.shows.reduce((n, s) => n + s.singlesInventoryChange, 0))} detail="Finalized visits only · value change, not profit" /><Metric label="Singles Funds Change" value={currency(performance.shows.reduce((n, s) => n + s.singlesFundsChange, 0))} detail="Finalized visit snapshots" /></div><div className="report-two"><Panel title="Sealed Revenue by recurring Show"><Bars title="Revenue by Show" value="Shows" rows={performance.shows.map(s => ({ label: s.showName, amount: s.revenue }))} /></Panel><Panel title="Sealed Gross Profit by recurring Show"><Bars title="Gross Profit by Show" value="Shows" rows={performance.shows.map(s => ({ label: s.showName, amount: s.grossProfit })).sort((a, b) => b.amount - a.amount)} /></Panel><Panel title={showId ? "Top products at selected Show" : "Top products across Shows"}><Bars title="Products by Show Revenue" value="products" rows={performance.products.map(p => ({ label: p.productName, amount: p.revenue }))} /></Panel><Panel title="Units sold by recurring Show"><Bars title="Units sold by Show" value="Shows" format={integer} rows={performance.shows.map(s => ({ label: s.showName, amount: s.unitsSold })).sort((a, b) => b.amount - a.amount)} /></Panel></div><Panel title="Recurring Show comparison" detail="A Show is the recurring event; visits are dated occurrences"><Table heads={["Show", "Visits", "Revenue", "COGS", "Gross Profit", "Margin", "Units", "Singles Inventory Δ", "Singles Funds Δ", "Singles Business Value Δ"]}>{performance.shows.map(s => <tr key={s.showId}><td><strong>{s.showName}</strong></td><td>{integer(s.visits)}</td><td>{currency(s.revenue)}</td><td>{currency(s.cogs)}</td><td>{currency(s.grossProfit)}</td><td>{percent(s.grossMargin)}</td><td>{integer(s.unitsSold)}</td><td>{currency(s.singlesInventoryChange)}</td><td>{currency(s.singlesFundsChange)}</td><td>{currency(s.singlesBusinessValueChange)}</td></tr>)}</Table>{!performance.shows.length && <Empty message="No Show visits in this range." />}</Panel><Panel title={showId ? "Visits at selected Show" : "Individual Show visits"} detail="Singles changes appear after finalization"><Table heads={["Show Visit", "Status", "Revenue", "Gross Profit", "Units", "Singles Inventory Δ", "Singles Funds Δ", "Singles Business Value Δ"]}>{selectedVisits.map(v => <tr key={v.visitId}><td><strong>{v.showName}</strong><small>{dateLabel(v.date)}</small></td><td><span className="report-badge">{v.status}</span></td><td>{currency(v.revenue)}</td><td>{currency(v.grossProfit)}</td><td>{integer(v.unitsSold)}</td><td>{v.singlesInventoryChange === null ? "—" : currency(v.singlesInventoryChange)}</td><td>{v.singlesFundsChange === null ? "—" : currency(v.singlesFundsChange)}</td><td>{v.singlesBusinessValueChange === null ? "—" : currency(v.singlesBusinessValueChange)}</td></tr>)}</Table>{!selectedVisits.length && <Empty message="No Show visits in this range." />}</Panel></>}
    </>}
    </>}
  </div>;
}
