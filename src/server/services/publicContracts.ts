import type { PublicInventoryItem } from "../../shared/publicInventory";
import { publicAvailabilityForUnits } from "../../shared/publicInventory";
import type { PublicSiteSettings } from "../../shared/publicSite";

type PublicInventorySource = {
  id: number;
  name: string;
  displayName: string | null;
  shortDescription: string | null;
  publicPrice: unknown;
  expectedSalePrice: unknown;
  featured: boolean;
  inventoryBatches: Array<{
    quantityPurchased: number;
    quantityReceived: number;
    quantitySold: number;
    quantityConverted: number;
  }>;
};

export function toPublicInventoryItem(
  product: PublicInventorySource,
  imageUrl: string | null,
): PublicInventoryItem {
  const unitsAvailable = product.inventoryBatches.reduce(
    (total, batch) => total + batch.quantityReceived - batch.quantitySold - batch.quantityConverted,
    0,
  );
  const unitsInbound = product.inventoryBatches.reduce(
    (total, batch) => total + batch.quantityPurchased - batch.quantityReceived,
    0,
  );
  const displayPrice = product.publicPrice ?? product.expectedSalePrice;
  return {
    id: product.id,
    name: product.displayName ?? product.name,
    shortDescription: product.shortDescription,
    imageUrl,
    displayPrice: displayPrice === null ? null : Number(displayPrice),
    featured: product.featured,
    availability: publicAvailabilityForUnits(unitsAvailable, unitsInbound),
    moreArrivingSoon: unitsAvailable > 0 && unitsInbound > 0,
  };
}

export function toPublicSiteSettings(source: PublicSiteSettings): PublicSiteSettings {
  return {
    businessName: source.businessName,
    tagline: source.tagline,
    heroTitle: source.heroTitle,
    heroSubtitle: source.heroSubtitle,
    primaryCtaLabel: source.primaryCtaLabel,
    secondaryCtaLabel: source.secondaryCtaLabel,
    featuredSectionTitle: source.featuredSectionTitle,
    buySellTradeTitle: source.buySellTradeTitle,
    buySellTradeText: source.buySellTradeText,
    inventoryPageTitle: source.inventoryPageTitle,
    inventoryIntroText: source.inventoryIntroText,
    showsPageTitle: source.showsPageTitle,
    showsIntroText: source.showsIntroText,
    contactPageTitle: source.contactPageTitle,
    contactText: source.contactText,
    instagramUrl: source.instagramUrl,
    contactEmail: source.contactEmail,
  };
}
