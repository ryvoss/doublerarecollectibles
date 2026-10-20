import { InventoryEmptyState } from "./InventoryEmptyState";
import { useEffect, useMemo, useState } from "react";
import { usePublicCatalog } from "./PublicCatalog";
import { CategoryNavigation } from "./StorefrontSections";
import { inventoryBrowseState, filterStorefrontInventory, type PublicCategory } from "../../shared/storefrontContent";
import type {
  PublicInventoryAvailability,
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
  categories, categoriesError, searchQuery, onNavigate,
  onContact,
  onProductOpen,
  settings,
}: {
  categories: PublicCategory[];
  categoriesError: boolean;
  searchQuery: string;
  onNavigate: (path: string) => void;
  onContact: ContactOpenHandler;
  onProductOpen: ProductDetailOpenHandler;
  settings: PublicSiteSettings;
}) {
  const { products, loading, error, retry } = usePublicCatalog();
  const route = useMemo(() => inventoryBrowseState(searchQuery), [searchQuery]);
  const [search, setSearch] = useState(route.search);
  const [availability, setAvailability] = useState<AvailabilityFilter>(route.availability as AvailabilityFilter);
  useEffect(() => { setSearch(route.search); setAvailability(route.availability as AvailabilityFilter); }, [route]);
  const filteredProducts = useMemo(() => filterStorefrontInventory(products,
    { ...route, search, availability }, categories), [products, route, search, availability, categories]);
  const hasFilters = search.trim() !== "" || availability !== "ALL" || !!route.category || !!route.view;

  function clearFilters() {
    setSearch("");
    setAvailability("ALL");
    onNavigate("/inventory");
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
        <CategoryNavigation categories={categories} active={route.category} onNavigate={onNavigate} />
        {categoriesError && <p role="status">Categories are temporarily unavailable. All inventory is still available below.</p>}
        <div className="public-browse-links"><button type="button" className={`public-filter-link${route.view ? " is-active" : ""}`} aria-pressed={!!route.view} onClick={() => onNavigate(route.view ? "/inventory" : "/inventory?view=recent-drops")}>Recent price drops</button>{route.category && !categories.some((category) => category.slug === route.category) && <span role="status">This category is unavailable. Choose All inventory.</span>}</div>
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
              {filteredProducts.length === 1 ? "product" : "products"}{route.view ? " ? Recent price drops" : ""}
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
              onClick={retry}
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && products.length === 0 && (
          <InventoryEmptyState />
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
