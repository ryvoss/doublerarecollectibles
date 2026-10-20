import { primaryMerchandisingBadge, type PublicInventoryItem } from "../../shared/publicInventory";

const availabilityLabels = {
  IN_STOCK: "In Stock",
  COMING_SOON: "Coming Soon!",
  LOW_STOCK: "Low Stock",
  SOLD_OUT: "Sold Out",
} as const;

const badgeLabels = {
  RECENT_PRICE_DROP: "Recent Price Drop",
  COMING_SOON: "Coming Soon",
  LOW_STOCK: "Low Stock",
  SOLD_OUT: "Sold Out",
  FEATURED: "Featured",
} as const;

/** Merchandising never replaces the actual availability supplied by the public API. */
export function PublicProductStatus({ product, className }: {
  product: PublicInventoryItem;
  className: string;
}) {
  const badge = primaryMerchandisingBadge(product);
  return <span className={className}>
    {badge && <span className={`public-stock-badge public-stock-badge--${badge.toLowerCase()}`}>{badgeLabels[badge]}</span>}
    {badge !== product.availability && <span className="public-availability-text">{availabilityLabels[product.availability]}</span>}
  </span>;
}
