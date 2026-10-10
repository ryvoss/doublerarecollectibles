import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import {
  EMPTY_PUBLIC_SITE_ASSETS,
  PUBLIC_SITE_DEFAULTS,
  type PublicSiteConfiguration,
  type PublicSiteSettings,
  type SiteAssetType,
} from "../../shared/publicSite";
import "./PublicSiteManagerPage.css";

type ManagerTab = "BRANDING" | "HOME" | "INVENTORY" | "SHOWS" | "CONTACT" | "MEDIA";

const tabs: Array<{ id: ManagerTab; label: string }> = [
  { id: "BRANDING", label: "Branding" },
  { id: "HOME", label: "Home Page" },
  { id: "INVENTORY", label: "Inventory" },
  { id: "SHOWS", label: "Shows" },
  { id: "CONTACT", label: "Contact & Social" },
  { id: "MEDIA", label: "Media / Site Assets" },
];

const initialConfiguration: PublicSiteConfiguration = {
  settings: { ...PUBLIC_SITE_DEFAULTS },
  assets: { ...EMPTY_PUBLIC_SITE_ASSETS },
};

export default function PublicSiteManagerPage() {
  const [configuration, setConfiguration] = useState(initialConfiguration);
  const [draft, setDraft] = useState<PublicSiteSettings>({ ...PUBLIC_SITE_DEFAULTS });
  const [activeTab, setActiveTab] = useState<ManagerTab>("BRANDING");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadConfiguration() {
      try {
        setLoading(true);
        const response = await fetch("/api/site", { signal: controller.signal });
        const body = await response.json().catch(() => null) as PublicSiteConfiguration | { error?: string } | null;
        if (!response.ok || !body || !("settings" in body)) {
          throw new Error(body && "error" in body ? body.error : "Public site settings could not be loaded.");
        }
        setConfiguration(body);
        setDraft(body.settings);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Public site settings could not be loaded.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadConfiguration();
    return () => controller.abort();
  }, []);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(configuration.settings),
    [configuration.settings, draft],
  );

  function updateSetting<K extends keyof PublicSiteSettings>(field: K, value: PublicSiteSettings[K]) {
    setSuccess(null);
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty) return;
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      const response = await fetch("/api/site/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: draft }),
      });
      const body = await response.json().catch(() => null) as PublicSiteConfiguration | { error?: string } | null;
      if (!response.ok || !body || !("settings" in body)) {
        throw new Error(body && "error" in body ? body.error : "Public site settings could not be saved.");
      }
      setConfiguration(body);
      setDraft(body.settings);
      setSuccess("Public site settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Public site settings could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="site-manager-state">Loading public site settings...</div>;

  return (
    <div className="site-manager-page">
      <header className="page-heading site-manager-heading">
        <div>
          <span className="eyebrow">CUSTOMER EXPERIENCE</span>
          <h2>Public Site Manager</h2>
          <p>Maintain storefront copy, contact details, branding, and site media.</p>
        </div>
        <a className="secondary-button site-manager-preview-link" href="/" target="_blank" rel="noreferrer">Preview Main Site</a>
      </header>

      <nav className="site-manager-tabs" aria-label="Public site sections">
        {tabs.map((tab) => (
          <button key={tab.id} type="button" className={activeTab === tab.id ? "is-active" : undefined} aria-pressed={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </nav>

      {(error || success) && <div className={`site-manager-notice ${error ? "is-error" : "is-success"}`} role={error ? "alert" : "status"}>{error ?? success}</div>}

      <form onSubmit={(event) => void saveSettings(event)}>
        <section className="panel site-manager-panel">
          {activeTab === "BRANDING" && <ManagerSection title="Branding" description="Names and language used throughout the public shell.">
            <TextField label="Business Name" value={draft.businessName} maxLength={120} onChange={(value) => updateSetting("businessName", value)} />
            <TextField label="Tagline" value={draft.tagline} maxLength={180} onChange={(value) => updateSetting("tagline", value)} />
          </ManagerSection>}

          {activeTab === "HOME" && <ManagerSection title="Home Page" description="Core homepage messaging and calls to action.">
            <TextField label="Hero Title" value={draft.heroTitle} maxLength={180} onChange={(value) => updateSetting("heroTitle", value)} />
            <TextField multiline label="Hero Subtitle" value={draft.heroSubtitle} maxLength={1000} onChange={(value) => updateSetting("heroSubtitle", value)} />
            <TextField label="Primary CTA Label" value={draft.primaryCtaLabel} maxLength={80} onChange={(value) => updateSetting("primaryCtaLabel", value)} />
            <TextField label="Secondary CTA Label" value={draft.secondaryCtaLabel} maxLength={80} onChange={(value) => updateSetting("secondaryCtaLabel", value)} />
            <TextField label="Featured Section Title" value={draft.featuredSectionTitle} maxLength={160} onChange={(value) => updateSetting("featuredSectionTitle", value)} />
            <TextField label="Buy / Sell / Trade Title" value={draft.buySellTradeTitle} maxLength={160} onChange={(value) => updateSetting("buySellTradeTitle", value)} />
            <TextField multiline label="Buy / Sell / Trade Text" value={draft.buySellTradeText} maxLength={1000} onChange={(value) => updateSetting("buySellTradeText", value)} />
          </ManagerSection>}

          {activeTab === "INVENTORY" && <ManagerSection title="Inventory" description="Introductory copy above the customer catalog.">
            <TextField label="Inventory Page Title" value={draft.inventoryPageTitle} maxLength={160} onChange={(value) => updateSetting("inventoryPageTitle", value)} />
            <TextField multiline label="Inventory Intro Text" value={draft.inventoryIntroText} maxLength={1000} onChange={(value) => updateSetting("inventoryIntroText", value)} />
          </ManagerSection>}

          {activeTab === "SHOWS" && <ManagerSection title="Shows" description="Customer-facing introduction for the Shows page.">
            <TextField label="Shows Page Title" value={draft.showsPageTitle} maxLength={160} onChange={(value) => updateSetting("showsPageTitle", value)} />
            <TextField multiline label="Shows Intro Text" value={draft.showsIntroText} maxLength={1000} onChange={(value) => updateSetting("showsIntroText", value)} />
          </ManagerSection>}

          {activeTab === "CONTACT" && <ManagerSection title="Contact & Social" description="Public contact copy and destinations.">
            <TextField label="Contact Page Title" value={draft.contactPageTitle} maxLength={160} onChange={(value) => updateSetting("contactPageTitle", value)} />
            <TextField multiline label="Contact Text" value={draft.contactText} maxLength={1000} onChange={(value) => updateSetting("contactText", value)} />
            <TextField label="Instagram URL" inputType="url" value={draft.instagramUrl} maxLength={500} onChange={(value) => updateSetting("instagramUrl", value)} />
            <TextField label="Contact Email" inputType="email" value={draft.contactEmail} maxLength={254} required={false} onChange={(value) => updateSetting("contactEmail", value)} />
          </ManagerSection>}

          {activeTab === "MEDIA" && <ManagerSection title="Media / Site Assets" description="Managed images used by the public layout.">
            <div className="site-asset-grid">
              <SiteAssetEditor label="Primary Logo" description="Header and footer branding." assetType="PRIMARY_LOGO" imageUrl={configuration.assets.primaryLogoUrl} onConfiguration={setConfiguration} />
              <SiteAssetEditor label="Favicon" description="Browser tab icon. A square image works best." assetType="FAVICON" imageUrl={configuration.assets.faviconUrl} onConfiguration={setConfiguration} />
              <SiteAssetEditor label="Hero Image" description="Optional homepage hero artwork." assetType="HERO_IMAGE" imageUrl={configuration.assets.heroImageUrl} onConfiguration={setConfiguration} wide />
            </div>
          </ManagerSection>}
        </section>

        {activeTab !== "MEDIA" && <footer className="site-manager-actions">
          <span>{dirty ? "Unsaved changes" : "All changes saved"}</span>
          <button type="button" className="secondary-button" disabled={!dirty || saving} onClick={() => setDraft(configuration.settings)}>Discard</button>
          <button type="submit" className="primary-button" disabled={!dirty || saving}>{saving ? "Saving..." : "Save Public Site"}</button>
        </footer>}
      </form>
    </div>
  );
}

function ManagerSection({ children, description, title }: { children: ReactNode; description: string; title: string }) {
  return <div className="site-manager-section"><header><h3>{title}</h3><p>{description}</p></header><div className="site-manager-fields">{children}</div></div>;
}

function TextField({ inputType = "text", label, maxLength, multiline = false, onChange, required = true, value }: {
  inputType?: "text" | "email" | "url"; label: string; maxLength: number; multiline?: boolean; onChange: (value: string) => void; required?: boolean; value: string;
}) {
  return <label className={multiline ? "site-manager-field is-wide" : "site-manager-field"}>
    <span>{label}</span>
    {multiline ? <textarea required={required} maxLength={maxLength} value={value} onChange={(event) => onChange(event.target.value)} rows={4} /> : <input required={required} type={inputType} maxLength={maxLength} value={value} onChange={(event) => onChange(event.target.value)} />}
    <small>{value.length}/{maxLength}</small>
  </label>;
}

function SiteAssetEditor({ assetType, description, imageUrl, label, onConfiguration, wide = false }: {
  assetType: SiteAssetType; description: string; imageUrl: string | null; label: string; onConfiguration: (configuration: PublicSiteConfiguration) => void; wide?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
      setError("Use a JPEG, PNG, or WebP image up to 8 MB.");
      return;
    }
    try {
      setBusy(true); setError(null);
      const response = await fetch(`/api/site/assets/${assetType}`, { method: "PUT", headers: { "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name) }, body: file });
      const body = await response.json().catch(() => null) as PublicSiteConfiguration | { error?: string } | null;
      if (!response.ok || !body || !("settings" in body)) throw new Error(body && "error" in body ? body.error : "Site asset could not be saved.");
      onConfiguration(body);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Site asset could not be saved.");
    } finally { setBusy(false); }
  }

  async function removeAsset() {
    if (!imageUrl || !window.confirm(`Remove the ${label.toLowerCase()}?`)) return;
    try {
      setBusy(true); setError(null);
      const response = await fetch(`/api/site/assets/${assetType}`, { method: "DELETE" });
      const body = await response.json().catch(() => null) as PublicSiteConfiguration | { error?: string } | null;
      if (!response.ok || !body || !("settings" in body)) throw new Error(body && "error" in body ? body.error : "Site asset could not be removed.");
      onConfiguration(body);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Site asset could not be removed.");
    } finally { setBusy(false); }
  }

  return <article className={`site-asset-card${wide ? " is-wide" : ""}`}>
    <div className="site-asset-preview">{imageUrl ? <img src={imageUrl} alt={`${label} preview`} /> : <span>No asset</span>}</div>
    <div><h4>{label}</h4><p>{description}</p></div>
    <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(event) => void handleFile(event)} />
    <div className="site-asset-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? "Working..." : imageUrl ? "Replace" : "Upload"}</button>{imageUrl && <button type="button" className="danger-button" disabled={busy} onClick={() => void removeAsset()}>Remove</button>}</div>
    {error && <small className="site-asset-error" role="alert">{error}</small>}
  </article>;
}
