import { PublicLink } from "./PublicLink";
import { usePublicCatalog } from "./PublicCatalog";
import { CategoryNavigation } from "./StorefrontSections";
import type { PublicCategory } from "../../shared/storefrontContent";
import {
  selectHomepageMerchandise,
} from "../../shared/publicInventory";
import type { PublicSiteSettings } from "../../shared/publicSite";
import {
  openProductContact,
  type ContactOpenHandler,
} from "./ContactOptions";
import { PublicInventoryCard } from "./PublicInventoryCard";
import type { ProductDetailOpenHandler } from "./ProductDetailModal";

export default function FeaturedInventorySection({
  categories,
  excludeComingSoon = false,
  onContact,
  onNavigate,
  onProductOpen,
  settings,
}: {
  categories: PublicCategory[];
  excludeComingSoon?: boolean;
  onContact: ContactOpenHandler;
  onNavigate: (path: string) => void;
  onProductOpen: ProductDetailOpenHandler;
  settings: PublicSiteSettings;
}) {
  const { products, loading, error, retry } = usePublicCatalog();
  const merchandisedProducts = selectHomepageMerchandise(products, {
    limit: settings.featuredMaxItems,
    prioritizeRecentDrops: settings.featuredPrioritizeRecentDrops,
    includeFeatured: settings.featuredIncludeFeatured,
    includeComingSoon: settings.featuredIncludeComingSoon && !excludeComingSoon,
    fallback: settings.featuredFallback,
  });

  return (
    <section className="public-section public-featured-inventory">
      <div className="public-container">
        <div className="public-section-heading">
          <div>
            <p className="public-kicker">Selected for collectors</p>
            <h2>{settings.featuredSectionTitle}</h2>
            <p>A closer look at what’s on our table. Browse, compare, and ask us anything.</p>
          </div>
          <PublicLink
            className="public-text-link public-featured-inventory__all"
            href="/inventory"
            onNavigate={onNavigate}
          >
            View all inventory <span aria-hidden="true">&rarr;</span>
          </PublicLink>
        </div>

        <CategoryNavigation categories={categories} onNavigate={onNavigate} currentPage={false} />
        <div className="public-browse-links"><PublicLink className="public-text-link" href="/inventory?view=recent-drops" onNavigate={onNavigate}>Recent price drops &rarr;</PublicLink><PublicLink className="public-text-link" href="/inventory?availability=COMING_SOON" onNavigate={onNavigate}>Coming soon &rarr;</PublicLink></div>
        {loading && <p role="status">Loading the collection…</p>}
        {!loading && error && <div className="public-catalog-message" role="alert"><h3>Inventory is temporarily unavailable.</h3><p>Try again to check the current collection.</p><button type="button" className="public-button public-button--secondary" onClick={retry}>Try again</button></div>}
        {!loading && !error && merchandisedProducts.length === 0 && <p>No featured products are listed right now. View all inventory for the full selection.</p>}
        {!loading && !error && <div className="public-catalog-grid" aria-label={settings.featuredSectionTitle}>
          {merchandisedProducts.map((product) => (
            <PublicInventoryCard
              key={product.id}
              headingLevel="h3"
              product={product}
              onOpen={(trigger) => onProductOpen(trigger, product)}
              onInterested={(trigger) =>
                openProductContact(onContact, product, trigger)
              }
            />
          ))}
        </div>}
      </div>
    </section>
  );
}
