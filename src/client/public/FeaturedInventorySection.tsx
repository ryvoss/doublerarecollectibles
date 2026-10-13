import { useEffect, useState, type MouseEvent } from "react";
import type { PublicInventoryItem } from "../../shared/publicInventory";
import type { PublicSiteSettings } from "../../shared/publicSite";
import {
  openProductContact,
  type ContactOpenHandler,
} from "./ContactOptions";
import { PublicInventoryCard } from "./PublicInventoryPage";

export default function FeaturedInventorySection({
  onContact,
  onNavigate,
  settings,
}: {
  onContact: ContactOpenHandler;
  onNavigate: (path: string) => void;
  settings: PublicSiteSettings;
}) {
  const [featuredProducts, setFeaturedProducts] =
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

        setFeaturedProducts(
          (data as PublicInventoryItem[]).filter(
            (product) => product.featured,
          ).slice(0, 3),
        );
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
  }, []);

  // Avoid presenting a placeholder as featured merchandise. This section only
  // exists after the safe public endpoint returns at least one featured item.
  if (!loaded || featuredProducts.length === 0) {
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
            <p>A closer look at products currently featured by {settings.businessName}.</p>
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
          {featuredProducts.map((product) => (
            <PublicInventoryCard
              key={product.id}
              headingLevel="h3"
              product={product}
              showFeaturedLabel={false}
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
