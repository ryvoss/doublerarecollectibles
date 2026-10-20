const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export function formatPublicProductPrice(price: number | null) {
  return price === null ? "Contact for price" : currency.format(price);
}

export function PriceDisplay({ price, compareAtPrice, recentPriceDrop, className }: {
  price: number | null; compareAtPrice: number | null; recentPriceDrop: boolean; className: string;
}) {
  return <span className={className}><strong>{formatPublicProductPrice(price)}</strong>
    {recentPriceDrop && compareAtPrice !== null && <del aria-label={`Previously ${formatPublicProductPrice(compareAtPrice)}`}>was {formatPublicProductPrice(compareAtPrice)}</del>}
  </span>;
}
