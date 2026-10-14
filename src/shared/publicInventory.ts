export type PublicInventoryAvailability =
  | "SOLD_OUT"
  | "COMING_SOON"
  | "LOW_STOCK"
  | "IN_STOCK";

export const PUBLIC_LOW_STOCK_MAXIMUM = 3;
export const RECENT_PRICE_DROP_DAYS = 30;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

export function publicAvailabilityForUnits(
  unitsAvailable: number,
  unitsInbound = 0,
): PublicInventoryAvailability {
  if (unitsAvailable <= 0) {
    return unitsInbound > 0 ? "COMING_SOON" : "SOLD_OUT";
  }

  if (unitsAvailable <= PUBLIC_LOW_STOCK_MAXIMUM) {
    return "LOW_STOCK";
  }

  return "IN_STOCK";
}

export type PublicInventoryItem = {
  id: number;
  name: string;
  shortDescription: string | null;
  imageUrl: string | null;
  displayPrice: number | null;
  compareAtPrice: number | null;
  recentPriceDrop: boolean;
  featured: boolean;
  availability: PublicInventoryAvailability;
  moreArrivingSoon: boolean;
};

export type AdminPublicListingItem = {
  id: number;
  internalName: string;
  displayName: string | null;
  shortDescription: string | null;
  imageUrl: string | null;
  stockStatus: PublicInventoryAvailability;
  expectedSalePrice: number | null;
  publicPrice: number | null;
  compareAtPrice: number | null;
  priceUpdatedAt: string | null;
  recentPriceDrop: boolean;
  publicVisible: boolean;
  featured: boolean;
};

export type AdminPublicListingUpdate = {
  id: number;
  displayName?: string | null;
  shortDescription?: string | null;
  publicPrice?: number | null;
  compareAtPrice?: number | null;
  publicVisible?: boolean;
  featured?: boolean;
};

type PriceDropState = {
  publicPrice: number | null;
  compareAtPrice: number | null;
  priceUpdatedAt: Date | string | null;
};

const moneyCents = (value: number) => Math.round(value * 100);

export function isValidPublicMoney(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 99999999.99 &&
    Math.abs(value * 100 - moneyCents(value)) < 0.000001;
}

export function suggestedCompareAtPrice(
  previousDisplayPrice: number | null,
  nextPublicPrice: number | null,
  currentCompareAtPrice: number | null,
) {
  if (
    previousDisplayPrice !== null &&
    nextPublicPrice !== null &&
    moneyCents(nextPublicPrice) < moneyCents(previousDisplayPrice) &&
    (currentCompareAtPrice === null || moneyCents(currentCompareAtPrice) <= moneyCents(nextPublicPrice))
  ) {
    return previousDisplayPrice;
  }
  return currentCompareAtPrice;
}

export function isRecentPriceDrop(
  state: PriceDropState,
  now = new Date(),
) {
  if (
    state.publicPrice === null ||
    state.compareAtPrice === null ||
    moneyCents(state.compareAtPrice) <= moneyCents(state.publicPrice) ||
    state.priceUpdatedAt === null
  ) {
    return false;
  }

  const changedAt = new Date(state.priceUpdatedAt).getTime();
  const age = now.getTime() - changedAt;
  return Number.isFinite(changedAt) && age >= 0 && age <= RECENT_PRICE_DROP_DAYS * DAY_IN_MILLISECONDS;
}

export type PublicMerchandisingBadge =
  | "RECENT_PRICE_DROP"
  | "COMING_SOON"
  | "LOW_STOCK"
  | "SOLD_OUT"
  | "FEATURED";

export function primaryMerchandisingBadge(
  product: Pick<PublicInventoryItem, "availability" | "featured" | "recentPriceDrop">,
): PublicMerchandisingBadge | null {
  // Zero-on-hand inventory leads with Coming Soon so a price drop never implies
  // that the product is immediately available.
  if (product.availability === "COMING_SOON") return "COMING_SOON";
  if (product.recentPriceDrop) return "RECENT_PRICE_DROP";
  if (product.availability === "LOW_STOCK") return "LOW_STOCK";
  if (product.availability === "SOLD_OUT") return "SOLD_OUT";
  if (product.featured) return "FEATURED";
  return null;
}

export function selectHomepageMerchandise(
  products: PublicInventoryItem[],
  options: number | {
    limit: number;
    prioritizeRecentDrops: boolean;
    includeFeatured: boolean;
    includeComingSoon: boolean;
    fallback: "NONE" | "AVAILABLE" | "INCLUDING_SOLD_OUT";
  } = 4,
) {
  const config = typeof options === "number" ? {
    limit: options,
    prioritizeRecentDrops: true,
    includeFeatured: true,
    includeComingSoon: true,
    fallback: "AVAILABLE" as const,
  } : options;
  const selected: PublicInventoryItem[] = [];
  const seen = new Set<number>();
  const available = products.filter(product =>
    product.availability !== "SOLD_OUT" &&
    (config.includeComingSoon || product.availability !== "COMING_SOON")
  );
  const soldOut = products.filter(product => product.availability === "SOLD_OUT");
  const groups: PublicInventoryItem[][] = [];
  if (config.prioritizeRecentDrops) groups.push(available.filter(product => product.recentPriceDrop));
  if (config.includeFeatured) groups.push(available.filter(product => product.featured));
  if (config.includeComingSoon) groups.push(available.filter(product => product.availability === "COMING_SOON"));
  if (config.fallback !== "NONE") groups.push(available);
  if (config.fallback === "INCLUDING_SOLD_OUT") {
    groups.push(soldOut.filter(product =>
      (config.prioritizeRecentDrops && product.recentPriceDrop) ||
      (config.includeFeatured && product.featured)
    ), soldOut);
  }

  for (const group of groups) {
    for (const product of group) {
      if (seen.has(product.id)) continue;
      seen.add(product.id);
      selected.push(product);
      if (selected.length === config.limit) return selected;
    }
  }
  return selected;
}

export function selectComingSoonProducts(products: PublicInventoryItem[], limit = 4) {
  return products.filter((product) => product.availability === "COMING_SOON").slice(0, limit);
}

export function resolvePublicPriceUpdate(
  current: PriceDropState,
  update: { publicPrice?: number | null; compareAtPrice?: number | null },
  now = new Date(),
) {
  const publicPrice = update.publicPrice === undefined ? current.publicPrice : update.publicPrice;
  let compareAtPrice = update.compareAtPrice === undefined ? current.compareAtPrice : update.compareAtPrice;
  const publicPriceChanged = publicPrice !== current.publicPrice;
  const compareAtChanged = compareAtPrice !== current.compareAtPrice;

  if (
    publicPriceChanged &&
    current.publicPrice !== null &&
    publicPrice !== null &&
    moneyCents(publicPrice) < moneyCents(current.publicPrice) &&
    update.compareAtPrice === undefined &&
    (compareAtPrice === null || moneyCents(compareAtPrice) <= moneyCents(publicPrice))
  ) {
    compareAtPrice = current.publicPrice;
  }

  let priceUpdatedAt = current.priceUpdatedAt === null
    ? null
    : new Date(current.priceUpdatedAt);
  const qualifies = publicPrice !== null && compareAtPrice !== null &&
    moneyCents(compareAtPrice) > moneyCents(publicPrice);

  if (publicPriceChanged) {
    const lowered = current.publicPrice !== null && publicPrice !== null &&
      moneyCents(publicPrice) < moneyCents(current.publicPrice);
    // A newly explicit public price can also start a drop when the admin has
    // supplied a higher compare-at price (for example, below the prior
    // Expected Sale Price fallback).
    priceUpdatedAt = (lowered || current.publicPrice === null) && qualifies ? now : null;
  } else if (compareAtChanged) {
    priceUpdatedAt = qualifies ? now : null;
  }

  return { publicPrice, compareAtPrice, priceUpdatedAt };
}
