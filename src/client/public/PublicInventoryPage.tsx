import { useEffect, useMemo, useState } from "react";
import type {
  PublicInventoryAvailability,
  PublicInventoryItem,
} from "../../shared/publicInventory";
import type { PublicSiteSettings } from "../../shared/publicSite";
import "./PublicInventoryPage.css";

type AvailabilityFilter = "ALL" | PublicInventoryAvailability;

const availabilityLabels: Record<PublicInventoryAvailability, string> = {
  IN_STOCK: "In Stock",
  LOW_STOCK: "Low Stock",
  SOLD_OUT: "Sold Out",
};

const availabilityFilters: Array<{
  value: AvailabilityFilter;
  label: string;
}> = [
  { value: "ALL", label: "All" },
  { value: "IN_STOCK", label: "In Stock" },
  { value: "LOW_STOCK", label: "Low Stock" },
  { value: "SOLD_OUT", label: "Sold Out" },
];

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function displayPrice(price: number | null) {
  return price === null ? "Contact for price" : currencyFormatter.format(price);
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.25" />
      <circle className="public-instagram-dot" cx="17.4" cy="6.7" r="1" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M4 10h11M11 5l5 5-5 5" />
    </svg>
  );
}

export default function PublicInventoryPage({ settings }: { settings: PublicSiteSettings }) {
  const [products, setProducts] = useState<PublicInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [availability, setAvailability] =
    useState<AvailabilityFilter>("ALL");
  const [selectedProduct, setSelectedProduct] =
    useState<PublicInventoryItem | null>(null);

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
                onInterested={() => setSelectedProduct(product)}
              />
            ))}
          </div>
        )}
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

export function PublicInventoryCard({
  product,
  onInterested,
}: {
  product: PublicInventoryItem;
  onInterested: () => void;
}) {
  const soldOut = product.availability === "SOLD_OUT";

  return (
    <article className={`public-catalog-card${soldOut ? " is-sold-out" : ""}`}>
      <div className="public-catalog-card__image">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} loading="lazy" decoding="async" />
        ) : (
          <div className="public-product-fallback" aria-hidden="true">
            <span>DR</span>
          </div>
        )}
        {product.featured && (
          <span className="public-featured-label">Featured</span>
        )}
      </div>

      <div className="public-catalog-card__body">
        <div className="public-catalog-card__meta">
          <span className={`public-stock-badge public-stock-badge--${product.availability.toLowerCase()}`}>
            {availabilityLabels[product.availability]}
          </span>
          <span className="public-catalog-card__price">
            {displayPrice(product.displayPrice)}
          </span>
        </div>
        <h2>{product.name}</h2>
        {product.shortDescription && (
          <p className="public-catalog-card__description">
            {product.shortDescription}
          </p>
        )}
        <button
          className="public-catalog-card__action"
          type="button"
          onClick={onInterested}
        >
          I&apos;m Interested
          <ArrowIcon />
        </button>
      </div>
    </article>
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

export function PublicInventoryInterestModal({
  businessName,
  contactEmail,
  instagramUrl,
  product,
  onClose,
}: {
  businessName: string;
  contactEmail: string;
  instagramUrl: string;
  product: PublicInventoryItem;
  onClose: () => void;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const availability = availabilityLabels[product.availability];
  const price = displayPrice(product.displayPrice);
  const emailSubject = `Interested in ${product.name} - ${businessName}`;
  const emailBody = [
    `Hi ${businessName},`,
    "",
    `I'm interested in ${product.name}.`,
    `Listed price: ${price}`,
    `Availability: ${availability}`,
    "",
    "Please let me know the next steps.",
  ].join("\n");
  const emailHref = `mailto:${contactEmail}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;

  return (
    <div
      className="public-interest-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="public-interest-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="public-interest-title"
      >
        <div className="public-interest-modal__header">
          <div>
            <p className="public-kicker">Product inquiry</p>
            <h2 id="public-interest-title">I&apos;m interested</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close inquiry" autoFocus>
            &times;
          </button>
        </div>

        <div className="public-interest-product">
          <div className="public-interest-product__image">
            {product.imageUrl ? (
              <img src={product.imageUrl} alt={product.name} />
            ) : (
              <span aria-hidden="true">DR</span>
            )}
          </div>
          <div>
            <span className={`public-stock-badge public-stock-badge--${product.availability.toLowerCase()}`}>
              {availability}
            </span>
            <h3>{product.name}</h3>
            {product.shortDescription && (
              <p className="public-interest-product__description">
                {product.shortDescription}
              </p>
            )}
            <strong>{price}</strong>
          </div>
        </div>

        <div className="public-interest-modal__copy">
          <h3>How would you like to connect?</h3>
          <p>
            Choose the option that works best for you. We will confirm current
            availability when we respond.
          </p>
        </div>

        <div className="public-interest-options">
          <a href={instagramUrl} target="_blank" rel="noreferrer">
            <InstagramIcon />
            <span>
              <strong>Instagram</strong>
              <small>Message {businessName}</small>
            </span>
            <ArrowIcon />
          </a>
          {contactEmail && <a href={emailHref}>
            <EmailIcon />
            <span>
              <strong>Email</strong>
              <small>Open a prefilled inquiry</small>
            </span>
            <ArrowIcon />
          </a>}
        </div>

        <button
          className="public-interest-modal__close"
          type="button"
          onClick={onClose}
        >
          Keep browsing
        </button>
      </div>
    </div>
  );
}
