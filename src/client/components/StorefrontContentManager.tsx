import { useEffect, useState, type FormEvent } from "react";
import { adminFetch } from "../adminFetch";
import { ANNOUNCEMENT_TYPES, CONTENT_DESTINATIONS, contentDestinationPath, validateContent, type ContentKind, type StorefrontContent, type StorefrontAnnouncement, type StorefrontNewsPost } from "../../shared/storefrontContent";
import type { AdminPublicListingItem } from "../../shared/publicInventory";
import { AnnouncementCard, NewsArticle } from "../public/StorefrontSections";
import "../public/PublicTheme.css";
import "../public/StorefrontRetail.css";

function initialDraft(kind: ContentKind): Record<string, unknown> {
  if (kind === "categories") return { name: "", slug: "", visible: false, sortOrder: 0, productIds: [] };
  if (kind === "news") return { title: "", slug: "", summary: "", body: "", imageUrl: null, published: false, publishAt: new Date().toISOString() };
  return { type: "STORE_UPDATE", title: "", summary: "", imageUrl: null, published: false, sortOrder: 0, startsAt: null, endsAt: null, destination: "INVENTORY", destinationSlug: null };
}

function localDate(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function StorefrontContentManager({ kind }: { kind: ContentKind }) {
  const [content, setContent] = useState<StorefrontContent>({ categories: [], news: [], announcements: [] });
  const [products, setProducts] = useState<AdminPublicListingItem[]>([]);
  const [draft, setDraft] = useState(() => initialDraft(kind));
  const [id, setId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [productSearch, setProductSearch] = useState("");
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(null);
    void Promise.all([adminFetch("/api/site/content", { signal: controller.signal }), adminFetch("/api/products/public-listings", { signal: controller.signal })])
      .then(async ([contentResponse, productsResponse]) => {
        if (!contentResponse.ok || !productsResponse.ok) throw new Error("Storefront content could not be loaded. Check that the storefront migration has been applied in this environment.");
        const [body, listings] = await Promise.all([contentResponse.json() as Promise<StorefrontContent>, productsResponse.json() as Promise<AdminPublicListingItem[]>]);
        if (!controller.signal.aborted) { setContent(body); setProducts(listings); }
      }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Content could not be loaded."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [version]);

  const update = (field: string, value: unknown) => { setDraft((current) => ({ ...current, [field]: value })); setMessage(null); };
  const text = (field: string) => String(draft[field] ?? "");
  const label = kind === "categories" ? "Categories" : kind === "news" ? "News & Updates" : "Announcements";
  const selectedIds = (draft.productIds ?? []) as number[];
  const validated = validateContent(kind, draft);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (typeof validated === "string") { setError(validated); return; }
    setBusy(true); setError(null); setMessage(null);
    try {
      const response = await adminFetch(`/api/site/content/${kind}${id === null ? "" : `/${id}`}`, {
        method: id === null ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validated),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Content could not be saved.");
      setDraft(initialDraft(kind)); setId(null); setVersion((value) => value + 1); setMessage("Saved. Published content follows its schedule and destination visibility.");
      window.dispatchEvent(new Event("business-data-changed"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Content could not be saved."); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (id === null || !window.confirm(kind === "categories" ? "Delete this category? Products will remain; only category assignments are removed." : "Delete this content? Announcements pointing to deleted news will be hidden.")) return;
    setBusy(true); setError(null);
    try {
      const response = await adminFetch(`/api/site/content/${kind}/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Content could not be deleted.");
      setDraft(initialDraft(kind)); setId(null); setVersion((value) => value + 1); setMessage("Deleted.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Deletion failed."); }
    finally { setBusy(false); }
  }

  function field(name: string, title: string, maxLength: number, multiline = false) {
    return <label className={`site-manager-field${multiline ? " is-wide" : ""}`}><span>{title}</span>{multiline ? <textarea value={text(name)} maxLength={maxLength} rows={name === "body" ? 12 : 3} required onChange={(event) => update(name, event.target.value)} /> : <input value={text(name)} maxLength={maxLength} required onChange={(event) => update(name, event.target.value)} />}</label>;
  }
  function dateField(name: string, title: string, required = false) {
    return <label className="site-manager-field"><span>{title} (your local time)</span><input type="datetime-local" required={required} value={localDate(draft[name])} onChange={(event) => update(name, event.target.value ? new Date(event.target.value).toISOString() : null)} /></label>;
  }

  return <section className="panel site-manager-section">
    <header><h3>{label}</h3><p>{kind === "categories" ? "Customer navigation only. Set order, visibility, and product assignments without changing inventory." : "Plain-text editorial content. Drafts and future schedules stay private. Lower order numbers appear first."}</p></header>
    {error && <p className="site-manager-notice is-error" role="alert">{error}</p>}{message && <p className="site-manager-notice is-success" role="status">{message}</p>}
    {loading ? <p role="status">Loading content…</p> : <div className="storefront-editor-layout">
      <aside className="storefront-editor-list" aria-label={`${label} records`}>
        <button className="secondary-button" type="button" disabled={busy} onClick={() => { setId(null); setDraft(initialDraft(kind)); setError(null); }}>Create new</button>
        {content[kind].map((record) => <button key={record.id} type="button" disabled={busy} aria-pressed={id === record.id} onClick={() => { const { id: recordId, ...values } = record; setId(recordId); setDraft(values); setError(null); setMessage(null); }}>
          <strong>{"name" in record ? record.name : record.title}</strong><span>{"visible" in record ? record.visible ? "Visible" : "Hidden" : record.published ? "Published / scheduled" : "Draft"}{"sortOrder" in record ? ` · Order ${record.sortOrder}` : ""}</span>
        </button>)}
        {!content[kind].length && <p>No {label.toLowerCase()} yet.</p>}
      </aside>
      <form onSubmit={(event) => void save(event)}>
        <fieldset disabled={busy} className="storefront-editor-fields">
          <legend>{id === null ? "Create" : "Edit"} {kind === "categories" ? "category" : kind === "news" ? "news post" : "announcement"}</legend>
          {field(kind === "categories" ? "name" : "title", kind === "categories" ? "Category name" : "Title", kind === "categories" ? 80 : kind === "news" ? 160 : 120)}
          {kind !== "announcements" && field("slug", "URL slug (lowercase-words)", 100)}
          {kind !== "categories" && field("summary", "Short summary", kind === "news" ? 320 : 240, true)}
          {kind === "news" && <>{field("body", "Article body (plain text; blank lines separate paragraphs)", 20000, true)}{dateField("publishAt", "Publish on", true)}</>}
          {kind !== "news" && <label className="site-manager-field"><span>Display order</span><input type="number" min={0} max={100000} step={1} required value={text("sortOrder")} onChange={(event) => update("sortOrder", Number(event.target.value))} /></label>}
          <label className="storefront-editor-checkbox"><input type="checkbox" checked={Boolean(draft[kind === "categories" ? "visible" : "published"])} onChange={(event) => update(kind === "categories" ? "visible" : "published", event.target.checked)} />{kind === "categories" ? "Visible to customers" : "Publish (schedule applies)"}</label>
          {kind !== "categories" && <label className="site-manager-field is-wide"><span>Optional image — existing public product or branding image</span><select value={text("imageUrl")} onChange={(event) => update("imageUrl", event.target.value || null)}>
            <option value="">No image</option>{text("imageUrl") && !products.some((product) => product.imageUrl === draft.imageUrl) && <option value={text("imageUrl")}>Current image</option>}
            {products.filter((product) => product.publicVisible && product.imageUrl).map((product) => <option key={product.id} value={product.imageUrl!}>{product.internalName}</option>)}
          </select><small>Upload product images through Product Listings. Editorial never loads third-party image URLs.</small></label>}
          {kind === "announcements" && <>
            <label className="site-manager-field"><span>Type</span><select value={text("type")} onChange={(event) => update("type", event.target.value)}>{ANNOUNCEMENT_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
            <label className="site-manager-field"><span>Destination</span><select value={text("destination")} onChange={(event) => { update("destination", event.target.value); update("destinationSlug", null); }}>{CONTENT_DESTINATIONS.map((destination) => <option key={destination}>{destination}</option>)}</select></label>
            {(draft.destination === "CATEGORY" || draft.destination === "NEWS") && <label className="site-manager-field"><span>Linked {draft.destination === "CATEGORY" ? "category" : "news post"}</span><select required value={text("destinationSlug")} onChange={(event) => update("destinationSlug", event.target.value || null)}><option value="">Choose destination</option>{(draft.destination === "CATEGORY" ? content.categories : content.news).map((item) => <option key={item.id} value={item.slug}>{"name" in item ? item.name : item.title}</option>)}</select></label>}
            {dateField("startsAt", "Starts (optional)")}{dateField("endsAt", "Ends (optional)")}
          </>}
          {kind === "categories" && <div className="is-wide storefront-product-picker"><label className="site-manager-field"><span>Find products to assign</span><input type="search" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} /></label><p>{selectedIds.length} products assigned. Hidden products stay hidden publicly.</p><div>
            {products.filter((product) => product.internalName.toLocaleLowerCase().includes(productSearch.toLocaleLowerCase())).map((product) => <label key={product.id} className="storefront-editor-checkbox"><input type="checkbox" checked={selectedIds.includes(product.id)} onChange={(event) => update("productIds", event.target.checked ? [...selectedIds, product.id] : selectedIds.filter((value) => value !== product.id))} />{product.internalName}{!product.publicVisible && " (not public)"}</label>)}
          </div></div>}
        </fieldset>
        {kind !== "categories" && <div className="public-editorial-preview"><p>Customer preview · {text("published") === "true" ? "Published / scheduled" : "Draft"}</p>{kind === "announcements" ? <><AnnouncementCard preview onNavigate={() => undefined} item={{ ...draft as unknown as StorefrontAnnouncement, href: contentDestinationPath(draft.destination as StorefrontAnnouncement["destination"], draft.destinationSlug as string | null), date: draft.startsAt as string | null }} /><p>Destination: {contentDestinationPath(draft.destination as StorefrontAnnouncement["destination"], draft.destinationSlug as string | null)}</p></> : <NewsArticle post={draft as unknown as StorefrontNewsPost} />}</div>}
        <footer className="site-manager-actions"><button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</button>{id !== null && <button className="danger-button" type="button" disabled={busy} onClick={() => void remove()}>Delete</button>}</footer>
      </form>
    </div>}
  </section>;
}
