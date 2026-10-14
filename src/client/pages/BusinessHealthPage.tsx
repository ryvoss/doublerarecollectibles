import { useEffect, useMemo, useState } from "react";
import { fetchReportData } from "../reportApi";

type Interval = "weekly" | "monthly";
type Position = {
  totalBusinessFunds: number;
  sealedFunds: number;
  singlesFunds: number;
  sealedInventoryCost: number;
  sealedInventoryOnHandCost: number;
  sealedInventoryInboundCost: number;
  sealedExpectedRetail: number;
  singlesInventoryValue: number | null;
  totalBusinessValue: number | null;
  expectedPricingComplete: boolean | null;
  missingExpectedPriceProducts: number | null;
  missingExpectedPriceUnits: number | null;
};
type Snapshot = Position & { period: string; snapshotDate: string; snapshotAt: string };

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

export default function BusinessHealthPage() {
  const [interval, setInterval] = useState<Interval>("weekly");
  const [position, setPosition] = useState<Position | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => { const listener = () => setRefresh(value => value + 1); window.addEventListener("business-data-changed", listener); return () => window.removeEventListener("business-data-changed", listener); }, []);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true); setError("");
        const [current, snapshots] = await Promise.all([
          fetchReportData<Position>("/api/reports/business-position", "Current Business Health data could not be loaded."),
          fetchReportData<Snapshot[]>(`/api/reports/business-position-snapshots?interval=${interval}`, "Business Health history could not be loaded."),
        ]);
        if (!cancelled) { setPosition(current); setHistory(snapshots); }
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : "Business Health data could not be loaded."); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load(); return () => { cancelled = true; };
  }, [interval, refresh]);

  const completeHistory = useMemo(() => history.filter(item => item.totalBusinessValue !== null), [history]);
  if (loading) return <div className="panel report-state" role="status">Loading Business Health…</div>;
  if (error || !position) return <div className="panel report-state" role="alert">{error || "Business Health data is unavailable."}<button type="button" className="secondary-button" onClick={() => setRefresh(value => value + 1)}>Retry</button></div>;

  const singlesInventory = position.singlesInventoryValue;
  const inventoryValue = position.sealedInventoryCost + (singlesInventory ?? 0);
  const complete = position.totalBusinessValue !== null;
  const liquidity = complete && position.totalBusinessValue ? position.totalBusinessFunds / position.totalBusinessValue : null;
  const inventoryShare = complete && position.totalBusinessValue ? inventoryValue / position.totalBusinessValue : null;
  const potentialProfit = position.sealedExpectedRetail - position.sealedInventoryCost;
  const potentialMargin = position.sealedExpectedRetail ? potentialProfit / position.sealedExpectedRetail : 0;
  const potentialRoi = position.sealedInventoryCost ? potentialProfit / position.sealedInventoryCost : 0;
  const projectionComplete = position.expectedPricingComplete === true;
  const potentialBusinessValue = complete && projectionComplete ? position.totalBusinessValue! + potentialProfit : null;
  const projectionMissing = `${position.missingExpectedPriceProducts ?? 0} ${(position.missingExpectedPriceProducts ?? 0) === 1 ? "product" : "products"} / ${position.missingExpectedPriceUnits ?? 0} ${(position.missingExpectedPriceUnits ?? 0) === 1 ? "unit" : "units"} missing expected pricing`;
  const first = completeHistory[0], last = completeHistory.at(-1);
  const change = first && last ? last.totalBusinessValue! - first.totalBusinessValue! : null;
  const changePercent = change !== null && first.totalBusinessValue ? change / first.totalBusinessValue : null;

  return <div className="business-health-page">
    <section className="business-health-current"><div className="business-health-heading"><div><span>Current Position</span><h3>Business Health</h3><p>Actual business value uses funds, sealed inventory at cost, and the latest Singles valuation.</p></div></div>
      <div className="business-health-current-metrics">
        <HealthMetric label="Current Business Value" value={complete ? money(position.totalBusinessValue!) : "Incomplete"} detail="Actual funds + inventory at cost/valuation" primary />
        <HealthMetric label="Total Funds" value={money(position.totalBusinessFunds)} detail={`Sealed ${money(position.sealedFunds)} · Singles ${money(position.singlesFunds)}`} />
        <HealthMetric label="Inventory Value" value={money(inventoryValue)} detail={singlesInventory === null ? "Sealed cost; Singles unavailable" : `Sealed cost + Singles ${money(singlesInventory)}`} />
        <HealthMetric label="Sealed On Hand at Cost" value={money(position.sealedInventoryOnHandCost)} detail="Physically received sealed inventory and packs" />
        <HealthMetric label="Sealed In Transit at Cost" value={money(position.sealedInventoryInboundCost)} detail="Owned inventory not yet received" />
        <HealthMetric label="Liquidity" value={liquidity === null ? "—" : pct(liquidity)} detail="Funds share of actual value" />
        <HealthMetric label="Inventory" value={inventoryShare === null ? "—" : pct(inventoryShare)} detail="Inventory share of actual value" />
      </div>
    </section>

    <section className="business-health-opportunity"><header><div><span>Potential upside</span><h3>Inventory Opportunity</h3><p>Expected sealed retail values remain separate from current business value.</p></div></header><div className="business-health-opportunity-grid">
      <HealthMetric label="Inventory at Expected Retail" value={projectionComplete ? money(position.sealedExpectedRetail) : "Incomplete"} detail={projectionComplete ? "Based on current expected prices" : `Known priced value ${money(position.sealedExpectedRetail)} · ${projectionMissing}`} />
      <HealthMetric label="Potential Gross Profit" value={projectionComplete ? money(potentialProfit) : "Incomplete"} />
      <HealthMetric label="Potential Gross Margin" value={projectionComplete ? pct(potentialMargin) : "—"} />
      <HealthMetric label="Potential ROI" value={projectionComplete ? pct(potentialRoi) : "—"} />
      <HealthMetric label="Potential Business Value" value={potentialBusinessValue === null ? "Incomplete" : money(potentialBusinessValue)} detail={projectionComplete ? "Current Business Value + potential sealed profit" : projectionMissing} />
    </div></section>

    <section className="panel business-health-history"><div className="panel-header business-health-history-header"><div><h3>Business Value History</h3><p>Business Value change is value change, not profit.</p></div><div className="business-health-interval" role="group" aria-label="History interval">{(["weekly", "monthly"] as Interval[]).map(value => <button key={value} type="button" className={interval === value ? "is-active" : ""} aria-pressed={interval === value} onClick={() => setInterval(value)}>{value === "weekly" ? "Weekly" : "Monthly"}</button>)}</div></div>
      <div className="business-health-change-grid"><HealthMetric label="Starting Business Value" value={first ? money(first.totalBusinessValue!) : "—"} /><HealthMetric label="Ending Business Value" value={last ? money(last.totalBusinessValue!) : "—"} /><HealthMetric label="Dollar Change" value={change === null ? "—" : money(change)} /><HealthMetric label="Percentage Change" value={changePercent === null ? "—" : pct(changePercent)} /></div>
      <BusinessValueChart rows={completeHistory} interval={interval} />
    </section>
  </div>;
}

function HealthMetric({ label, value, detail, primary = false }: { label: string; value: string; detail?: string; primary?: boolean }) {
  return <div className={primary ? "health-metric is-primary" : "health-metric"}><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

function BusinessValueChart({ rows, interval }: { rows: Snapshot[]; interval: Interval }) {
  if (!rows.length) return <div className="report-empty">No complete Business Value snapshots are available yet.</div>;
  const width = 1000, height = 280, left = 72, right = 24, top = 24, bottom = 42;
  const potentialRows = rows.map((row, index) => ({ row, index, value: row.expectedPricingComplete === true ? row.totalBusinessValue! + row.sealedExpectedRetail - row.sealedInventoryCost : null })).filter(item => item.value !== null);
  const series = rows.flatMap(row => [row.totalBusinessValue!, row.totalBusinessFunds, row.sealedInventoryCost, row.singlesInventoryValue ?? 0]).concat(potentialRows.map(item => item.value!));
  let min = Math.min(...series), max = Math.max(...series);
  const padding = Math.max((max - min) * 0.12, max * 0.05, 1); min = Math.max(0, min - padding); max += padding;
  const x = (index: number) => rows.length === 1 ? (left + width - right) / 2 : left + index * (width - left - right) / (rows.length - 1);
  const y = (value: number) => top + (max - value) * (height - top - bottom) / (max - min);
  const points = (get: (row: Snapshot) => number) => rows.map((row, index) => `${x(index)},${y(get(row))}`).join(" ");
  const periodLabel = (period: string) => interval === "monthly" ? new Date(`${period}-01T00:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : new Date(`${period}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return <div className="business-value-chart"><div className="business-value-legend"><span className="is-total">Current Business Value</span><span className="is-potential">Potential Business Value</span><span className="is-funds">Funds</span><span className="is-sealed">Sealed Inventory</span><span className="is-singles">Singles Inventory</span></div><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${interval} Business Value history`}>
    {[0, .25, .5, .75, 1].map(step => { const value = max - (max - min) * step; const py = y(value); return <g key={step}><line x1={left} x2={width - right} y1={py} y2={py} className="chart-grid" /><text x={left - 10} y={py + 4} textAnchor="end" className="chart-axis-label">{money(value)}</text></g>; })}
    <polyline points={points(row => row.totalBusinessFunds)} className="chart-line is-funds" /><polyline points={points(row => row.sealedInventoryCost)} className="chart-line is-sealed" /><polyline points={points(row => row.singlesInventoryValue ?? 0)} className="chart-line is-singles" /><polyline points={points(row => row.totalBusinessValue!)} className="chart-line is-total" />{potentialRows.length > 1 && <polyline points={potentialRows.map(item => `${x(item.index)},${y(item.value!)}`).join(" ")} className="chart-line is-potential" />}
    {potentialRows.map(item => <circle key={`potential-${item.row.period}`} cx={x(item.index)} cy={y(item.value!)} r="3" className="chart-point is-potential"><title>{periodLabel(item.row.period)} · Potential Business Value {money(item.value!)}</title></circle>)}
    {rows.map((row, index) => <g key={row.period}><circle cx={x(index)} cy={y(row.totalBusinessValue!)} r="4" className="chart-point"><title>{periodLabel(row.period)} · Current Business Value {money(row.totalBusinessValue!)}</title></circle>{(rows.length <= 8 || index === 0 || index === rows.length - 1) && <text x={x(index)} y={height - 12} textAnchor={index === 0 ? "start" : index === rows.length - 1 ? "end" : "middle"} className="chart-axis-label">{periodLabel(row.period)}</text>}</g>)}
  </svg><p>Each point is the latest stored daily snapshot in that {interval === "weekly" ? "week" : "month"}. Component lines explain value composition.</p></div>;
}
