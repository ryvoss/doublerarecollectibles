import type { PublicInventoryItem } from "../../shared/publicInventory";
import { PublicProductStatus } from "./PublicProductStatus";
import { PriceDisplay } from "./PriceDisplay";
import ProductImage from "../components/ProductImage";

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

  return (
    <article data-public-product-id={product.id} className={`public-catalog-card${soldOut ? " is-sold-out" : ""}${comingSoon ? " is-coming-soon" : ""}`}>
      <button
        className="public-catalog-card__open"
        type="button"
        aria-label={`View details for ${product.name}`}
        onClick={(event) => onOpen(event.currentTarget)}
      />
      <ProductImage
        className="public-catalog-card__image"
        variant="card"
        src={product.imageUrl}
        alt={product.name}
        loading="lazy"
      />

      <div className="public-catalog-card__body">
        <Heading>{product.name}</Heading>
        <PriceDisplay className="public-catalog-card__prices" price={product.displayPrice} compareAtPrice={product.compareAtPrice} recentPriceDrop={product.recentPriceDrop} />
        <div className="public-catalog-card__meta"><PublicProductStatus product={product} className="public-catalog-card__status" /></div>
        {comingSoon && <span className="public-arrival-note">Arriving soon</span>}
        {!comingSoon && product.moreArrivingSoon && <span className="public-arrival-note">More arriving soon</span>}
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
