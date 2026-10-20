import { usePublicCatalog } from "./PublicCatalog";
import { selectComingSoonProducts } from "../../shared/publicInventory";
import type { PublicSiteSettings } from "../../shared/publicSite";
import { openProductContact, type ContactOpenHandler } from "./ContactOptions";
import { PublicInventoryCard } from "./PublicInventoryCard";
import type { ProductDetailOpenHandler } from "./ProductDetailModal";

export default function ComingSoonSection({ onContact, onProductOpen, settings }: {
  onContact: ContactOpenHandler;
  onProductOpen: ProductDetailOpenHandler;
  settings: PublicSiteSettings;
}) {
  const { products: catalog, loading, error } = usePublicCatalog();
  const products = selectComingSoonProducts(catalog, settings.comingSoonMaxItems);
  if (loading || error || products.length === 0) return null;
  return <section className="public-section public-section--muted public-coming-soon">
    <div className="public-container">
      <div className="public-section-heading"><div><p className="public-kicker">On the way</p><h2>{settings.comingSoonSectionTitle}</h2><p>Inbound products that are expected to join the storefront soon.</p></div></div>
      <div className="public-catalog-grid" aria-label={settings.comingSoonSectionTitle}>
        {products.map((product) => <PublicInventoryCard key={product.id} headingLevel="h3" product={product} onOpen={(trigger) => onProductOpen(trigger, product)} onInterested={(trigger) => openProductContact(onContact, product, trigger)} />)}
      </div>
    </div>
  </section>;
}
