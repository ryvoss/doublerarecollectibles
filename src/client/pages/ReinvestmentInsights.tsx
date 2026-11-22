import { useEffect, useState } from "react";
import { fetchReportData } from "../reportApi";
import { filterInvestments, investmentReasons } from "../../shared/reinvestment";
import type { InvestmentFilter, PlanningHorizon, ReinvestmentItem, ReinvestmentReport } from "../../shared/reinvestment";
import "./ReinvestmentInsights.css";
const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
const percent = (n: number | null) => n === null ? "Not available" : `${(n * 100).toFixed(1)}%`;
const days = (n: number | null) => n === null ? "No recent velocity" : `${n.toFixed(1)} days`;
export function purchaseLabel(item: ReinvestmentItem) {
  return item.recommendedUnits > 0 ? `${item.buyRange.min}-${item.buyRange.max} units` : "No additional purchase recommended";
}
export function InvestmentExplanation({ item }: { item: ReinvestmentItem }) {
  return <div className="investment-explanation" id={`investment-detail-${item.productId}`}>
    <div><h4>Why this action</h4><ul>{item.reasons.map(reason => <li key={reason}>{investmentReasons[reason]}</li>)}</ul>
      {item.units30 > 0 && item.grossMargin !== null && item.grossMargin < .1 && <p>High movement does not override a margin below 10%.</p>}
      {item.grade === null && <p>Score components are provisional until there is enough observed history.</p>}
    </div>
    <div><h4>Performance - last 30 days</h4><dl>
      <dt>Units sold</dt><dd>{item.units30}</dd><dt>Revenue</dt><dd>{money(item.revenue)}</dd><dt>COGS</dt><dd>{money(item.cogs)}</dd>
      <dt>Gross profit</dt><dd>{money(item.grossProfit)}</dd><dt>Gross margin</dt><dd>{percent(item.grossMargin)}</dd>
      <dt>Profit per $1 of cost sold</dt><dd>{item.profitEfficiency === null ? "Not available" : money(item.profitEfficiency)}</dd>
      <dt>Sell-through</dt><dd>{percent(item.sellThrough)}</dd><dt>Transactions / selling days</dt><dd>{item.transactions30} / {item.sellingDays30}</dd>
    </dl></div>
    <div><h4>Stock and trend</h4><dl>
      <dt>On hand / inbound</dt><dd>{item.onHand} / {item.inbound}</dd><dt>Reorder point</dt><dd>{item.reorderPoint}</dd>
      <dt>On-hand supply</dt><dd>{days(item.daysOnHand)}</dd><dt>Projected supply</dt><dd>{days(item.projectedDaysSupply)}</dd>
      <dt>Trend</dt><dd>{item.trend}{item.trendRatio !== null ? ` (${((item.trendRatio - 1) * 100).toFixed(0)}%)` : ""}</dd>
      <dt>Daily units - recent / prior</dt><dd>{item.dailyVelocity30.toFixed(2)} / {item.dailyVelocityPrevious60.toFixed(2)}</dd>
      <dt>Last sale</dt><dd>{item.daysSinceLastSale === null ? "None in the last 90 days" : `${item.daysSinceLastSale} days ago`}</dd>
      <dt>Observed history</dt><dd>{item.historyDays === null ? "Not established" : `${item.historyDays} days`}</dd>
    </dl></div>
    <div><h4>Score - {item.score} / 100{item.grade === null ? " (provisional)" : ""}</h4><dl>
      <dt>Velocity / trend</dt><dd>{item.scoreBreakdown.velocity} / 25</dd><dt>Profit efficiency</dt><dd>{item.scoreBreakdown.profitEfficiency} / 25</dd>
      <dt>Sell-through</dt><dd>{item.scoreBreakdown.sellThrough} / 20</dd><dt>On-hand stock need</dt><dd>{item.scoreBreakdown.stockNeed} / 20</dd>
      <dt>Recency / consistency</dt><dd>{item.scoreBreakdown.recency} / 10</dd><dt>Need after inbound (action only)</dt><dd>{item.projectedStockNeed} / 20</dd>
    </dl></div>
    <div><h4>Purchase calculation</h4><dl><dt>Forecast demand</dt><dd>{item.forecast}</dd><dt>20% safety stock</dt><dd>{item.safetyStock}</dd>
      <dt>Target, rounded up</dt><dd>{item.targetStock}</dd><dt>Less on hand + inbound</dt><dd>{item.onHand + item.inbound}</dd>
      <dt>Calculated need</dt><dd>{item.calculatedNeed}</dd><dt>Action-adjusted range</dt><dd>{purchaseLabel(item)}</dd></dl>
      {item.action === "BUY MODESTLY" && <p>The upper limit is half the calculated need, rounded up.</p>}
      {item.caseNote && <p>Case option: {item.caseNote.cases} case(s) = {item.caseNote.units} units ({item.caseNote.unitsPerCase} per case). This may exceed the range; check supplier terms before buying.</p>}
    </div>
  </div>;
}
export default function ReinvestmentInsights() {
  const [horizon, setHorizon] = useState<PlanningHorizon>(30);
  const [filter, setFilter] = useState<InvestmentFilter>("All");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [report, setReport] = useState<ReinvestmentReport | null>(null);
  const [error, setError] = useState(""); const [loading, setLoading] = useState(true); const [refresh, setRefresh] = useState(0);
  useEffect(() => { const listener = () => setRefresh(n => n + 1); window.addEventListener("business-data-changed", listener); return () => window.removeEventListener("business-data-changed", listener); }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    void fetchReportData<ReinvestmentReport>(`/api/reports/reinvestment?horizon=${horizon}`, "Reinvestment insights could not be loaded.", controller.signal)
      .then(data => { if (!controller.signal.aborted) setReport(data); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Insights unavailable."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [horizon, refresh]);
  function explain(id: number) {
    setFilter("All"); setExpanded(id);
    requestAnimationFrame(() => { const button = document.getElementById(`investment-product-${id}`); button?.scrollIntoView({ block: "center" }); button?.focus({ preventScroll: true }); });
  }
  return <section className="reinvestment-insights" aria-labelledby="reinvestment-heading">
    <div className="investment-heading"><div><h3 id="reinvestment-heading">Reinvestment Insights</h3><p>What to buy next, what to wait on, and what to leave alone.</p></div>
      <label>Plan for <select value={horizon} onChange={event => setHorizon(Number(event.target.value) as PlanningHorizon)}>{[30, 45, 60].map(n => <option key={n} value={n}>{n} days</option>)}</select></label>
      <button className="secondary-button" disabled={loading} onClick={() => setRefresh(n => n + 1)}>Refresh</button>
    </div>
    <p className="report-note">Read-only planning estimates. No orders or fund movements are created. Grades use recent performance; purchasing actions also account for inbound stock. Quantities are sellable units, not packs inside boxes.</p>
    {loading ? <p role="status">Calculating opportunities...</p> : error ? <div role="alert"><p>{error}</p><button className="secondary-button" onClick={() => setRefresh(n => n + 1)}>Try again</button></div> : report && <>
      <p className="report-note">As of {report.asOf} (America/Chicago). Sales: {report.currentFrom} through {report.asOf}; trend compares the preceding 60 days. Other report date filters do not apply.</p>
      <section className="investment-winners" aria-labelledby="investment-winners-title"><h3 id="investment-winners-title">Best places to reinvest</h3>
        {report.topOpportunities.length ? <ol>{report.topOpportunities.map(item => <li key={item.productId}><button onClick={() => explain(item.productId)}>
          <span className="investment-grade">{item.grade}</span><span><strong>{item.productName}</strong><span>{item.action}</span><small>{item.reasons.slice(0, 2).map(reason => investmentReasons[reason]).join(" ")}</small></span><strong className="investment-buy">Buy {purchaseLabel(item)}</strong>
        </button></li>)}</ol> : <p>No actionable purchases are supported by the current data. Review the ranking below for inbound, slow-moving, or new products.</p>}
      </section>
      <section aria-labelledby="investment-all-title"><h3 id="investment-all-title">All inventory</h3><div className="investment-filters" role="group" aria-label="Investment action filter">
        {(["All", "Buy Now", "Wait / Inbound", "Hold", "Avoid Restocking"] as InvestmentFilter[]).map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}</button>)}
      </div><p className="report-note">Buy Now includes all actionable purchase ranges. Hold includes overstock and insufficient data.</p>
      <div className="investment-columns" aria-hidden="true"><span>Grade</span><span>Product</span><span>Current action</span><span>Recommended buy</span><span>On hand</span><span>Inbound</span></div>
      <div className="investment-list">{filterInvestments(report.items, filter).map(item => <article key={item.productId}>
        <div className="investment-row"><span className="investment-grade" aria-label={item.grade ? `Grade ${item.grade}` : "Not yet graded"}>{item.grade ?? "—"}</span>
          <button id={`investment-product-${item.productId}`} className="investment-product" aria-expanded={expanded === item.productId} aria-controls={`investment-detail-${item.productId}`} onClick={() => setExpanded(expanded === item.productId ? null : item.productId)}><strong>{item.productName}</strong><small>{item.itemId} | {item.grade ? `${item.score}/100` : "Insufficient history"} | Why?</small></button>
          <span className={item.actionable ? "investment-action is-buy" : "investment-action"}>{item.action}</span><span className="investment-buy">{purchaseLabel(item)}</span>
          <span className="investment-quantity"><small>On hand</small>{item.onHand}</span><span className="investment-quantity"><small>Inbound</small>{item.inbound}</span>
        </div>{expanded === item.productId && <InvestmentExplanation item={item} />}
      </article>)}</div>
      {!filterInvestments(report.items, filter).length && <p className="report-empty">No products in this view.</p>}
      </section>
      <details className="investment-method"><summary>How grades and purchase ranges work</summary>
        <p>A 80-100 | B 65-79 | C 45-64 | D 30-44 | F 0-29. Fewer than 14 observed days and fewer than 5 units sold in 90 days means no confident grade.</p>
        <ul><li>Velocity: one point per recent unit, capped at 15; trend adds 10 growing, 8 stable, 5 new demand, or 2 declining. No sales adds zero.</li>
          <li>Profit efficiency: gross profit / COGS times 50, capped at 25 and floored at zero. Sell-through: units sold / (units sold + on hand) times 20.</li>
          <li>Stock need: 20 points below 7 days on hand, 16 below 14, 10 below 30, 4 below 60, otherwise zero. The grade excludes inbound; projected supply controls the action.</li>
          <li>Recency: 5 points for a sale in 7 days, 3 in 14, 1 in 30; plus one per selling day, capped at 5.</li></ul>
        <p>Forecast = recent 30-day units x horizon / 30 x trend factor (1.2 growing, 1 stable/new demand, 0.8 declining). Growing is above 1.20 times prior daily velocity; declining is below 0.80. Add 20% safety stock, round the target up, subtract on hand and inbound, and floor need at zero.</p>
        <p>A/B candidates receive a range from floor(80% of need) to need. C candidates use half the need, rounded up, before applying that range. Other actions recommend no purchase. A range may start at zero for very small needs. More than 90 projected days is overstock. Fewer than 2 recent units is slow moving; margin below 10% blocks buying. Unknown or inconsistent costs require review.</p>
        <p>Receiving events or recorded sales establish history; product creation alone does not. This is not a count of continuously in-stock days. Stockouts, seasonal demand, supplier lead times, pack sales, and spending limits are not forecasted. Reorder points are shown as context; the forecast does not change them.</p>
      </details>
    </>}
  </section>;
}
