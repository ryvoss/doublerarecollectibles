import type { PublicInventoryItem } from "../../shared/publicInventory";
import { formatPublicProductPrice } from "./ProductDetailModal";

const availabilityLabels = {
  IN_STOCK: "In Stock",
  COMING_SOON: "Coming Soon!",
  LOW_STOCK: "Low Stock",
  SOLD_OUT: "Sold Out",
} as const;

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M4 10h11M11 5l5 5-5 5" />
    </svg>
  );
}

export function PublicInventoryCard({
  headingLevel = "h2",
  onOpen,
  product,
  onInterested,
  showFeaturedLabel = true,
}: {
  headingLevel?: "h2" | "h3";
  onOpen: (trigger: HTMLButtonElement) => void;
  product: PublicInventoryItem;
  onInterested: (trigger: HTMLButtonElement) => void;
  showFeaturedLabel?: boolean;
}) {
  const soldOut = product.availability === "SOLD_OUT";
  const comingSoon = product.availability === "COMING_SOON";
  const Heading = headingLevel;

  return (
    <article className={`public-catalog-card${soldOut ? " is-sold-out" : ""}${comingSoon ? " is-coming-soon" : ""}`}>
      <button
        className="public-catalog-card__open"
        type="button"
        aria-label={`View details for ${product.name}`}
        onClick={(event) => onOpen(event.currentTarget)}
      />
      <div className="public-catalog-card__image">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} loading="lazy" decoding="async" />
        ) : (
          <div className="public-product-fallback" aria-hidden="true">
            <span>DR</span>
          </div>
        )}
        {showFeaturedLabel && product.featured && (
          <span className="public-featured-label">Featured</span>
        )}
      </div>

      <div className="public-catalog-card__body">
        <div className="public-catalog-card__meta">
          <span className={`public-stock-badge public-stock-badge--${product.availability.toLowerCase()}`}>
            {availabilityLabels[product.availability]}
          </span>
          <span className="public-catalog-card__price">
            {formatPublicProductPrice(product.displayPrice)}
          </span>
        </div>
        {product.moreArrivingSoon && <span className="public-arrival-note">More arriving soon</span>}
        <Heading>{product.name}</Heading>
        {product.shortDescription && (
          <p className="public-catalog-card__description">
            {product.shortDescription}
          </p>
        )}
        <button
          className="public-catalog-card__action"
          type="button"
          onClick={(event) => onInterested(event.currentTarget)}
        >
          {comingSoon ? "Ask About Arrival" : "I’m Interested"}
          <ArrowIcon />
        </button>
      </div>
    </article>
  );
}
