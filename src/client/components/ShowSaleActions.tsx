import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { adminFetch } from "../adminFetch";
import { inputStyle } from "./uiStyles";

type Line = { productId: number; quantity: number; unitSalePrice: string; product: { name: string } };
type Context = { revision: string; sale: { saleNumber: string; paymentMethod: string; notes: string | null; lines: Line[] } };
type Product = { id: number; name: string; active: boolean; sellable: boolean; type: string; unitType: string };
const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function ShowSaleActions({ saleId, locked }: { saleId: number; locked: boolean }) {
  const [mode, setMode] = useState<"edit" | "delete" | null>(null);
  function open(button: HTMLButtonElement, next: "edit" | "delete") {
    const menu = button.closest("details");
    menu?.removeAttribute("open");
    menu?.querySelector("summary")?.focus();
    setMode(next);
  }
  return locked ? <span className="orders-status is-finalized">Locked · Finalized</span> : <>
    <details className="show-admin-menu"><summary aria-label="Sale actions">⋯</summary><div>
      <button type="button" onClick={event => open(event.currentTarget, "edit")}>Edit</button>
      <button type="button" onClick={event => open(event.currentTarget, "delete")}>Delete</button>
    </div></details>
    {mode && <CorrectionDialog saleId={saleId} mode={mode} close={() => setMode(null)} />}
  </>;
}

function CorrectionDialog({ saleId, mode, close }: { saleId: number; mode: "edit" | "delete"; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [context, setContext] = useState<Context | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [payment, setPayment] = useState("CASH");
  const [notes, setNotes] = useState("");
  const [review, setReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (context) dialog.current?.querySelector<HTMLElement>("input, select, button")?.focus();
  }, [context, review]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await adminFetch(`/api/sales/${saleId}/correction`, { signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Sale could not be loaded.");
        if (mode === "edit") {
          const productResponse = await adminFetch("/api/products", { signal: controller.signal });
          if (!productResponse.ok) throw new Error("Product options could not be loaded.");
          const options: Product[] = await productResponse.json();
          if (!controller.signal.aborted) setProducts(options.filter(product => product.active && product.sellable && product.type === "SEALED" && product.unitType !== "CASE"));
        }
        if (!controller.signal.aborted) {
          setContext(body); setLines(body.sale.lines); setPayment(body.sale.paymentMethod); setNotes(body.sale.notes ?? "");
        }
      } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Sale could not be loaded."); }
    })();
    return () => controller.abort();
  }, [saleId, mode]);
  const total = (items: Line[]) => items.reduce((sum, line) => sum + line.quantity * Number(line.unitSalePrice), 0);
  const valid = lines.length > 0 && new Set(lines.map(line => line.productId)).size === lines.length && lines.every(line => line.productId > 0 && Number.isInteger(line.quantity) && line.quantity > 0 && /^\d+(\.\d{1,2})?$/.test(line.unitSalePrice));
  async function save() {
    if (!context || saving) return;
    setSaving(true); setError(null);
    try {
      const response = await adminFetch(`/api/sales/${saleId}/correction`, {
        method: mode === "delete" ? "DELETE" : "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "delete" ? { revision: context.revision } : { revision: context.revision, paymentMethod: payment, notes, lines: lines.map(({ productId, quantity, unitSalePrice }) => ({ productId, quantity, unitSalePrice })) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Sale correction failed.");
      close();
      window.dispatchEvent(new Event("business-data-changed"));
    } catch (error) { setError(error instanceof Error ? error.message : "Sale correction failed."); setSaving(false); }
  }
  function update(index: number, change: Partial<Line>) { setLines(current => current.map((line, i) => i === index ? { ...line, ...change } : line)); }
  return createPortal(<dialog ref={dialog} aria-labelledby="show-sale-correction-title" className="modal-surface show-sale-correction" style={{ width: "min(640px, calc(100vw - 32px))", maxHeight: "85vh", overflowY: "auto", color: "inherit", background: "#191a20", border: "1px solid #393a41", borderRadius: 12, padding: 24 }} onCancel={event => { event.preventDefault(); if (!saving) close(); }}>
    <h2 id="show-sale-correction-title">{mode === "delete" ? "Delete Sale?" : review ? "Review Sale Changes" : "Edit Sale"}</h2>
    {error && <p role="alert">{error}</p>}
    {!context && !error && <p role="status">Loading sale…</p>}
    {context && <form onSubmit={event => { event.preventDefault(); if (mode === "edit" && !review) setReview(true); else void save(); }}>
      <p>{context.sale.saleNumber} · Show association and sale date stay fixed.</p>
      {mode === "delete" ? <>
        {context.sale.lines.map((line, index) => <p key={index}>{line.product.name} · Qty {line.quantity} · {money(line.quantity * Number(line.unitSalePrice))}</p>)}
        <p>{money(total(context.sale.lines))} · {context.sale.paymentMethod}</p>
        <p>Deleting restores sealed inventory, removes this sale from Show performance, and appends a reversal of its revenue to SEALED Funds. Ledger history is retained.</p>
      </> : review ? <>
        {lines.map((line, index) => <p key={index}>{products.find(product => product.id === line.productId)?.name ?? line.product.name} · Qty {line.quantity} · {money(line.quantity * Number(line.unitSalePrice))}</p>)}
        <p>Revenue: {money(total(context.sale.lines))} → {money(total(lines))}</p>
        <p>Payment: {context.sale.paymentMethod} → {payment}</p>
        <p>Notes: {notes || "None"}</p>
        <p>Original inventory will be restored and corrected quantities allocated using current FIFO costs. COGS is recalculated when you confirm. If inventory is unavailable, the original sale stays unchanged.</p>
      </> : <>
        {lines.map((line, index) => <fieldset key={index} style={{ border: "1px solid #393a41", marginBottom: 12 }}><legend>Line {index + 1}</legend>
          <label>Product<select style={inputStyle} value={line.productId} onChange={event => update(index, { productId: Number(event.target.value) })} required>
            {!products.some(product => product.id === line.productId) && <option value={line.productId}>{line.product.name} (unavailable)</option>}
            {products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select></label>
          <label>Quantity<input style={inputStyle} type="number" min="1" step="1" required value={line.quantity} onChange={event => update(index, { quantity: Number(event.target.value) })} /></label>
          <label>Sale price per unit<input style={inputStyle} type="number" min="0" step="0.01" required value={line.unitSalePrice} onChange={event => update(index, { unitSalePrice: event.target.value })} /></label>
          <button className="secondary-button" type="button" disabled={lines.length === 1} onClick={() => setLines(current => current.filter((_, i) => i !== index))}>Remove line</button>
        </fieldset>)}
        <button type="button" className="secondary-button" onClick={() => { const product = products.find(product => !lines.some(line => line.productId === product.id)); if (product) setLines(current => [...current, { productId: product.id, quantity: 1, unitSalePrice: "0", product }]); }}>Add line</button>
        <label>Payment method<select style={inputStyle} value={payment} onChange={event => setPayment(event.target.value)}><option value="CASH">Cash</option><option value="DIGITAL">Digital</option></select></label>
        <label>Notes<textarea style={inputStyle} maxLength={10000} value={notes} onChange={event => setNotes(event.target.value)} /></label>
        <p>Sale total: {money(total(lines))}</p>
      </>}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
        {review && <button type="button" className="secondary-button" disabled={saving} onClick={() => setReview(false)}>Back</button>}
        <button type="button" className="secondary-button" disabled={saving} onClick={close}>Cancel</button>
        <button type="submit" className={mode === "delete" ? "danger-button" : "primary-button"} disabled={saving || (mode === "edit" && !valid)}>{saving ? "Saving…" : mode === "delete" ? "Delete Sale" : review ? "Confirm Update" : "Review Changes"}</button>
      </div>
    </form>}
    {!context && <button type="button" className="secondary-button" onClick={close}>Close</button>}
  </dialog>, document.body);
}
