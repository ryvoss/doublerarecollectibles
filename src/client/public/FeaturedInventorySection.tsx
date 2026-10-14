import { useEffect, useState, type MouseEvent } from "react";
import {
  selectHomepageMerchandise,
  type PublicInventoryItem,
} from "../../shared/publicInventory";
import type { PublicSiteSettings } from "../../shared/publicSite";
import {
  openProductContact,
  type ContactOpenHandler,
} from "./ContactOptions";
import { PublicInventoryCard } from "./PublicInventoryCard";
import type { ProductDetailOpenHandler } from "./ProductDetailModal";

export default function FeaturedInventorySection({
  excludeComingSoon = false,
  onContact,
  onNavigate,
  onProductOpen,
  settings,
}: {
  excludeComingSoon?: boolean;
  onContact: ContactOpenHandler;
  onNavigate: (path: string) => void;
  onProductOpen: ProductDetailOpenHandler;
  settings: PublicSiteSettings;
}) {
  const [merchandisedProducts, setMerchandisedProducts] =
    useState<PublicInventoryItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadFeaturedInventory() {
      try {
        const response = await fetch("/api/public/inventory", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Featured inventory could not be loaded.");
        }

        const data: unknown = await response.json();

        if (!Array.isArray(data)) {
          throw new Error("Featured inventory returned an invalid response.");
        }

        setMerchandisedProducts(selectHomepageMerchandise(data as PublicInventoryItem[], {
          limit: settings.featuredMaxItems,
          prioritizeRecentDrops: settings.featuredPrioritizeRecentDrops,
          includeFeatured: settings.featuredIncludeFeatured,
          includeComingSoon: settings.featuredIncludeComingSoon && !excludeComingSoon,
          fallback: settings.featuredFallback,
        }));
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("Featured inventory loading error:", error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoaded(true);
        }
      }
    }

    void loadFeaturedInventory();
    return () => controller.abort();
  }, [excludeComingSoon, settings.featuredFallback, settings.featuredIncludeComingSoon, settings.featuredIncludeFeatured, settings.featuredMaxItems, settings.featuredPrioritizeRecentDrops]);

  if (!loaded || merchandisedProducts.length === 0) {
    return null;
  }

  function handleInventoryLink(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    onNavigate("/inventory");
  }

  return (
    <section className="public-section public-featured-inventory">
      <div className="public-container">
        <div className="public-section-heading">
          <div>
            <p className="public-kicker">Selected for collectors</p>
            <h2>{settings.featuredSectionTitle}</h2>
            <p>Recent price drops, featured picks, and products arriving soon at {settings.businessName}.</p>
          </div>
          <a
            className="public-text-link public-featured-inventory__all"
            href="/inventory"
            onClick={handleInventoryLink}
          >
            View all inventory <span aria-hidden="true">&rarr;</span>
          </a>
        </div>

        <div className="public-catalog-grid" aria-label={settings.featuredSectionTitle}>
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
        </div>
      </div>
    </section>
  );
}
