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
type VisitPerformance = {sealed: {
  salesTransactions: number; unitsSold: number; revenue: string; cogs: string;
  grossProfit: string; grossMargin: number; cashRevenue: string; digitalRevenue: string;
}};

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
        const response = await fetch("/api/shows", {signal: controller.signal});
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
      const response = await fetch(`/api/shows/${path}`, {method: "PATCH", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
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
              <button type="button" style={controlStyle} aria-expanded={selectedVisit === visit.id} aria-controls={`visit-${visit.id}`} onClick={() => setSelectedVisit(selectedVisit === visit.id ? null : visit.id)}>{selectedVisit === visit.id ? "Sealed Sales \u25be" : "Sealed Sales \u25b8"}</button>
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
  averages: {grossProfitPerVisit: number};
};

function ShowSummary({showId}: {showId: number}) {
  const [data, setData] = useState<ShowPerformance | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/shows/${showId}/performance`, {signal: controller.signal});
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
      const response = await fetch(endpoint, {
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
          fetch(`/api/shows/visits/${visitId}`, {signal: controller.signal}),
          fetch(`/api/shows/visits/${visitId}/performance`, {signal: controller.signal}),
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
  </section>;
}

function Field({label, children}: {label: string; children: ReactNode}) {
  return <label style={{display: "flex", flexDirection: "column", gap: "7px", color: "#c8c8cd", fontSize: "12px"}}>{label}{children}</label>;
}
function Metric({label, value}: {label: string; value: string}) {
  return <article className="metric-card"><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong></article>;
}
