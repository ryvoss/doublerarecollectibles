import { useEffect, useState } from "react";
import type { PublicInventoryItem } from "../../shared/publicInventory";
import type { PublicSiteSettings } from "../../shared/publicSite";
import {
  PublicInventoryCard,
  PublicInventoryInterestModal,
} from "./PublicInventoryPage";

export default function FeaturedInventorySection({
  onNavigate,
  settings,
}: {
  onNavigate: (path: string) => void;
  settings: PublicSiteSettings;
}) {
  const [featuredProducts, setFeaturedProducts] =
    useState<PublicInventoryItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedProduct, setSelectedProduct] =
    useState<PublicInventoryItem | null>(null);

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
          ),
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

  return (
    <section className="public-section public-featured-inventory">
      <div className="public-container">
        <div className="public-section-heading">
          <div>
            <p className="public-kicker">Selected for collectors</p>
            <h2>{settings.featuredSectionTitle}</h2>
            <p>A closer look at products currently featured by {settings.businessName}.</p>
          </div>
          <button
            className="public-text-link public-featured-inventory__all"
            type="button"
            onClick={() => onNavigate("/inventory")}
          >
            Explore all inventory <span aria-hidden="true">&rarr;</span>
          </button>
        </div>

        <div className="public-catalog-grid" aria-label={settings.featuredSectionTitle}>
          {featuredProducts.map((product) => (
            <PublicInventoryCard
              key={product.id}
              product={product}
              onInterested={() => setSelectedProduct(product)}
            />
          ))}
        </div>
      </div>

      {selectedProduct && (
        <PublicInventoryInterestModal
          product={selectedProduct}
          businessName={settings.businessName}
          contactEmail={settings.contactEmail}
          instagramUrl={settings.instagramUrl}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </section>
  );
}
