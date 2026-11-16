import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { adminFetch } from "../adminFetch";
import { calculateOrderWhatIf, parseOrderWhatIf } from "../../shared/orderWhatIf";
import type { OrderWhatIfInput, OrderWhatIfResults, SavedOrderWhatIf } from "../../shared/orderWhatIf";
import "./OrderWhatIfPage.css";

const endpoint = "/api/what-if-scenarios/orders";
const money = (value: string) => {
  const negative = value.startsWith("-"), [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  const digits = fraction.padEnd(3, "0");
  const rounded = BigInt(whole) * 100n + BigInt(digits.slice(0, 2)) + (Number(digits[2]) >= 5 ? 1n : 0n);
  return `${negative && rounded ? "-" : ""}$${new Intl.NumberFormat("en-US").format(rounded / 100n)}.${String(rounded % 100n).padStart(2, "0")}`;
};
const percent = (value: string | null) => value === null ? "Not defined" : `${(Number(value) * 100).toFixed(2)}%`;
const timestamp = (value: string) => new Date(value).toLocaleString();
const newLine = () => ({ description: "", quantity: "1", totalProductCost: "", sellingPriceOverride: null as string | null, key: crypto.randomUUID() });
type Draft = Omit<OrderWhatIfInput, "lines"> & { lines: ReturnType<typeof newLine>[] };
type Editor = { saved: SavedOrderWhatIf | null; draft: Draft };
function edit(saved: SavedOrderWhatIf | null, duplicate = false): Editor {
  return { saved: duplicate ? null : saved, draft: saved ? { name: duplicate ? `${saved.name.slice(0, 93)} (copy)` : saved.name, supplier: saved.supplier, notes: saved.notes, shippingCost: saved.shippingCost, tariffCost: saved.tariffCost, targetMargin: saved.targetMargin,
    lines: saved.lines.map(line => ({ ...line, quantity: String(line.quantity), key: crypto.randomUUID() })) } : { name: "", supplier: "", notes: "", shippingCost: "0", tariffCost: "0", targetMargin: "15", lines: [newLine()] } };
}
function payload(draft: Draft) {
  return parseOrderWhatIf({ ...draft, lines: draft.lines.map(({ key: _key, quantity, ...line }) => ({ ...line, quantity: quantity.trim() === "" ? null : Number(quantity) })) });
}
async function api(path = "", method = "GET", body?: unknown) {
  const response = await adminFetch(endpoint + path, { method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "Order scenario request failed.");
  return data;
}
export default function OrderWhatIfPage() {
  const [scenarios, setScenarios] = useState<SavedOrderWhatIf[]>([]), [editor, setEditor] = useState<Editor | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function load() {
    setLoading(true); setError("");
    try { setScenarios(await api()); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load scenarios."); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function open(id: number, duplicate = false) {
    setBusy(true); setError("");
    try { setEditor(edit(await api(`/${id}`), duplicate)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open scenario."); } finally { setBusy(false); }
  }
  async function remove(scenario: SavedOrderWhatIf) {
    if (!window.confirm(`Delete "${scenario.name}"? Only this planning scenario will be deleted.`)) return;
    setBusy(true); setError("");
    try { await api(`/${scenario.id}`, "DELETE", { updatedAt: scenario.updatedAt }); setScenarios(current => current.filter(item => item.id !== scenario.id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete scenario."); } finally { setBusy(false); }
  }
  return <div className="order-what-if">
    <header className="what-if-header"><div><span className="what-if-badge">Purchase planning</span><h2>Order What-If</h2><p>Model a purchase, landed costs and selling prices. These plans do not change your business records.</p></div><button type="button" className="primary-button" disabled={busy || loading} onClick={() => setEditor(edit(null))}>+ New Order Scenario</button></header>
    {error && <div className="panel what-if-error" role="alert">{error}<button type="button" className="secondary-button" disabled={busy} onClick={() => void load()}>Reload List</button></div>}
    <section className="panel"><div className="panel-header"><h3>Saved Order Scenarios</h3><span>{scenarios.length} saved &middot; Most recently updated first</span></div>
      {loading ? <p className="what-if-list-state" role="status">Loading scenarios...</p> : !scenarios.length ? <div className="what-if-list-state"><strong>Plan your next purchase</strong><p>Add items, shipping and tariffs to see your cost to the door and expected profit.</p><button type="button" className="secondary-button" onClick={() => setEditor(edit(null))}>Create a scenario</button></div> : <div className="ow-list">{scenarios.map(item => <article className="ow-saved" key={item.id}>
        <div><h4>{item.name}</h4><p>{item.supplier || "No supplier"}</p><small>Updated {timestamp(item.updatedAt)}</small></div>
        <dl className="ow-metrics"><Value label="Cost To Door" value={money(item.results.totalCostToDoor)} /><Value label="Expected Revenue" value={money(item.results.expectedRevenue)} /><Value label="Expected Profit" value={money(item.results.expectedProfit)} /><Value label="Expected Margin" value={percent(item.results.expectedMargin)} /></dl>
        <div className="ow-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => void open(item.id)}>Open / Edit</button><details className="what-if-action-menu"><summary aria-label={`Actions for ${item.name}`}>&hellip;</summary><div><button type="button" disabled={busy} onClick={() => void open(item.id, true)}>Duplicate</button><button type="button" className="is-danger" disabled={busy} onClick={() => void remove(item)}>Delete</button></div></details></div>
      </article>)}</div>}
    </section>
    {editor && <OrderScenarioEditor initial={editor} onClose={() => setEditor(null)} onSaved={saved => setScenarios(current => [saved, ...current.filter(item => item.id !== saved.id)])} />}
  </div>;
}
function Value({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="ow-field"><span>{label}</span>{children}</label>; }
function OrderScenarioEditor({ initial, onClose, onSaved }: { initial: Editor; onClose: () => void; onSaved: (saved: SavedOrderWhatIf) => void }) {
  const [draft, setDraft] = useState(initial.draft), [saved, setSaved] = useState(initial.saved), [baseline, setBaseline] = useState(JSON.stringify(initial.draft));
  const [saving, setSaving] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const dialog = useRef<HTMLFormElement>(null), dirty = JSON.stringify(draft) !== baseline;
  let results: OrderWhatIfResults | null = null, calculationError = "";
  try { results = calculateOrderWhatIf(payload({ ...draft, name: draft.name || "Untitled", lines: draft.lines.map(line => ({ ...line, description: line.description || "Item" })) })); }
  catch (cause) { calculationError = cause instanceof Error ? cause.message : "Check your inputs."; }
  function close() { if (!saving && (!dirty || window.confirm("Discard unsaved changes to this scenario?"))) onClose(); }
  // Keep focus inside the fixed dialog and restore it when closing.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) { if (dirty) { event.preventDefault(); event.returnValue = ""; } }
    window.addEventListener("beforeunload", beforeUnload); return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  function update<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft(current => ({ ...current, [key]: value })); setNotice(""); }
  function lineChange(key: string, patch: Partial<Draft["lines"][number]>) { update("lines", draft.lines.map(line => line.key === key ? { ...line, ...patch } : line)); }
  async function save(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    try {
      const input = payload(draft); setSaving(true);
      const result: SavedOrderWhatIf = await api(saved ? `/${saved.id}` : "", saved ? "PATCH" : "POST", { ...input, ...(saved ? { updatedAt: saved.updatedAt } : {}) });
      const normalized = edit(result).draft; setSaved(result); setDraft(normalized); setBaseline(JSON.stringify(normalized)); onSaved(result); setNotice("Scenario saved.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save scenario."); } finally { setSaving(false); }
  }
  return <div className="modal-backdrop ow-backdrop"><form ref={dialog} className="modal-surface ow-editor" role="dialog" aria-modal="true" aria-labelledby="ow-title" onSubmit={save} onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key === "Tab") {
      const elements = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? [])];
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <header className="ow-editor-header"><div><span>Hypothetical purchase &middot; {dirty ? "Unsaved changes" : saved ? "Saved" : "New scenario"}</span><h2 id="ow-title">{saved ? "Edit Order Scenario" : "New Order Scenario"}</h2></div><button type="button" className="secondary-button" disabled={saving} aria-label="Close scenario" onClick={close}>&times;</button></header>
    <div className="ow-editor-body"><fieldset disabled={saving}>
      <section className="ow-section"><h3>1. Order Details</h3><div className="ow-input-grid"><Field label="Scenario Name"><input required maxLength={100} value={draft.name} onChange={event => update("name", event.target.value)} placeholder="November Supplier Order" /></Field><Field label="Supplier (optional)"><input maxLength={160} value={draft.supplier ?? ""} onChange={event => update("supplier", event.target.value)} /></Field></div><Field label="Notes (optional)"><textarea maxLength={2000} rows={2} value={draft.notes ?? ""} onChange={event => update("notes", event.target.value)} /></Field>{saved && <p className="ow-muted">Created {timestamp(saved.createdAt)} &middot; Updated {timestamp(saved.updatedAt)}</p>}</section>
      <section className="ow-section"><h3>2. Items Being Purchased</h3><p className="ow-muted">Enter the total cost for all units in each line. No catalog product is required.</p><div className="ow-items">{draft.lines.map((line, index) => <article className="ow-item" key={line.key}><div className="ow-item-heading"><h4>Item {index + 1}</h4><button type="button" className="secondary-button" aria-label={`Remove item ${index + 1}`} onClick={() => update("lines", draft.lines.filter(item => item.key !== line.key))}>Remove</button></div><Field label="Item Description"><input required maxLength={200} value={line.description} onChange={event => lineChange(line.key, { description: event.target.value })} placeholder="Gem 6 booster box" /></Field><div className="ow-input-grid"><Field label="Total Quantity"><input required type="number" inputMode="numeric" min="1" max="1000000" step="1" value={line.quantity} onChange={event => lineChange(line.key, { quantity: event.target.value })} /></Field><Field label="Total Product Cost ($)"><input required type="number" inputMode="decimal" min="0" max="99999999.99" step="0.01" value={line.totalProductCost} onChange={event => lineChange(line.key, { totalProductCost: event.target.value })} /></Field></div><p>Product cost per item: <strong>{results ? money(results.lines[index].productCostPerItem) : "Enter valid costs and quantities"}</strong></p></article>)}</div><button type="button" className="secondary-button" disabled={draft.lines.length >= 100} onClick={() => update("lines", [...draft.lines, newLine()])}>+ Add Item</button></section>
      <section className="ow-section"><h3>3. Costs to Your Door</h3><div className="ow-input-grid"><Field label="Shipping Cost ($)"><input required type="number" inputMode="decimal" min="0" max="99999999.99" step="0.01" value={draft.shippingCost} onChange={event => update("shippingCost", event.target.value)} /></Field><Field label="Tariff Cost ($)"><input required type="number" inputMode="decimal" min="0" max="99999999.99" step="0.01" value={draft.tariffCost} onChange={event => update("tariffCost", event.target.value)} /></Field></div><dl className="ow-metrics"><Value label="Total Product Cost" value={results ? money(results.totalProductCost) : "\u2014"} /><Value label="Additional Costs" value={results ? money(results.totalAdditionalCost) : "\u2014"} /><Value label="Total Cost To Door" value={results ? money(results.totalCostToDoor) : "\u2014"} /></dl><p className="ow-muted">Shipping and tariffs are allocated by product value. Displayed unit costs are rounded; totals use exact allocated cents.</p></section>
      <section className="ow-section"><h3>4. Selling Assumptions</h3><Field label="Target Gross Margin (%)"><input required type="number" inputMode="decimal" min="0.01" max="99.99" step="0.01" value={draft.targetMargin} onChange={event => update("targetMargin", event.target.value)} /></Field><div className="ow-actions">{["15", "20"].map(value => <button key={value} type="button" className="secondary-button" onClick={() => update("targetMargin", value)}>{value}% margin</button>)}</div><p className="ow-muted">Price = landed unit cost / (1 - margin), rounded to the nearest whole dollar. Rounding can put actual margin below target. Selling fees are assumed to be $0.</p>
        <div className="ow-items">{draft.lines.map((line, index) => <article className="ow-item" key={line.key}><h4>{line.description || `Item ${index + 1}`}</h4><p>Recommended selling price: <strong>{results ? money(results.lines[index].recommendedPrice) : "\u2014"}</strong></p><Field label="Your Selling Price / Item ($)"><input aria-label={`Your selling price for ${line.description || `item ${index + 1}`}`} type="number" inputMode="decimal" min="0" max="99999999.99" step="0.01" value={line.sellingPriceOverride ?? ""} placeholder={results?.lines[index].recommendedPrice ?? "Use recommended"} onChange={event => lineChange(line.key, { sellingPriceOverride: event.target.value === "" ? null : event.target.value })} /></Field><p className="ow-muted">{line.sellingPriceOverride === null ? "Using recommended price; updates with assumptions." : "Using your override; kept when assumptions change."}</p>{line.sellingPriceOverride !== null && <button type="button" className="secondary-button" onClick={() => lineChange(line.key, { sellingPriceOverride: null })}>Reset to Recommended</button>}</article>)}</div>
      </section>
      <section className="ow-section"><h3>5. Expected Results</h3><p className="ow-muted">Assumes every item sells at its selected price.</p>{results ? <><dl className="ow-metrics ow-results"><Value label="Expected Profit" value={money(results.expectedProfit)} /><Value label="Total Cost To Door" value={money(results.totalCostToDoor)} /><Value label="Expected Revenue" value={money(results.expectedRevenue)} /><Value label="Expected Margin" value={percent(results.expectedMargin)} /><Value label="Target Margin" value={`${results.targetMargin}%`} /></dl><div className="ow-items">{results.lines.map((line, index) => <article className="ow-item" key={draft.lines[index].key}><h4>{line.description} &middot; {line.quantity} units</h4><dl className="ow-metrics"><Value label="Product Cost / Item" value={money(line.productCostPerItem)} /><Value label="Allocated Shipping" value={money(line.allocatedShipping)} /><Value label="Allocated Tariff" value={money(line.allocatedTariff)} /><Value label="Landed Cost / Item" value={money(line.landedCostPerItem)} /><Value label="Landed Line Total" value={money(line.landedCost)} /><Value label="Recommended Price" value={money(line.recommendedPrice)} /><Value label="Selected Price" value={money(line.selectedSellingPrice)} /><Value label="Expected Revenue" value={money(line.expectedRevenue)} /><Value label="Expected Profit" value={money(line.expectedProfit)} /><Value label="Actual Margin" value={percent(line.actualMargin)} /></dl></article>)}</div></> : <p role="status">{calculationError}</p>}</section>
    </fieldset></div>
    <footer className="ow-editor-footer"><dl className="ow-metrics ow-summary" aria-live="polite"><Value label="Cost To Door" value={results ? money(results.totalCostToDoor) : "\u2014"} /><Value label="Expected Profit" value={results ? money(results.expectedProfit) : "\u2014"} /><Value label="Margin" value={results ? percent(results.expectedMargin) : "\u2014"} /></dl>{error && <p role="alert" className="what-if-error">{error}</p>}{notice && <p role="status">{notice}</p>}<div className="ow-actions"><button type="button" className="secondary-button" disabled={saving} onClick={close}>Close</button><button type="submit" className="primary-button" disabled={saving || !results}>{saving ? "Saving..." : "Save Scenario"}</button></div></footer>
  </form></div>;
}
