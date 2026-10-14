import { useEffect, useState } from "react";
import { selectComingSoonProducts, type PublicInventoryItem } from "../../shared/publicInventory";
import type { PublicSiteSettings } from "../../shared/publicSite";
import { openProductContact, type ContactOpenHandler } from "./ContactOptions";
import { PublicInventoryCard } from "./PublicInventoryCard";
import type { ProductDetailOpenHandler } from "./ProductDetailModal";

export default function ComingSoonSection({ onContact, onProductOpen, settings }: {
  onContact: ContactOpenHandler;
  onProductOpen: ProductDetailOpenHandler;
  settings: PublicSiteSettings;
}) {
  const [products, setProducts] = useState<PublicInventoryItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/public/inventory", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Coming Soon inventory could not be loaded.");
        const body: unknown = await response.json();
        if (!Array.isArray(body)) throw new Error("Coming Soon inventory returned an invalid response.");
        setProducts(selectComingSoonProducts(body as PublicInventoryItem[], settings.comingSoonMaxItems));
      })
      .catch((error: unknown) => { if (!controller.signal.aborted) console.error("Coming Soon inventory loading error:", error); })
      .finally(() => { if (!controller.signal.aborted) setLoaded(true); });
    return () => controller.abort();
  }, [settings.comingSoonMaxItems]);

  if (!loaded || products.length === 0) return null;
  return <section className="public-section public-section--muted public-coming-soon">
    <div className="public-container">
      <div className="public-section-heading"><div><p className="public-kicker">On the way</p><h2>{settings.comingSoonSectionTitle}</h2><p>Inbound products that are expected to join the storefront soon.</p></div></div>
      <div className="public-catalog-grid" aria-label={settings.comingSoonSectionTitle}>
        {products.map((product) => <PublicInventoryCard key={product.id} headingLevel="h3" product={product} onOpen={(trigger) => onProductOpen(trigger, product)} onInterested={(trigger) => openProductContact(onContact, product, trigger)} />)}
      </div>
    </div>
  </section>;
}
