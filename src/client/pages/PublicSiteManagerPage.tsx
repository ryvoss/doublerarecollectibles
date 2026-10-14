import { adminFetch } from "../adminFetch";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import PublicListingManager from "../components/PublicListingManager";
import {
  CTA_TARGETS,
  EMPTY_PUBLIC_SITE_ASSETS,
  PUBLIC_SITE_DEFAULTS,
  type HomepageSectionKey,
  type MerchandisingFallback,
  type PublicSiteConfiguration,
  type PublicSiteSettings,
  type SiteAssetType,
  type StorefrontCtaTarget,
} from "../../shared/publicSite";
import "./PublicSiteManagerPage.css";

type ManagerTab = "HOME" | "PRODUCTS" | "SHOWS" | "CONTENT" | "BRANDING";

type StorefrontShow = {
  id: number;
  name: string;
  publicVisible: boolean;
  venue: string | null;
  location: string | null;
  boothInfo: string | null;
  publicNote: string | null;
  nextVisitDate: string | null;
  nextVisitStatus: "PLANNED" | "ACTIVE" | null;
};

const tabs: Array<{ id: ManagerTab; label: string }> = [
  { id: "HOME", label: "Homepage" },
  { id: "PRODUCTS", label: "Products" },
  { id: "SHOWS", label: "Shows" },
  { id: "CONTENT", label: "Content" },
  { id: "BRANDING", label: "Branding" },
];

const sectionLabels: Record<HomepageSectionKey, string> = {
  HERO: "Hero",
  MERCHANDISING: "Featured & Recent Drops",
  COMING_SOON: "Coming Soon",
  NEXT_SHOW: "Next Show",
  BUY_SELL_TRADE: "Buy / Sell / Trade",
  CONTACT: "Contact",
};

const targetLabels: Record<StorefrontCtaTarget, string> = {
  INVENTORY: "Inventory",
  BUY_SELL_TRADE: "Buy / Sell / Trade",
  CONTACT: "Contact",
  SHOWS: "Shows",
};

const initialConfiguration: PublicSiteConfiguration = {
  settings: { ...PUBLIC_SITE_DEFAULTS, homepageSections: PUBLIC_SITE_DEFAULTS.homepageSections.map((section) => ({ ...section })) },
  assets: { ...EMPTY_PUBLIC_SITE_ASSETS },
  nextShow: null,
};

export default function PublicSiteManagerPage() {
  const [configuration, setConfiguration] = useState(initialConfiguration);
  const [draft, setDraft] = useState<PublicSiteSettings>(initialConfiguration.settings);
  const [activeTab, setActiveTab] = useState<ManagerTab>("HOME");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [listingManagerOpen, setListingManagerOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function loadConfiguration() {
      try {
        setLoading(true);
        const response = await adminFetch("/api/site", { signal: controller.signal });
        const body = await response.json().catch(() => null) as PublicSiteConfiguration | { error?: string } | null;
        if (!response.ok || !body || !("settings" in body)) throw new Error(body && "error" in body ? body.error : "Storefront settings could not be loaded.");
        setConfiguration(body);
        setDraft(body.settings);
      } catch (loadError) {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "Storefront settings could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadConfiguration();
    return () => controller.abort();
  }, []);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(configuration.settings), [configuration.settings, draft]);

  function updateSetting<K extends keyof PublicSiteSettings>(field: K, value: PublicSiteSettings[K]) {
    setSuccess(null);
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function moveSection(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= draft.homepageSections.length) return;
    const sections = [...draft.homepageSections];
    [sections[index], sections[target]] = [sections[target], sections[index]];
    updateSetting("homepageSections", sections);
  }

  function setSectionVisibility(key: HomepageSectionKey, visible: boolean) {
    updateSetting("homepageSections", draft.homepageSections.map((section) => section.key === key ? { ...section, visible } : section));
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty) return;
    try {
      setSaving(true); setError(null); setSuccess(null);
      const response = await adminFetch("/api/site/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings: draft }),
      });
      const body = await response.json().catch(() => null) as PublicSiteConfiguration | { error?: string } | null;
      if (!response.ok || !body || !("settings" in body)) throw new Error(body && "error" in body ? body.error : "Storefront settings could not be saved.");
      setConfiguration(body); setDraft(body.settings); setSuccess("Storefront settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Storefront settings could not be saved.");
    } finally { setSaving(false); }
  }

  if (loading) return <div className="site-manager-state">Loading storefront settings...</div>;

  return (
    <div className="site-manager-page">
      <header className="page-heading site-manager-heading">
        <div><span className="eyebrow">CUSTOMER EXPERIENCE</span><h2>Storefront</h2><p>Manage homepage merchandising, public products, shows, content, and branding.</p></div>
        <a className="secondary-button site-manager-preview-link" href="/" target="_blank" rel="noreferrer">Preview Storefront</a>
      </header>

      <nav className="site-manager-tabs" aria-label="Storefront sections">
        {tabs.map((tab) => <button key={tab.id} type="button" className={activeTab === tab.id ? "is-active" : undefined} aria-pressed={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}
      </nav>

      {(error || success) && <div className={`site-manager-notice ${error ? "is-error" : "is-success"}`} role={error ? "alert" : "status"}>{error ?? success}</div>}

      <form onSubmit={(event) => void saveSettings(event)}>
        <section className="panel site-manager-panel">
          {activeTab === "HOME" && <HomepageManager draft={draft} assets={configuration.assets} moveSection={moveSection} setSectionVisibility={setSectionVisibility} updateSetting={updateSetting} />}
          {activeTab === "PRODUCTS" && <ManagerSection title="Products" description="The existing merchandising workflow remains the single source for customer-facing product settings.">
            <div className="storefront-launch-card">
              <div><span className="eyebrow">PRODUCT LISTINGS</span><h4>Manage public products</h4><p>Control visibility, featured status, public and compare-at pricing, descriptions, primary images, and recent price-drop presentation.</p></div>
              <div className="storefront-launch-card__actions"><button className="primary-button" type="button" onClick={() => setListingManagerOpen(true)}>Open Product Listings</button><a className="secondary-button" href="/inventory" target="_blank" rel="noreferrer">Preview Inventory</a></div>
            </div>
            <div className="storefront-mini-preview" aria-label="Customer product preview example"><div className="storefront-mini-preview__image">Image</div><div><span>Recent Price Drop</span><h4>Customer product name</h4><p>Short descriptions, availability, current price, and compare-at price appear on the customer card.</p><strong>$99.00 <del>$119.00</del></strong><button type="button" disabled>I&apos;m Interested</button></div></div>
          </ManagerSection>}
          {activeTab === "SHOWS" && <ShowsManager />}
          {activeTab === "CONTENT" && <ContentManager draft={draft} updateSetting={updateSetting} />}
          {activeTab === "BRANDING" && <BrandingManager configuration={configuration} draft={draft} setConfiguration={setConfiguration} updateSetting={updateSetting} />}
        </section>

        {activeTab !== "PRODUCTS" && activeTab !== "SHOWS" && <footer className="site-manager-actions">
          <span>{dirty ? "Unsaved changes" : "All changes saved"}</span>
          <button type="button" className="secondary-button" disabled={!dirty || saving} onClick={() => setDraft(configuration.settings)}>Discard</button>
          <button type="submit" className="primary-button" disabled={!dirty || saving}>{saving ? "Saving..." : "Save Storefront"}</button>
        </footer>}
      </form>
      {listingManagerOpen && <PublicListingManager onClose={() => setListingManagerOpen(false)} />}
    </div>
  );
}

function HomepageManager({ assets, draft, moveSection, setSectionVisibility, updateSetting }: {
  assets: PublicSiteConfiguration["assets"];
  draft: PublicSiteSettings;
  moveSection: (index: number, direction: -1 | 1) => void;
  setSectionVisibility: (key: HomepageSectionKey, visible: boolean) => void;
  updateSetting: <K extends keyof PublicSiteSettings>(field: K, value: PublicSiteSettings[K]) => void;
}) {
  return <ManagerSection title="Homepage" description="Choose which structured sections appear and set their order. The storefront layout remains responsive and branded.">
    <div className="homepage-section-list is-wide">
      {draft.homepageSections.map((section, index) => <div className="homepage-section-row" key={section.key}>
        <span className="homepage-section-order">{index + 1}</span><strong>{sectionLabels[section.key]}</strong>
        <ToggleField label={section.visible ? "Visible" : "Hidden"} checked={section.visible} onChange={(visible) => setSectionVisibility(section.key, visible)} />
        <div className="homepage-section-move"><button type="button" aria-label={`Move ${sectionLabels[section.key]} up`} disabled={index === 0} onClick={() => moveSection(index, -1)}>&uarr;</button><button type="button" aria-label={`Move ${sectionLabels[section.key]} down`} disabled={index === draft.homepageSections.length - 1} onClick={() => moveSection(index, 1)}>&darr;</button></div>
      </div>)}
    </div>

    <Subsection title="Hero" description="Customer-facing headline, artwork, and safe navigation destinations.">
      <TextField label="Hero Title" value={draft.heroTitle} maxLength={180} onChange={(value) => updateSetting("heroTitle", value)} />
      <TextField multiline label="Hero Subtitle" value={draft.heroSubtitle} maxLength={1000} onChange={(value) => updateSetting("heroSubtitle", value)} />
      <TextField label="Primary CTA Label" value={draft.primaryCtaLabel} maxLength={80} onChange={(value) => updateSetting("primaryCtaLabel", value)} />
      <TargetField label="Primary CTA Destination" value={draft.primaryCtaTarget} onChange={(value) => updateSetting("primaryCtaTarget", value)} />
      <ToggleField label="Show secondary CTA" checked={draft.secondaryCtaEnabled} onChange={(value) => updateSetting("secondaryCtaEnabled", value)} />
      {draft.secondaryCtaEnabled && <><TextField label="Secondary CTA Label" value={draft.secondaryCtaLabel} maxLength={80} onChange={(value) => updateSetting("secondaryCtaLabel", value)} /><TargetField label="Secondary CTA Destination" value={draft.secondaryCtaTarget} onChange={(value) => updateSetting("secondaryCtaTarget", value)} /></>}
      <div className="storefront-hero-preview is-wide"><div><span>{draft.tagline}</span><h4>{draft.heroTitle}</h4><p>{draft.heroSubtitle}</p><div><b>{draft.primaryCtaLabel}</b>{draft.secondaryCtaEnabled && <b>{draft.secondaryCtaLabel}</b>}</div></div><div className="storefront-hero-preview__image">{assets.heroImageUrl ? <img src={assets.heroImageUrl} alt="Hero preview" /> : "DR"}</div></div>
    </Subsection>

    <Subsection title="Featured & Recent Drops" description="Configure the existing safe merchandising selection without changing product prices or inventory.">
      <TextField label="Section Heading" value={draft.featuredSectionTitle} maxLength={160} onChange={(value) => updateSetting("featuredSectionTitle", value)} />
      <NumberField label="Maximum Items" value={draft.featuredMaxItems} min={1} max={12} onChange={(value) => updateSetting("featuredMaxItems", value)} />
      <ToggleField label="Prioritize recent price drops" checked={draft.featuredPrioritizeRecentDrops} onChange={(value) => updateSetting("featuredPrioritizeRecentDrops", value)} />
      <ToggleField label="Include manually featured products" checked={draft.featuredIncludeFeatured} onChange={(value) => updateSetting("featuredIncludeFeatured", value)} />
      <ToggleField label="Allow Coming Soon products" checked={draft.featuredIncludeComingSoon} onChange={(value) => updateSetting("featuredIncludeComingSoon", value)} />
      <label className="site-manager-field"><span>Fallback</span><select value={draft.featuredFallback} onChange={(event) => updateSetting("featuredFallback", event.target.value as MerchandisingFallback)}><option value="NONE">No fallback</option><option value="AVAILABLE">Other available products</option><option value="INCLUDING_SOLD_OUT">Include sold-out products</option></select></label>
    </Subsection>

    <Subsection title="Coming Soon & Next Show" description="Coming Soon is derived from real inbound inventory. The next show is selected from public Shows.">
      <TextField label="Coming Soon Heading" value={draft.comingSoonSectionTitle} maxLength={160} onChange={(value) => updateSetting("comingSoonSectionTitle", value)} />
      <NumberField label="Coming Soon Maximum Items" value={draft.comingSoonMaxItems} min={1} max={12} onChange={(value) => updateSetting("comingSoonMaxItems", value)} />
      <TextField label="Next Show Heading" value={draft.nextShowSectionTitle} maxLength={160} onChange={(value) => updateSetting("nextShowSectionTitle", value)} />
    </Subsection>

    <Subsection title="Announcement Banner" description="Optional concise banner with a controlled storefront destination.">
      <ToggleField label="Enable announcement" checked={draft.announcementEnabled} onChange={(value) => updateSetting("announcementEnabled", value)} />
      <TextField multiline label="Message" value={draft.announcementMessage} maxLength={240} required={false} onChange={(value) => updateSetting("announcementMessage", value)} />
      <TextField label="CTA Label (optional)" value={draft.announcementCtaLabel} maxLength={80} required={false} onChange={(value) => updateSetting("announcementCtaLabel", value)} />
      <TargetField label="CTA Destination" value={draft.announcementCtaTarget} onChange={(value) => updateSetting("announcementCtaTarget", value)} />
      <DateTimeField label="Starts (optional)" value={draft.announcementStartsAt} onChange={(value) => updateSetting("announcementStartsAt", value)} />
      <DateTimeField label="Ends (optional)" value={draft.announcementEndsAt} onChange={(value) => updateSetting("announcementEndsAt", value)} />
    </Subsection>
  </ManagerSection>;
}

function ContentManager({ draft, updateSetting }: { draft: PublicSiteSettings; updateSetting: <K extends keyof PublicSiteSettings>(field: K, value: PublicSiteSettings[K]) => void }) {
  return <ManagerSection title="Content" description="Plain-text customer messaging and the contact methods already used by the storefront.">
    <Subsection title="Buy / Sell / Trade" description="Homepage and detail-page copy. The existing inquiry flow is unchanged.">
      <TextField label="Heading" value={draft.buySellTradeTitle} maxLength={160} onChange={(value) => updateSetting("buySellTradeTitle", value)} />
      <TextField multiline label="Body Copy" value={draft.buySellTradeText} maxLength={1000} onChange={(value) => updateSetting("buySellTradeText", value)} />
      <TextField label="CTA Label" value={draft.buySellTradeCtaLabel} maxLength={80} onChange={(value) => updateSetting("buySellTradeCtaLabel", value)} />
    </Subsection>
    <Subsection title="Contact" description="Reuses the public contact form, email, and Instagram contact options.">
      <TextField label="Contact Heading" value={draft.contactPageTitle} maxLength={160} onChange={(value) => updateSetting("contactPageTitle", value)} />
      <TextField multiline label="Supporting Copy" value={draft.contactText} maxLength={1000} onChange={(value) => updateSetting("contactText", value)} />
      <TextField label="Instagram URL" inputType="url" value={draft.instagramUrl} maxLength={500} required={false} onChange={(value) => updateSetting("instagramUrl", value)} />
      <TextField label="Contact Email" inputType="email" value={draft.contactEmail} maxLength={254} required={false} onChange={(value) => updateSetting("contactEmail", value)} />
    </Subsection>
    <Subsection title="Inventory & Shows Pages" description="Introductory copy for the customer catalog and Shows page.">
      <TextField label="Inventory Page Title" value={draft.inventoryPageTitle} maxLength={160} onChange={(value) => updateSetting("inventoryPageTitle", value)} />
      <TextField multiline label="Inventory Intro" value={draft.inventoryIntroText} maxLength={1000} onChange={(value) => updateSetting("inventoryIntroText", value)} />
      <TextField label="Shows Page Title" value={draft.showsPageTitle} maxLength={160} onChange={(value) => updateSetting("showsPageTitle", value)} />
      <TextField multiline label="Shows Intro" value={draft.showsIntroText} maxLength={1000} onChange={(value) => updateSetting("showsIntroText", value)} />
    </Subsection>
  </ManagerSection>;
}

function BrandingManager({ configuration, draft, setConfiguration, updateSetting }: { configuration: PublicSiteConfiguration; draft: PublicSiteSettings; setConfiguration: (configuration: PublicSiteConfiguration) => void; updateSetting: <K extends keyof PublicSiteSettings>(field: K, value: PublicSiteSettings[K]) => void }) {
  return <ManagerSection title="Branding" description="Business identity and managed public assets. CSS and infrastructure settings remain application-controlled.">
    <TextField label="Business Name" value={draft.businessName} maxLength={120} onChange={(value) => updateSetting("businessName", value)} />
    <TextField label="Tagline" value={draft.tagline} maxLength={180} onChange={(value) => updateSetting("tagline", value)} />
    <div className="site-asset-grid">
      <SiteAssetEditor label="Primary Logo" description="Header and footer branding." assetType="PRIMARY_LOGO" imageUrl={configuration.assets.primaryLogoUrl} onConfiguration={setConfiguration} />
      <SiteAssetEditor label="Favicon" description="Browser tab icon. A square image works best." assetType="FAVICON" imageUrl={configuration.assets.faviconUrl} onConfiguration={setConfiguration} />
      <SiteAssetEditor label="Hero Image" description="Homepage hero artwork." assetType="HERO_IMAGE" imageUrl={configuration.assets.heroImageUrl} onConfiguration={setConfiguration} wide />
    </div>
  </ManagerSection>;
}

function ShowsManager() {
  const [shows, setShows] = useState<StorefrontShow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void adminFetch("/api/site/shows", { signal: controller.signal }).then(async (response) => {
      const body = await response.json().catch(() => null) as StorefrontShow[] | { error?: string } | null;
      if (!response.ok || !Array.isArray(body)) throw new Error(body && !Array.isArray(body) ? body.error : "Shows could not be loaded.");
      setShows(body);
    }).catch((error: unknown) => { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Shows could not be loaded."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  function updateShow(id: number, update: Partial<StorefrontShow>) { setShows((current) => current.map((show) => show.id === id ? { ...show, ...update } : show)); setMessage(null); }
  async function saveShow(show: StorefrontShow) {
    const response = await adminFetch(`/api/site/shows/${show.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicVisible: show.publicVisible, venue: show.venue, location: show.location, boothInfo: show.boothInfo, publicNote: show.publicNote }) });
    const body = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) throw new Error(body?.error ?? "Show could not be saved.");
    setMessage(`${show.name} storefront details saved.`);
  }

  return <ManagerSection title="Shows" description="Choose public shows and add only customer-safe venue details. The nearest upcoming public visit is selected automatically.">
    {message && <div className="site-manager-notice" role="status">{message}</div>}
    {loading ? <div className="site-manager-state is-wide">Loading shows...</div> : shows.length === 0 ? <div className="site-manager-state is-wide">No shows have been created.</div> : <div className="storefront-show-list is-wide">{shows.map((show) => <article className="storefront-show-card" key={show.id}>
      <header><div><h4>{show.name}</h4><p>{show.nextVisitDate ? `Next visit: ${new Date(show.nextVisitDate).toLocaleDateString()} (${show.nextVisitStatus?.toLowerCase()})` : "No upcoming visit"}</p></div><ToggleField label={show.publicVisible ? "Public" : "Hidden"} checked={show.publicVisible} onChange={(value) => updateShow(show.id, { publicVisible: value })} /></header>
      <div><TextField label="Venue" value={show.venue ?? ""} maxLength={160} required={false} onChange={(value) => updateShow(show.id, { venue: value || null })} /><TextField label="City / Location" value={show.location ?? ""} maxLength={160} required={false} onChange={(value) => updateShow(show.id, { location: value || null })} /><TextField label="Booth / Table Info" value={show.boothInfo ?? ""} maxLength={120} required={false} onChange={(value) => updateShow(show.id, { boothInfo: value || null })} /><TextField multiline label="Public Note" value={show.publicNote ?? ""} maxLength={500} required={false} onChange={(value) => updateShow(show.id, { publicNote: value || null })} /></div>
      <footer><button type="button" className="primary-button" onClick={() => void saveShow(show).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Show could not be saved."))}>Save Show</button></footer>
    </article>)}</div>}
  </ManagerSection>;
}

function ManagerSection({ children, description, title }: { children: ReactNode; description: string; title: string }) { return <div className="site-manager-section"><header><h3>{title}</h3><p>{description}</p></header><div className="site-manager-fields">{children}</div></div>; }
function Subsection({ children, description, title }: { children: ReactNode; description: string; title: string }) { return <section className="site-manager-subsection is-wide"><header><h4>{title}</h4><p>{description}</p></header><div>{children}</div></section>; }

function TextField({ inputType = "text", label, maxLength, multiline = false, onChange, required = true, value }: { inputType?: "text" | "email" | "url"; label: string; maxLength: number; multiline?: boolean; onChange: (value: string) => void; required?: boolean; value: string }) {
  return <label className={multiline ? "site-manager-field is-wide" : "site-manager-field"}><span>{label}</span>{multiline ? <textarea required={required} maxLength={maxLength} value={value} onChange={(event) => onChange(event.target.value)} rows={4} /> : <input required={required} type={inputType} maxLength={maxLength} value={value} onChange={(event) => onChange(event.target.value)} />}<small>{value.length}/{maxLength}</small></label>;
}

function NumberField({ label, max, min, onChange, value }: { label: string; max: number; min: number; onChange: (value: number) => void; value: number }) { return <label className="site-manager-field"><span>{label}</span><input type="number" min={min} max={max} step="1" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>; }
function ToggleField({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) { return <label className="site-manager-toggle"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span aria-hidden="true" /><b>{label}</b></label>; }
function TargetField({ label, onChange, value }: { label: string; onChange: (value: StorefrontCtaTarget) => void; value: StorefrontCtaTarget }) { return <label className="site-manager-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value as StorefrontCtaTarget)}>{CTA_TARGETS.map((target) => <option key={target} value={target}>{targetLabels[target]}</option>)}</select></label>; }
function DateTimeField({ label, onChange, value }: { label: string; onChange: (value: string | null) => void; value: string | null }) { const localValue = value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""; return <label className="site-manager-field"><span>{label}</span><input type="datetime-local" value={localValue} onChange={(event) => onChange(event.target.value ? new Date(event.target.value).toISOString() : null)} /></label>; }

function SiteAssetEditor({ assetType, description, imageUrl, label, onConfiguration, wide = false }: { assetType: SiteAssetType; description: string; imageUrl: string | null; label: string; onConfiguration: (configuration: PublicSiteConfiguration) => void; wide?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function handleFile(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) { setError("Use a JPEG, PNG, or WebP image up to 8 MB."); return; } try { setBusy(true); setError(null); const response = await adminFetch(`/api/site/assets/${assetType}`, { method: "PUT", headers: { "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name) }, body: file }); const body = await response.json().catch(() => null) as PublicSiteConfiguration | { error?: string } | null; if (!response.ok || !body || !("settings" in body)) throw new Error(body && "error" in body ? body.error : "Site asset could not be saved."); onConfiguration(body); } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "Site asset could not be saved."); } finally { setBusy(false); } }
  async function removeAsset() { if (!imageUrl || !window.confirm(`Remove the ${label.toLowerCase()}?`)) return; try { setBusy(true); setError(null); const response = await adminFetch(`/api/site/assets/${assetType}`, { method: "DELETE" }); const body = await response.json().catch(() => null) as PublicSiteConfiguration | { error?: string } | null; if (!response.ok || !body || !("settings" in body)) throw new Error(body && "error" in body ? body.error : "Site asset could not be removed."); onConfiguration(body); } catch (removeError) { setError(removeError instanceof Error ? removeError.message : "Site asset could not be removed."); } finally { setBusy(false); } }
  return <article className={`site-asset-card${wide ? " is-wide" : ""}`}><div className="site-asset-preview">{imageUrl ? <img src={imageUrl} alt={`${label} preview`} /> : <span>No asset</span>}</div><div><h4>{label}</h4><p>{description}</p></div><input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(event) => void handleFile(event)} /><div className="site-asset-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? "Working..." : imageUrl ? "Replace" : "Upload"}</button>{imageUrl && <button type="button" className="danger-button" disabled={busy} onClick={() => void removeAsset()}>Remove</button>}</div>{error && <small className="site-asset-error" role="alert">{error}</small>}</article>;
}
