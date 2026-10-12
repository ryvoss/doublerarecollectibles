import { adminFetch } from "../adminFetch";
import { controlStyle } from "../components/uiStyles";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";

type Visit = {id: number; visitDate: string; finalizedAt: string | null; notes: string | null};
type Show = {id: number; name: string; active: boolean; notes: string | null; visits: Visit[]};
type VisitDetail = Visit & {
  show: {name: string};
  sales: {id: number; saleNumber: string; saleDate: string; paymentMethod: string;
    lines: {id: number; product: {name: string; type: string}; quantity: number; revenue: string | number; cogs: string | number; grossProfit: string | number}[];
  }[];
};
type PackSummary = {
  snapshotCount: number; productCount: number; packsSold: number; declaredSalesValue: number; cogs: number;
  giveawayCost: number; damagedCost: number; actualRevenue: number | null; cashRevenue: number | null;
  digitalRevenue: number | null; grossProfit: number | null; grossMargin: number | null;
  actualRevenueCount: number; declaredOnlyCount: number; actualRevenueComplete: boolean;
  revenueMode: "ACTUAL" | "DECLARED_ONLY" | "MIXED";
};
type PackPerformanceRow = {
  sourceBoxProductId: number; sourceItemId: string; sourceBoxProductName: string; packDisplayName: string; snapshotCount: number; visitCount: number;
  startingPacks: number; addedPacks: number; endingPacks: number; giveaways: number; damaged: number;
  packsSold: number; declaredValuePerPack: number; declaredSalesValue: number; cogs: number;
  giveawayCost: number; damagedCost: number; actualRevenue: number | null; cashRevenue: number | null;
  digitalRevenue: number | null; grossProfit: number | null; grossMargin: number | null;
  revenueMode: "ACTUAL" | "DECLARED_ONLY" | "MIXED";
  remaining: { packs: number; costBasis: number; retailUnitValue: number; retailValueSource: "DEFAULT_PACK_PRICE" | "LATEST_DECLARED_VALUE"; retailValue: number; potentialGrossProfit: number };
};
type VisitPerformance = {sealed: {
  salesTransactions: number; unitsSold: number; revenue: string; cogs: string;
  grossProfit: string; grossMargin: number; cashRevenue: string; digitalRevenue: string;
}; pack: { summary: PackSummary; products: PackPerformanceRow[] }};

const money = (value: string | number) => new Intl.NumberFormat("en-US", {style: "currency", currency: "USD"}).format(Number(value));

export default function ShowsPage() {
  const [shows, setShows] = useState<Show[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<"new" | Show | null>(null);
  const [editingShow, setEditingShow] = useState(false);
  const [editingVisit, setEditingVisit] = useState<Visit | undefined>();
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [selectedVisit, setSelectedVisit] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError(null);
      try {
        const response = await adminFetch("/api/shows", {signal: controller.signal});
        if (!response.ok) throw new Error("Shows could not be loaded.");
        const data: Show[] = await response.json();
        if (!controller.signal.aborted) setShows(data);
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Shows could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [refresh]);

  function openForm(value: "new" | Show, editShow = false, visit?: Visit) {
    setForm(value); setEditingShow(editShow); setEditingVisit(visit); setMessage(null); setActionError(null);
  }

  async function updateStatus(path: string, body: object, message: string) {
    setWorking(true); setActionError(null); setMessage(null);
    try {
      const response = await adminFetch(`/api/shows/${path}`, {method: "PATCH", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Could not update show or visit.");
      setMessage(message); setRefresh((value) => value + 1);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not update show or visit.");
    } finally {setWorking(false);}
  }

  const visibleShows = shows.filter((show) => show.name.toLowerCase().includes(search.trim().toLowerCase()));
  return <div className="shows-page">
    <div className="page-heading">
      <div><h2>Show History</h2><p>Review recurring shows and past visits. Run active visits from Command Center.</p></div>
      <div style={{display: "flex", gap: "10px"}}>
        <button type="button" style={controlStyle} disabled={loading || form !== null} onClick={() => setRefresh((value) => value + 1)}>Refresh</button>
        <button type="button" className="primary-button" disabled={form !== null || working} onClick={() => openForm("new")}>Add Show</button>
      </div>
    </div>
    {message && <p role="status">{message}</p>}
    {actionError && <p role="alert">{actionError}</p>}
    {form !== null && <ShowForm key={form === "new" ? "new" : `${form.id}-${editingShow}-${editingVisit?.id}`} show={form === "new" ? undefined : form}
      editShow={editingShow} visit={editingVisit}
      onCancel={() => setForm(null)} onSaved={(id) => {
        setExpandedId(id); setForm(null); setMessage("Changes saved.");
        setRefresh((value) => value + 1);
      }} />}
    <input aria-label="Search shows" placeholder="Search shows" style={{...controlStyle, marginBottom: "16px"}} value={search} onChange={(event) => setSearch(event.target.value)} />
    {loading ? <p role="status">Loading shows...</p> : error ? <p role="alert">{error}</p> : visibleShows.length === 0 ? <p>No shows match. Add a show to get started.</p> :
      visibleShows.map((show) => <section key={show.id} className="panel show-history-card">
        <div className="panel-header" style={{position: "relative"}}>
          <button type="button" className="show-expand-toggle"
            aria-label={`${expandedId === show.id ? "Collapse" : "Expand"} visits for ${show.name}`}
            aria-expanded={expandedId === show.id} aria-controls={`show-${show.id}`}
            onClick={() => {setExpandedId(expandedId === show.id ? null : show.id); setSelectedVisit(null);}}
          />
          <div style={{position: "relative", pointerEvents: "none"}}><h3><span aria-hidden="true">{expandedId === show.id ? "\u25be" : "\u25b8"}</span>{" "}{show.name}{!show.active ? " (Inactive)" : ""}</h3><p>{show.visits.length} visit(s){show.notes ? ` · ${show.notes}` : ""}</p></div>
          <details className="show-admin-menu"><summary aria-label={`Actions for ${show.name}`}>&hellip;</summary><div>
            <button type="button" style={controlStyle} disabled={working || form !== null} onClick={() => openForm(show, true)}>Edit Show</button>
            <button type="button" style={controlStyle} disabled={working || form !== null} onClick={() => updateStatus(String(show.id), {active: !show.active}, show.active ? "Show deactivated. Existing visits and sales are retained." : "Show reactivated.")}>{show.active ? "Deactivate" : "Reactivate"}</button>
            <button type="button" style={controlStyle} disabled={working || !show.active || form !== null} onClick={() => openForm(show)}>Add Visit</button>
          </div></details>
          <ShowSummary showId={show.id} />
        </div>
        {expandedId === show.id && <div id={`show-${show.id}`} style={{padding: "20px"}}>
          {show.visits.length === 0 ? <p>No visits yet. Add an event date above.</p> : show.visits.map((visit) => <article key={visit.id} className="show-visit-card">
            <div className="expandable-row" onClick={(event) => {
              if (!(event.target as HTMLElement).closest("button, a, input, select, summary, details")) setSelectedVisit(selectedVisit === visit.id ? null : visit.id);
            }} style={{display: "flex", justifyContent: "space-between", alignItems: "center", gap: "14px", flexWrap: "wrap"}}>
              <div><strong>{visit.visitDate.slice(0, 10)}</strong><span className={visit.finalizedAt ? "orders-status is-finalized" : "orders-status is-draft"}> · {visit.finalizedAt ? "Finalized" : "Open for sales"}</span>{visit.notes && <p>{visit.notes}</p>}</div>
              <button type="button" style={controlStyle} aria-expanded={selectedVisit === visit.id} aria-controls={`visit-${visit.id}`} onClick={() => setSelectedVisit(selectedVisit === visit.id ? null : visit.id)}>{selectedVisit === visit.id ? "Show Details \u25be" : "Show Details \u25b8"}</button>
              {!visit.finalizedAt && <details className="show-admin-menu"><summary aria-label="Visit actions">&hellip;</summary><div>
                <button type="button" style={controlStyle} disabled={working || form !== null} onClick={() => openForm(show, false, visit)}>Edit Visit</button>
                <button type="button" style={controlStyle} disabled={working || form !== null} onClick={() => {
                  if (window.confirm(`Finalize ${show.name} on ${visit.visitDate.slice(0, 10)}? This locks the visit and prevents additional sales.`)) {
                    void updateStatus(`visits/${visit.id}/finalize`, {}, "Visit finalized. Further edits and sales are blocked.");
                  }
                }}>Finalize Visit</button>
              </div></details>}
            </div>
            {selectedVisit === visit.id && <VisitSales key={visit.id} visitId={visit.id} />}
          </article>)}
        </div>}
      </section>)}
  </div>;
}

type ShowPerformance = {
  show: {finalizedVisits: number; openVisits: number};
  sealed: {revenue: number; grossProfit: number; grossMargin: number};
  pack: {summary: PackSummary; products: PackPerformanceRow[]};
  averages: {grossProfitPerVisit: number};
};

function ShowSummary({showId}: {showId: number}) {
  const [data, setData] = useState<ShowPerformance | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await adminFetch(`/api/shows/${showId}/performance`, {signal: controller.signal});
        if (!response.ok) throw new Error("Summary unavailable");
        const result: ShowPerformance = await response.json();
        if (!controller.signal.aborted) setData(result);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    }
    void load();
    return () => controller.abort();
  }, [showId]);

  // Pointer events pass through to the full-row expand button.
  return <div style={{position: "relative", pointerEvents: "none", flexBasis: "100%", borderTop: "1px solid #303137", paddingTop: "10px"}}>
    {!data ? <span role={error ? "alert" : "status"} style={{fontSize: "12px", color: "#898a91"}}>{error ? "Summary unavailable. Use Refresh to retry." : "Loading summary..."}</span> : <>
      <dl style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: "10px 16px", margin: 0}}>
        <SummaryValue label="Finalized Visits" value={String(data.show.finalizedVisits)} />
        <SummaryValue label="Sealed Revenue" value={money(data.sealed.revenue)} />
        <SummaryValue label="Gross Profit" value={money(data.sealed.grossProfit)} />
        <SummaryValue label="Gross Margin" value={new Intl.NumberFormat("en-US", {style: "percent", maximumFractionDigits: 1}).format(data.sealed.grossMargin)} />
        <SummaryValue label="Pack Revenue" value={data.pack.summary.actualRevenue === null ? "—" : money(data.pack.summary.actualRevenue)} />
        <SummaryValue label="Packs Sold" value={String(data.pack.summary.packsSold)} />
        <SummaryValue label="Avg. Profit / Visit" value={money(data.averages.grossProfitPerVisit)} />
      </dl>
      <p style={{fontSize: "11px", color: "#898a91", margin: "6px 0 0"}}>Finalized visits only{data.show.openVisits > 0 ? ` · ${data.show.openVisits} open visit(s) excluded` : ""}.</p>
    </>}
  </div>;
}

function SummaryValue({label, value}: {label: string; value: string}) {
  return <div><dt style={{fontSize: "11px", color: "#898a91"}}>{label}</dt><dd style={{margin: "3px 0 0", color: "#e5e5e7", fontSize: "16px", fontWeight: 650, fontVariantNumeric: "tabular-nums"}}>{value}</dd></div>;
}

function ShowForm({show, editShow, visit, onCancel, onSaved}: {show?: Show; editShow: boolean; visit?: Visit; onCancel: () => void; onSaved: (showId: number) => void}) {
  const isVisit = !!show && !editShow;
  const [name, setName] = useState(editShow ? show?.name ?? "" : "");
  const [date, setDate] = useState(() => {
    if (visit) return visit.visitDate.slice(0, 10);
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  });
  const [notes, setNotes] = useState(visit?.notes ?? (editShow ? show?.notes ?? "" : ""));
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if (isVisit ? !date : !name.trim()) {setError(isVisit ? "Enter a visit date." : "Enter a show name."); return;}
    submitting.current = true; setSaving(true); setError(null);
    try {
      const endpoint = visit ? `/api/shows/visits/${visit.id}` : editShow ? `/api/shows/${show?.id}` : show ? `/api/shows/${show.id}/visits` : "/api/shows";
      const response = await adminFetch(endpoint, {
        method: visit || editShow ? "PATCH" : "POST", headers: {"Content-Type": "application/json"},
        // Only event metadata is entered here; no Singles or Funds balances.
        body: JSON.stringify(isVisit ? {visitDate: date, notes: notes.trim() || null} : {name: name.trim(), notes: notes.trim() || null}),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Could not save the show or visit.");
      onSaved(show?.id ?? body.id);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save the show or visit.");
    } finally {
      submitting.current = false; setSaving(false);
    }
  }

  return <section className="panel" style={{padding: "20px", marginBottom: "20px"}}>
    <h3>{visit ? `Edit Visit — ${show?.name}` : editShow ? "Edit Show" : show ? `Add Visit — ${show.name}` : "Add Recurring Show"}</h3>
    {visit && <p style={{color: "#898a91", fontSize: "12px"}}>Changing the visit date does not change dates recorded on existing sales.</p>}
    <form onSubmit={submit}><fieldset disabled={saving} style={{border: 0, margin: 0, padding: 0}}>
      <div style={{display: "grid", gap: "14px"}}>
        {isVisit ? <Field label="Visit Date"><input type="date" required style={controlStyle} value={date} onChange={(event) => setDate(event.target.value)} /></Field> :
          <Field label="Show Name"><input required style={controlStyle} value={name} onChange={(event) => setName(event.target.value)} placeholder="St. Louis Card Show" /></Field>}
        <Field label="Notes (optional)"><textarea rows={2} style={controlStyle} value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
      </div>
      {error && <p role="alert">{error}</p>}
      <div style={{display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px"}}>
        <button type="button" style={controlStyle} onClick={onCancel}>Cancel</button>
        <button type="submit" className="primary-button">{saving ? "Saving..." : isVisit ? "Save Visit" : "Save Show"}</button>
      </div>
    </fieldset></form>
  </section>;
}

function VisitSales({visitId}: {visitId: number}) {
  const [data, setData] = useState<{detail: VisitDetail; performance: VisitPerformance} | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setData(null); setError(null);
      try {
        const [detailResponse, performanceResponse] = await Promise.all([
          adminFetch(`/api/shows/visits/${visitId}`, {signal: controller.signal}),
          adminFetch(`/api/shows/visits/${visitId}/performance`, {signal: controller.signal}),
        ]);
        if (!detailResponse.ok || !performanceResponse.ok) throw new Error("Visit sales could not be loaded.");
        const [detail, performance] = await Promise.all([detailResponse.json(), performanceResponse.json()]);
        if (!controller.signal.aborted) setData({detail, performance});
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Visit sales could not be loaded.");
      }
    }
    void load(); return () => controller.abort();
  }, [visitId, retry]);

  if (error) return <div role="alert">{error} <button type="button" style={controlStyle} onClick={() => setRetry((value) => value + 1)}>Retry</button></div>;
  if (!data) return <p role="status">Loading sealed sales...</p>;
  const sealed = data.performance.sealed;
  const pack = data.performance.pack;
  return <section id={`visit-${visitId}`} style={{marginTop: "20px"}} aria-label="Visit sealed performance">
    <div className="metric-grid">
      <Metric label="Sealed Revenue" value={money(sealed.revenue)} /><Metric label="FIFO COGS" value={money(sealed.cogs)} />
      <Metric label="Gross Profit" value={money(sealed.grossProfit)} /><Metric label="Gross Margin" value={new Intl.NumberFormat("en-US", {style: "percent", maximumFractionDigits: 1}).format(sealed.grossMargin)} />
    </div>
    <p style={{color: "#a7a7ad", fontSize: "12px"}}>{sealed.salesTransactions} sales · {sealed.unitsSold} units · Cash revenue {money(sealed.cashRevenue)} · Digital revenue {money(sealed.digitalRevenue)}</p>
    <p style={{color: "#898a91", fontSize: "12px"}}>Record sales on the Sales page and select this show visit. Values below come from recorded sales.</p>
    {data.detail.sales.length === 0 ? <p>No linked sales yet.</p> : data.detail.sales.map((sale) => <article key={sale.id} style={{padding: "14px 0", borderTop: "1px solid #303137"}}>
      <strong>{sale.saleNumber} · {sale.saleDate.slice(0, 10)} · {sale.paymentMethod}</strong>
      {sale.lines.filter((line) => line.product.type === "SEALED").map((line) => <p key={line.id} style={{fontSize: "13px", color: "#a7a7ad"}}>
        {line.quantity}{" \u00d7 "}{line.product.name} · Revenue {money(line.revenue)} · COGS {money(line.cogs)} · Profit {money(line.grossProfit)}
      </p>)}
    </article>)}
    {data.detail.finalizedAt && pack.products.length > 0 && <PackPerformance summary={pack.summary} products={pack.products} />}
  </section>;
}

function PackPerformance({summary, products}: {summary: PackSummary; products: PackPerformanceRow[]}) {
  const actualDetail = summary.revenueMode === "ACTUAL"
    ? "Actual Cash and Digital pack revenue recorded at finalization."
    : summary.revenueMode === "MIXED"
      ? `${summary.declaredOnlyCount} product result(s) are analytical because Actual Revenue was not entered.`
      : "Analytical only. Declared Sales Value was not recorded as collected revenue.";
  return <section className="show-pack-performance" aria-labelledby="show-pack-performance-title">
    <header className="show-pack-performance__header">
      <div><span>Finalized pack snapshot</span><h4 id="show-pack-performance-title">Pack Performance</h4><p>{actualDetail}</p></div>
      <span className={`report-badge pack-revenue-mode is-${summary.revenueMode.toLowerCase()}`}>{summary.revenueMode === "ACTUAL" ? "Actual revenue" : summary.revenueMode === "MIXED" ? "Mixed actual / analytical" : "Declared-value analysis"}</span>
    </header>
    <div className="metric-grid show-pack-performance__summary">
      <Metric label="Packs Sold" value={String(summary.packsSold)} />
      <Metric label="Declared Sales Value" value={money(summary.declaredSalesValue)} />
      <Metric label="Actual Pack Revenue" value={summary.actualRevenue === null ? "Not entered" : money(summary.actualRevenue)} />
      <Metric label="Pack COGS" value={money(summary.cogs)} />
      <Metric label="Pack Gross Profit" value={summary.grossProfit === null ? "—" : money(summary.grossProfit)} />
      <Metric label="Pack Gross Margin" value={summary.grossMargin === null ? "—" : new Intl.NumberFormat("en-US", {style: "percent", maximumFractionDigits: 1}).format(summary.grossMargin)} />
      <Metric label="Pack Revenue · Cash" value={summary.cashRevenue === null ? "—" : money(summary.cashRevenue)} />
      <Metric label="Pack Revenue · Digital" value={summary.digitalRevenue === null ? "—" : money(summary.digitalRevenue)} />
    </div>
    <div className="show-pack-performance__products">
      {products.map(product => <article key={product.sourceBoxProductId} className="show-pack-performance__product">
        <header><div><h5>{product.packDisplayName}</h5><span>From {product.sourceBoxProductName} · {product.sourceItemId}</span></div><span className={`report-badge pack-revenue-mode is-${product.revenueMode.toLowerCase()}`}>{product.revenueMode === "ACTUAL" ? "Actual" : product.revenueMode === "MIXED" ? "Mixed" : "Analytical only"}</span></header>
        <dl className="show-pack-performance__grid">
          <PackValue label="Starting Packs" value={String(product.startingPacks)} />
          <PackValue label="Added During Show" value={String(product.addedPacks)} />
          <PackValue label="Ending Packs" value={String(product.endingPacks)} />
          <PackValue label="Giveaways" value={String(product.giveaways)} />
          <PackValue label="Damaged" value={String(product.damaged)} />
          <PackValue label="Packs Sold" value={String(product.packsSold)} emphasize />
          <PackValue label="Declared Value / Pack" value={money(product.declaredValuePerPack)} />
          <PackValue label="Declared Sales Value" value={money(product.declaredSalesValue)} />
          <PackValue label="Sold COGS" value={money(product.cogs)} />
          <PackValue label="Giveaway Cost" value={money(product.giveawayCost)} />
          <PackValue label="Damaged Cost" value={money(product.damagedCost)} />
          <PackValue label="Actual Revenue" value={product.actualRevenue === null ? "Not entered" : money(product.actualRevenue)} emphasize={product.actualRevenue !== null} />
          <PackValue label="Cash Revenue" value={product.cashRevenue === null ? "—" : money(product.cashRevenue)} />
          <PackValue label="Digital Revenue" value={product.digitalRevenue === null ? "—" : money(product.digitalRevenue)} />
          <PackValue label="Actual Gross Profit" value={product.grossProfit === null ? "—" : money(product.grossProfit)} />
          <PackValue label="Actual Gross Margin" value={product.grossMargin === null ? "—" : new Intl.NumberFormat("en-US", {style: "percent", maximumFractionDigits: 1}).format(product.grossMargin)} />
        </dl>
        <div className="show-pack-performance__remaining">
          <div><span>Packs Remaining</span><strong>{product.remaining.packs}</strong></div>
          <div><span>Remaining Cost Basis</span><strong>{money(product.remaining.costBasis)}</strong></div>
          <div><span>Expected / Declared Retail</span><strong>{money(product.remaining.retailValue)}</strong><small>{money(product.remaining.retailUnitValue)} each · {product.remaining.retailValueSource === "DEFAULT_PACK_PRICE" ? "current default Pack price" : "latest declared value"}</small></div>
          <div><span>Potential Remaining Gross Profit</span><strong>{money(product.remaining.potentialGrossProfit)}</strong></div>
        </div>
      </article>)}
    </div>
    <p className="show-pack-performance__note">Remaining position comes only from PackPool inventory. Converted source boxes are excluded from sealed box quantity, preventing double-counting.</p>
  </section>;
}

function PackValue({label, value, emphasize = false}: {label: string; value: string; emphasize?: boolean}) {
  return <div className={emphasize ? "is-emphasis" : ""}><dt>{label}</dt><dd>{value}</dd></div>;
}

function Field({label, children}: {label: string; children: ReactNode}) {
  return <label style={{display: "flex", flexDirection: "column", gap: "7px", color: "#c8c8cd", fontSize: "12px"}}>{label}{children}</label>;
}
function Metric({label, value}: {label: string; value: string}) {
  return <article className="metric-card"><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong></article>;
}
