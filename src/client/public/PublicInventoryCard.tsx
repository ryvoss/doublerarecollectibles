import {
  primaryMerchandisingBadge,
  type PublicInventoryItem,
  type PublicMerchandisingBadge,
} from "../../shared/publicInventory";
import { formatPublicProductPrice } from "./ProductDetailModal";

const availabilityLabels = {
  IN_STOCK: "In Stock",
  COMING_SOON: "Coming Soon!",
  LOW_STOCK: "Low Stock",
  SOLD_OUT: "Sold Out",
} as const;

const badgeLabels: Record<PublicMerchandisingBadge, string> = {
  RECENT_PRICE_DROP: "Recent Price Drop",
  COMING_SOON: "Coming Soon",
  LOW_STOCK: "Low Stock",
  SOLD_OUT: "Sold Out",
  FEATURED: "Featured",
};

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
}: {
  headingLevel?: "h2" | "h3";
  onOpen: (trigger: HTMLButtonElement) => void;
  product: PublicInventoryItem;
  onInterested: (trigger: HTMLButtonElement) => void;
}) {
  const soldOut = product.availability === "SOLD_OUT";
  const comingSoon = product.availability === "COMING_SOON";
  const Heading = headingLevel;
  const primaryBadge = primaryMerchandisingBadge(product);

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
      </div>

      <div className="public-catalog-card__body">
        <div className="public-catalog-card__meta">
          <span className="public-catalog-card__status">
            {primaryBadge && (
              <span className={`public-stock-badge public-stock-badge--${primaryBadge.toLowerCase()}`}>
                {badgeLabels[primaryBadge]}
              </span>
            )}
            {primaryBadge !== product.availability && (
              <span className="public-availability-text">{availabilityLabels[product.availability]}</span>
            )}
          </span>
          <span className="public-catalog-card__prices">
            <strong>{formatPublicProductPrice(product.displayPrice)}</strong>
            {product.recentPriceDrop && product.compareAtPrice !== null && (
              <del aria-label={`Previously ${formatPublicProductPrice(product.compareAtPrice)}`}>
                was {formatPublicProductPrice(product.compareAtPrice)}
              </del>
            )}
          </span>
        </div>
        {comingSoon && <span className="public-arrival-note">Arriving soon</span>}
        {!comingSoon && product.moreArrivingSoon && <span className="public-arrival-note">More arriving soon</span>}
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
