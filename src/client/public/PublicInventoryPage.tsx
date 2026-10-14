import { useEffect, useMemo, useState } from "react";
import type {
  PublicInventoryAvailability,
  PublicInventoryItem,
} from "../../shared/publicInventory";
import type { PublicSiteSettings } from "../../shared/publicSite";
import {
  openProductContact,
  type ContactOpenHandler,
} from "./ContactOptions";
import {
  type ProductDetailOpenHandler,
} from "./ProductDetailModal";
import { PublicInventoryCard } from "./PublicInventoryCard";
import "./PublicInventoryPage.css";

type AvailabilityFilter = "ALL" | PublicInventoryAvailability;

const availabilityFilters: Array<{
  value: AvailabilityFilter;
  label: string;
}> = [
  { value: "ALL", label: "All" },
  { value: "IN_STOCK", label: "In Stock" },
  { value: "LOW_STOCK", label: "Low Stock" },
  { value: "COMING_SOON", label: "Coming Soon" },
  { value: "SOLD_OUT", label: "Sold Out" },
];

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

export default function PublicInventoryPage({
  onContact,
  onProductOpen,
  settings,
}: {
  onContact: ContactOpenHandler;
  onProductOpen: ProductDetailOpenHandler;
  settings: PublicSiteSettings;
}) {
  const [products, setProducts] = useState<PublicInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [availability, setAvailability] =
    useState<AvailabilityFilter>("ALL");

  useEffect(() => {
    const controller = new AbortController();

    async function loadInventory() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch("/api/public/inventory", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Inventory could not be loaded right now.");
        }

        const data: unknown = await response.json();

        if (!Array.isArray(data)) {
          throw new Error("Inventory could not be loaded right now.");
        }

        setProducts(data as PublicInventoryItem[]);
      } catch (loadError) {
        if (controller.signal.aborted) {
          return;
        }

        console.error("Public inventory loading error:", loadError);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Inventory could not be loaded right now.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadInventory();
    return () => controller.abort();
  }, [reloadKey]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();

    return products.filter((product) => {
      const matchesSearch =
        !normalizedSearch ||
        product.name.toLocaleLowerCase().includes(normalizedSearch);
      const matchesAvailability =
        availability === "ALL" || product.availability === availability;

      return matchesSearch && matchesAvailability;
    });
  }, [availability, products, search]);

  const hasFilters = search.trim() !== "" || availability !== "ALL";

  function clearFilters() {
    setSearch("");
    setAvailability("ALL");
  }

  return (
    <section className="public-inventory-page">
      <div className="public-inventory-hero">
        <div className="public-container">
          <p className="public-kicker">The collection</p>
          <h1>{settings.inventoryPageTitle}</h1>
          <p>{settings.inventoryIntroText}</p>
        </div>
      </div>

      <div className="public-container public-inventory-content">
        <div className="public-catalog-controls">
          <label className="public-catalog-search">
            <SearchIcon />
            <span className="public-visually-hidden">Search inventory</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products"
            />
            {search && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch("")}
              >
                Clear
              </button>
            )}
          </label>

          <div
            className="public-availability-filters"
            aria-label="Filter by availability"
          >
            {availabilityFilters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                className={availability === filter.value ? "is-active" : undefined}
                aria-pressed={availability === filter.value}
                onClick={() => setAvailability(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {!loading && !error && products.length > 0 && (
          <div className="public-catalog-summary" aria-live="polite">
            <p>
              <strong>{filteredProducts.length}</strong>{" "}
              {filteredProducts.length === 1 ? "product" : "products"}
            </p>
            {hasFilters && (
              <button type="button" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        )}

        {loading && <InventorySkeleton />}

        {!loading && error && (
          <div className="public-catalog-message public-catalog-message--error">
            <span>Unable to load inventory</span>
            <h2>We could not reach the catalog.</h2>
            <p>{error}</p>
            <button
              className="public-button public-button--secondary"
              type="button"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && products.length === 0 && (
          <div className="public-catalog-message">
            <span>Inventory update in progress</span>
            <h2>New products are on the way.</h2>
            <p>
              Check back soon or contact us to ask about what is currently
              available.
            </p>
          </div>
        )}

        {!loading && !error && products.length > 0 && filteredProducts.length === 0 && (
          <div className="public-catalog-message">
            <span>No matches</span>
            <h2>Try a different search.</h2>
            <p>Clear your filters to see the full public collection.</p>
            <button
              className="public-button public-button--secondary"
              type="button"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          </div>
        )}

        {!loading && !error && filteredProducts.length > 0 && (
          <div className="public-catalog-grid">
            {filteredProducts.map((product) => (
              <PublicInventoryCard
                key={product.id}
                product={product}
                onOpen={(trigger) => onProductOpen(trigger, product)}
                onInterested={(trigger) =>
                  openProductContact(onContact, product, trigger)
                }
              />
            ))}
          </div>
        )}
      </div>

    </section>
  );
}

function InventorySkeleton() {
  return (
    <div className="public-catalog-grid" aria-label="Loading inventory" aria-busy="true">
      {[1, 2, 3, 4, 5, 6].map((item) => (
        <div className="public-catalog-skeleton" key={item}>
          <div />
          <span />
          <strong />
          <span />
        </div>
      ))}
    </div>
  );
}
