import { useEffect, useState } from "react";
import { fetchReportData } from "../reportApi";
import "./ReportsPage.css";
import WhatIfPage from "./WhatIfPage";
import BusinessHealthPage from "./BusinessHealthPage";

type Totals = { revenue: number; cogs: number; grossProfit: number; grossMargin: number; unitsSold: number; saleCount: number };
type PackSummary = { snapshotCount: number; productCount: number; packsSold: number; declaredSalesValue: number; cogs: number; giveawayCost: number; damagedCost: number; actualRevenue: number | null; cashRevenue: number | null; digitalRevenue: number | null; grossProfit: number | null; grossMargin: number | null; actualRevenueCount: number; declaredOnlyCount: number; actualRevenueComplete: boolean; revenueMode: "ACTUAL" | "DECLARED_ONLY" | "MIXED" };
type PackPerformanceRow = { sourceBoxProductId: number; sourceItemId: string; sourceBoxProductName: string; packDisplayName: string; visitCount: number; packsSold: number; declaredSalesValue: number; cogs: number; actualRevenue: number | null; cashRevenue: number | null; digitalRevenue: number | null; grossProfit: number | null; grossMargin: number | null; revenueMode: "ACTUAL" | "DECLARED_ONLY" | "MIXED"; remaining: { packs: number; costBasis: number; retailValue: number; potentialGrossProfit: number } };
type Product = { productId: number; productName: string; itemId: string; revenue: number; cogs: number; grossProfit: number; grossMargin: number; unitsSold: number };
type Trend = { date: string; revenue: number; cogs: number; grossProfit: number; unitsSold: number; saleCount: number };
type Show = { showId: number; showName: string; visits: number; revenue: number; cogs: number; grossProfit: number; grossMargin: number; unitsSold: number; singlesInventoryChange: number; singlesFundsChange: number; singlesBusinessValueChange: number; pack: PackSummary };
type Visit = { visitId: number; showId: number; showName: string; date: string; status: string; revenue: number; cogs: number; grossProfit: number; grossMargin: number; unitsSold: number; singlesInventoryChange: number | null; singlesFundsChange: number | null; singlesBusinessValueChange: number | null; pack: PackSummary };
type Performance = { totals: Totals; products: Product[]; trends: Trend[]; shows: Show[]; visits: Visit[]; pack: {summary: PackSummary; products: PackPerformanceRow[]} };
type Inventory = { productId: number; productName: string; unitsReceived: number; unitsSold: number; unitsOnHand: number; inventoryValue: number; retailValue: number; potentialGrossProfit: number; potentialGrossMargin: number };
type Funds = { sealedBalance: string; singlesBalance: string; totalBusinessFunds: string };
type SinglesValuation = { value: number; recordedAt: string; source: "Active Show start" | "Finalized Show end" };
type ShowResponse = { id: number; name: string; visits: Array<{ status: string; visitDate: string; startedAt: string | null; finalizedAt: string | null; startingSinglesValue: string | number; endingSinglesValue: string | number | null }> };
type Section = "Overview" | "Business Health" | "Sales" | "Inventory" | "Shows" | "What-If";
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
function latestSinglesValuation(shows: ShowResponse[]): SinglesValuation | null {
  const snapshots: SinglesValuation[] = [];
  for (const show of shows) for (const visit of show.visits) {
    if (visit.status === "ACTIVE") snapshots.push({ value: Number(visit.startingSinglesValue), recordedAt: visit.startedAt ?? visit.visitDate, source: "Active Show start" });
    if (visit.status === "FINALIZED" && visit.endingSinglesValue !== null) snapshots.push({ value: Number(visit.endingSinglesValue), recordedAt: visit.finalizedAt ?? visit.visitDate, source: "Finalized Show end" });
  }
  const validSnapshots = snapshots.filter(snapshot => Number.isFinite(snapshot.value));
  return validSnapshots.sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())[0] ?? null;
}
function BusinessHealth({ funds, sealedCost, sealedRetail, singlesValuation }: { funds: Funds; sealedCost: number; sealedRetail: number; singlesValuation: SinglesValuation | null }) {
  const totalFunds = Number(funds.totalBusinessFunds), singlesValue = singlesValuation?.value ?? null;
  const inventoryValue = sealedCost + (singlesValue ?? 0), businessValue = totalFunds + inventoryValue;
  const potentialProfit = sealedRetail - sealedCost, fundsShare = businessValue ? totalFunds / businessValue : 0, inventoryShare = businessValue ? inventoryValue / businessValue : 0;
  const valuationDetail = singlesValuation ? `${singlesValuation.source} · ${new Date(singlesValuation.recordedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : "No recorded Show valuation available";
  return <section className="business-health" aria-labelledby="business-health-title"><div className="business-health-heading"><div><span>Current state</span><h3 id="business-health-title">Business Health &amp; Position</h3><p>Current funds and recorded inventory value. Potential retail upside is shown separately.</p></div></div><div className="business-health-sections">
    <div className="business-health-block"><header><h4>Business Value</h4><p>Owned value at current balances and cost basis.</p></header><div className="business-health-values"><div><span>Total Business Funds</span><strong>{currency(totalFunds)}</strong><small>Sealed and Singles funds</small></div><div><span>Sealed Inventory at Cost</span><strong>{currency(sealedCost)}</strong><small>Historical landed cost basis</small></div><div className={!singlesValuation ? "is-unavailable" : ""}><span>Singles Inventory Value</span><strong>{singlesValue === null ? "Unavailable" : currency(singlesValue)}</strong><small>{valuationDetail}</small></div><div className="is-total"><span>Total Current Business Value</span><strong>{singlesValue === null ? "Incomplete" : currency(businessValue)}</strong><small>{singlesValue === null ? `Known value ${currency(totalFunds + sealedCost)}; Singles valuation unavailable` : "Funds + sealed cost + Singles valuation"}</small></div></div></div>
    <div className="business-health-block"><header><h4>Liquidity</h4><p>Current value split between funds and inventory.</p></header><div className="business-health-values"><div><span>Total Funds</span><strong>{currency(totalFunds)}</strong></div><div><span>Inventory Value</span><strong>{currency(inventoryValue)}</strong><small>{singlesValue === null ? "Sealed cost only; Singles valuation unavailable" : "Sealed cost + Singles valuation"}</small></div><div><span>Funds % of Business Value</span><strong>{singlesValue === null ? "—" : percent(fundsShare)}</strong></div><div><span>Inventory % of Business Value</span><strong>{singlesValue === null ? "—" : percent(inventoryShare)}</strong></div></div></div>
    <div className="business-health-block is-opportunity"><header><h4>Inventory Opportunity</h4><p>Projected sealed retail upside, excluded from current business value.</p></header><div className="business-health-values"><div><span>Sealed Inventory at Cost</span><strong>{currency(sealedCost)}</strong></div><div><span>Expected Retail</span><strong>{currency(sealedRetail)}</strong></div><div><span>Potential Gross Profit</span><strong>{currency(potentialProfit)}</strong></div><div><span>Potential Gross Margin</span><strong>{percent(sealedRetail ? potentialProfit / sealedRetail : 0)}</strong></div></div></div>
  </div></section>;
}

function ShowsReport({performance, showId, visits}: {performance: Performance; showId: string; visits: Visit[]}) {
  const pack = performance.pack.summary;
  const packRevenueDetail = pack.snapshotCount === 0
    ? "No finalized pack snapshots in this range"
    : pack.revenueMode === "ACTUAL"
    ? "Recorded Cash + Digital pack revenue"
    : pack.revenueMode === "MIXED"
      ? `${pack.declaredOnlyCount} product result(s) remain analytical`
      : "No Actual Pack Revenue was entered";
  return <>
    <div className="report-metrics">
      <Metric label="Show Visits" value={integer(performance.shows.reduce((n, show) => n + show.visits, 0))} />
      <Metric label="Sealed Revenue" value={currency(performance.shows.reduce((n, show) => n + show.revenue, 0))} />
      <Metric label="Sealed Gross Profit" value={currency(performance.shows.reduce((n, show) => n + show.grossProfit, 0))} />
      <Metric label="Units Sold" value={integer(performance.shows.reduce((n, show) => n + show.unitsSold, 0))} />
      <Metric label="Singles Inventory Change" value={currency(performance.shows.reduce((n, show) => n + show.singlesInventoryChange, 0))} detail="Finalized visits only · value change, not profit" />
      <Metric label="Singles Funds Change" value={currency(performance.shows.reduce((n, show) => n + show.singlesFundsChange, 0))} detail="Finalized visit snapshots" />
    </div>
    <section className="pack-report-block" aria-labelledby="pack-report-title">
      <div className="pack-report-heading"><div><span>Finalized pack snapshots</span><h3 id="pack-report-title">Pack Performance</h3><p>Kept separate from sealed SaleLines and Singles valuation.</p></div><span className={`report-badge pack-revenue-mode is-${pack.revenueMode.toLowerCase()}`}>{pack.snapshotCount === 0 ? "No pack activity" : pack.revenueMode === "ACTUAL" ? "Actual revenue" : pack.revenueMode === "MIXED" ? "Mixed actual / analytical" : "Declared-value analysis"}</span></div>
      <div className="report-metrics pack-report-metrics">
        <Metric label="Packs Sold" value={integer(pack.packsSold)} />
        <Metric label="Declared Sales Value" value={currency(pack.declaredSalesValue)} detail="Analytical value" />
        <Metric label="Actual Pack Revenue" value={pack.actualRevenue === null ? "—" : currency(pack.actualRevenue)} detail={packRevenueDetail} />
        <Metric label="Pack COGS" value={currency(pack.cogs)} />
        <Metric label="Pack Gross Profit" value={pack.grossProfit === null ? "—" : currency(pack.grossProfit)} detail="Actual revenue only" />
        <Metric label="Pack Gross Margin" value={pack.grossMargin === null ? "—" : percent(pack.grossMargin)} detail="Actual revenue only" />
        <Metric label="Pack Revenue · Cash" value={pack.cashRevenue === null ? "—" : currency(pack.cashRevenue)} />
        <Metric label="Pack Revenue · Digital" value={pack.digitalRevenue === null ? "—" : currency(pack.digitalRevenue)} />
      </div>
    </section>
    <div className="report-two">
      <Panel title="Sealed Revenue by recurring Show"><Bars title="Revenue by Show" value="Shows" rows={performance.shows.map(show => ({ label: show.showName, amount: show.revenue }))} /></Panel>
      <Panel title="Sealed Gross Profit by recurring Show"><Bars title="Gross Profit by Show" value="Shows" rows={performance.shows.map(show => ({ label: show.showName, amount: show.grossProfit })).sort((a, b) => b.amount - a.amount)} /></Panel>
      <Panel title={showId ? "Top sealed products at selected Show" : "Top sealed products across Shows"}><Bars title="Products by Show Revenue" value="products" rows={performance.products.map(product => ({ label: product.productName, amount: product.revenue }))} /></Panel>
      <Panel title="Packs sold by source Box"><Bars title="Packs sold by source Box" value="derived pack inventory" format={integer} rows={performance.pack.products.map(product => ({ label: product.packDisplayName, amount: product.packsSold })).sort((a, b) => b.amount - a.amount)} /></Panel>
    </div>
    <Panel title="Pack performance" detail="Derived pack inventory grouped by source Box; actual revenue appears only when entered at Show finalization">
      <Table heads={["Product", "Visits", "Packs Sold", "Declared Value", "Actual Revenue", "COGS", "Gross Profit", "Margin", "Remaining", "Remaining Cost"]}>
        {performance.pack.products.map(product => <tr key={product.sourceBoxProductId}><td><strong>{product.packDisplayName}</strong><small>From {product.sourceBoxProductName} · {product.revenueMode === "ACTUAL" ? "Actual revenue" : product.revenueMode === "MIXED" ? "Mixed actual / analytical" : "Declared-value analysis only"}</small></td><td>{integer(product.visitCount)}</td><td>{integer(product.packsSold)}</td><td>{currency(product.declaredSalesValue)}</td><td>{product.actualRevenue === null ? "—" : currency(product.actualRevenue)}</td><td>{currency(product.cogs)}</td><td>{product.grossProfit === null ? "—" : currency(product.grossProfit)}</td><td>{product.grossMargin === null ? "—" : percent(product.grossMargin)}</td><td>{integer(product.remaining.packs)}</td><td>{currency(product.remaining.costBasis)}</td></tr>)}
      </Table>
      {!performance.pack.products.length && <Empty message="No finalized pack snapshots in this range." />}
    </Panel>
    <Panel title="Recurring Show comparison" detail="Pack metrics remain separate from normal sealed sales">
      <Table heads={["Show", "Visits", "Sealed Revenue", "Sealed Profit", "Pack Revenue", "Pack COGS", "Pack Profit", "Packs Sold", "Singles Inventory Δ", "Singles Funds Δ"]}>
        {performance.shows.map(show => <tr key={show.showId}><td><strong>{show.showName}</strong></td><td>{integer(show.visits)}</td><td>{currency(show.revenue)}</td><td>{currency(show.grossProfit)}</td><td>{show.pack.actualRevenue === null ? "—" : currency(show.pack.actualRevenue)}</td><td>{currency(show.pack.cogs)}</td><td>{show.pack.grossProfit === null ? "—" : currency(show.pack.grossProfit)}</td><td>{integer(show.pack.packsSold)}</td><td>{currency(show.singlesInventoryChange)}</td><td>{currency(show.singlesFundsChange)}</td></tr>)}
      </Table>
      {!performance.shows.length && <Empty message="No Show visits in this range." />}
    </Panel>
    <Panel title={showId ? "Visits at selected Show" : "Individual Show visits"} detail="Pack actual revenue remains blank when the result is analytical only">
      <Table heads={["Show Visit", "Status", "Sealed Revenue", "Sealed Profit", "Pack Revenue", "Pack COGS", "Pack Profit", "Packs Sold", "Singles Business Value Δ"]}>
        {visits.map(visit => <tr key={visit.visitId}><td><strong>{visit.showName}</strong><small>{dateLabel(visit.date)}</small></td><td><span className="report-badge">{visit.status}</span></td><td>{currency(visit.revenue)}</td><td>{currency(visit.grossProfit)}</td><td>{visit.pack.actualRevenue === null ? "—" : currency(visit.pack.actualRevenue)}</td><td>{currency(visit.pack.cogs)}</td><td>{visit.pack.grossProfit === null ? "—" : currency(visit.pack.grossProfit)}</td><td>{integer(visit.pack.packsSold)}</td><td>{visit.singlesBusinessValueChange === null ? "—" : currency(visit.singlesBusinessValueChange)}</td></tr>)}
      </Table>
      {!visits.length && <Empty message="No Show visits in this range." />}
    </Panel>
  </>;
}

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
  const [singlesValuation, setSinglesValuation] = useState<SinglesValuation | null>(null);
  const [options, setOptions] = useState<{ products: { id: number; name: string }[]; shows: { id: number; name: string }[] }>({ products: [], shows: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => { const listener = () => setRefresh(n => n + 1); window.addEventListener("business-data-changed", listener); return () => window.removeEventListener("business-data-changed", listener); }, []);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (section === "What-If" || section === "Business Health") return;
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
        const [p, i, f, products, shows] = await Promise.all([
          fetchReportData<Performance>(`/api/reports/performance?${query}`, "Report performance could not be loaded."),
          fetchReportData<Inventory[]>("/api/inventory", "Report inventory could not be loaded."),
          fetchReportData<Funds>("/api/funds/summary", "Report funds could not be loaded."),
          fetchReportData<Array<{ id: number; name: string; sellable: boolean; type: string }>>("/api/products", "Report product options could not be loaded."),
          fetchReportData<ShowResponse[]>("/api/shows", "Report Show options could not be loaded."),
        ]);
        if (!cancelled) { setPerformance(p); setInventory(i); setFunds(f); setSinglesValuation(latestSinglesValuation(shows as ShowResponse[])); setOptions({ products: products.filter((item: { sellable: boolean; type: string }) => item.sellable && item.type === "SEALED").map((item: { id: number; name: string }) => ({ id: item.id, name: item.name })), shows: shows.map((item: { id: number; name: string }) => ({ id: item.id, name: item.name })) }); }
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
    <div className="report-tabs" role="tablist" aria-label="Reports sections">{(["Overview", "Business Health", "Sales", "Inventory", "Shows", "What-If"] as Section[]).map(tab => <button key={tab} type="button" role="tab" aria-selected={section === tab} className={section === tab ? "is-active" : ""} onClick={() => setSection(tab)}>{tab}</button>)}</div>
    {section === "What-If" ? <WhatIfPage /> : section === "Business Health" ? <BusinessHealthPage /> : <>
    <div className="panel report-filters"><label>Sale / visit date <select value={range} onChange={e => setRange(e.target.value as Range)}><option value="all">All Time</option><option value="month">This Month</option><option value="lastMonth">Last Month</option><option value="30">Last 30 Days</option><option value="year">This Year</option><option value="custom">Custom Range</option></select></label>{range === "custom" && <><label>From <input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label>To <input type="date" value={to} onChange={e => setTo(e.target.value)} /></label></>}{(section === "Sales" || section === "Inventory" || section === "Shows") && <label>Product <select value={productId} onChange={e => setProductId(e.target.value)}><option value="">All Products</option>{options.products.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}{section === "Shows" && <label>Recurring Show <select value={showId} onChange={e => setShowId(e.target.value)}><option value="">All Shows</option>{options.shows.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}</div>
    {(section === "Overview" || section === "Inventory") && <p className="report-note">Inventory and Funds are current balances. The date range applies to recorded sales and Show visits.</p>}
    {loading && <div className="panel report-state" role="status">Loading reports…</div>}{error && <div className="panel report-state" role="alert">{error} <button type="button" className="secondary-button" onClick={() => setRefresh(n => n + 1)}>Retry</button></div>}
    {!loading && !error && performance && totals && <>
      {section === "Overview" && <>{funds && <BusinessHealth funds={funds} sealedCost={cost} sealedRetail={retail} singlesValuation={singlesValuation} />}<div className="report-metrics"><Metric label="Sealed Revenue" value={currency(totals.revenue)} detail="Recorded sealed sales" /><Metric label="Gross Profit" value={currency(totals.grossProfit)} /><Metric label="Gross Margin" value={percent(totals.grossMargin)} /><Metric label="Inventory Cost Value" value={currency(cost)} detail="Current stock" /><Metric label="Inventory Retail Value" value={currency(retail)} /><Metric label="Potential Inventory Profit" value={currency(potential)} /><Metric label="Units On Hand" value={integer(units)} /><Metric label="Total Business Funds" value={currency(funds?.totalBusinessFunds ?? 0)} detail={`Sealed ${currency(funds?.sealedBalance ?? 0)} · Singles ${currency(funds?.singlesBalance ?? 0)}`} /></div><div className="report-two"><Panel title="Revenue and COGS over time" detail="Daily sealed sales in the selected range"><TrendChart rows={performance.trends} /></Panel><Panel title="Current business position" detail="Funds and inventory at current values"><div className="report-position"><div><span>Sealed Funds</span><strong>{currency(funds?.sealedBalance ?? 0)}</strong></div><div><span>Singles Funds</span><strong>{currency(funds?.singlesBalance ?? 0)}</strong></div><div><span>Inventory Cost Value</span><strong>{currency(cost)}</strong></div><div><span>Inventory Retail Potential</span><strong>{currency(retail)}</strong></div></div></Panel></div></>}
      {section === "Sales" && <><div className="report-metrics"><Metric label="Revenue" value={currency(totals.revenue)} /><Metric label="COGS" value={currency(totals.cogs)} /><Metric label="Gross Profit" value={currency(totals.grossProfit)} /><Metric label="Gross Margin" value={percent(totals.grossMargin)} /><Metric label="Units Sold" value={integer(totals.unitsSold)} /><Metric label="Sales" value={integer(totals.saleCount)} /><Metric label="Average Sale Value" value={currency(totals.saleCount ? totals.revenue / totals.saleCount : 0)} /><Metric label="Average Profit / Sale" value={currency(totals.saleCount ? totals.grossProfit / totals.saleCount : 0)} /></div><div className="report-two"><Panel title="Revenue and COGS over time"><TrendChart rows={performance.trends} /></Panel><Panel title="Top products by Revenue"><Bars title="Product Revenue" value="products" rows={performance.products.map(p => ({ label: p.productName, amount: p.revenue })).sort((a, b) => b.amount - a.amount)} /></Panel><Panel title="Top products by Gross Profit"><Bars title="Product Gross Profit" value="products" rows={performance.products.map(p => ({ label: p.productName, amount: p.grossProfit })).sort((a, b) => b.amount - a.amount)} /></Panel><Panel title="Top products by Units Sold"><Bars title="Product Units Sold" value="products" format={integer} rows={performance.products.map(p => ({ label: p.productName, amount: p.unitsSold })).sort((a, b) => b.amount - a.amount)} /></Panel></div><Panel title="Product performance" detail="Exact sealed sale totals by product"><Table heads={["Product", "Revenue", "COGS", "Gross Profit", "Gross Margin", "Units Sold"]}>{performance.products.map(p => <tr key={p.productId}><td><strong>{p.productName}</strong><small>{p.itemId}</small></td><td>{currency(p.revenue)}</td><td>{currency(p.cogs)}</td><td>{currency(p.grossProfit)}</td><td>{percent(p.grossMargin)}</td><td>{integer(p.unitsSold)}</td></tr>)}</Table>{!performance.products.length && <Empty message="No sealed product sales in this range." />}</Panel></>}
      {section === "Inventory" && <><div className="report-metrics"><Metric label="Inventory Cost Value" value={currency(cost)} /><Metric label="Inventory Retail Value" value={currency(retail)} /><Metric label="Potential Gross Profit" value={currency(potential)} /><Metric label="Potential Gross Margin" value={percent(retail ? potential / retail : 0)} /><Metric label="Units On Hand" value={integer(units)} /><Metric label="Products In Stock" value={integer(stock.length)} /></div><div className="report-two"><Panel title="Inventory cost by product"><Bars title="Inventory cost by product" value="products" rows={stock.map(i => ({ label: i.productName, amount: Number(i.inventoryValue) })).sort((a, b) => b.amount - a.amount)} /></Panel><Panel title="Retail potential by product"><Bars title="Retail value by product" value="products" rows={stock.map(i => ({ label: i.productName, amount: Number(i.retailValue) })).sort((a, b) => b.amount - a.amount)} /></Panel></div><Panel title="Inventory performance" detail="Current stock position and recorded sales in the selected date range"><Table heads={["Product", "Received", "Sold", "On Hand", "Cost Value", "Retail Value", "Revenue", "COGS", "Gross Profit", "Margin"]}>{filteredInventory.map(i => { const sold = performance.products.find(p => p.productId === i.productId); return <tr key={i.productId}><td><strong>{i.productName}</strong></td><td>{integer(i.unitsReceived)}</td><td>{integer(i.unitsSold)}</td><td>{integer(i.unitsOnHand)}</td><td>{currency(i.inventoryValue)}</td><td>{currency(i.retailValue)}</td><td>{currency(sold?.revenue ?? 0)}</td><td>{currency(sold?.cogs ?? 0)}</td><td>{currency(sold?.grossProfit ?? 0)}</td><td>{percent(sold?.grossMargin ?? 0)}</td></tr>; })}</Table>{!filteredInventory.length && <Empty message="No inventory products are available." />}</Panel></>}
      {section === "Shows" && <ShowsReport performance={performance} showId={showId} visits={selectedVisits} />}
    </>}
    </>}
  </div>;
}
