import type { PublicInventoryItem } from "../../shared/publicInventory";
import { isRecentPriceDrop, publicAvailabilityForUnits } from "../../shared/publicInventory";
import {
  CTA_TARGETS,
  DEFAULT_HOMEPAGE_SECTIONS,
  HOMEPAGE_SECTION_KEYS,
  MERCHANDISING_FALLBACKS,
  type HomepageSectionConfig,
  type PublicSiteSettings,
} from "../../shared/publicSite";

type PublicInventorySource = {
  id: number;
  name: string;
  displayName: string | null;
  shortDescription: string | null;
  publicPrice: unknown;
  compareAtPrice: unknown;
  priceUpdatedAt: Date | null;
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
  now = new Date(),
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
  const publicPrice = product.publicPrice === null ? null : Number(product.publicPrice);
  const compareAtPrice = product.compareAtPrice === null ? null : Number(product.compareAtPrice);
  return {
    id: product.id,
    name: product.displayName ?? product.name,
    shortDescription: product.shortDescription,
    imageUrl,
    displayPrice: displayPrice === null ? null : Number(displayPrice),
    compareAtPrice,
    recentPriceDrop: isRecentPriceDrop({
      publicPrice,
      compareAtPrice,
      priceUpdatedAt: product.priceUpdatedAt,
    }, now),
    featured: product.featured,
    availability: publicAvailabilityForUnits(unitsAvailable, unitsInbound),
    moreArrivingSoon: unitsAvailable > 0 && unitsInbound > 0,
  };
}

export function normalizeHomepageSections(value: unknown): HomepageSectionConfig[] {
  if (!Array.isArray(value)) return DEFAULT_HOMEPAGE_SECTIONS.map((section) => ({ ...section }));
  const seen = new Set<string>();
  const normalized: HomepageSectionConfig[] = [];
  for (const candidate of value) {
    if (
      typeof candidate !== "object" || candidate === null || Array.isArray(candidate) ||
      typeof (candidate as { key?: unknown }).key !== "string" ||
      typeof (candidate as { visible?: unknown }).visible !== "boolean"
    ) continue;
    const key = (candidate as { key: string }).key;
    if (!HOMEPAGE_SECTION_KEYS.includes(key as HomepageSectionConfig["key"]) || seen.has(key)) continue;
    seen.add(key);
    normalized.push({ key: key as HomepageSectionConfig["key"], visible: (candidate as { visible: boolean }).visible });
  }
  for (const fallback of DEFAULT_HOMEPAGE_SECTIONS) {
    if (!seen.has(fallback.key)) normalized.push({ ...fallback });
  }
  return normalized;
}

type PublicSiteSettingsSource = Omit<PublicSiteSettings,
  "homepageSections" | "announcementStartsAt" | "announcementEndsAt" |
  "primaryCtaTarget" | "secondaryCtaTarget" | "announcementCtaTarget" | "featuredFallback"
> & {
  homepageSections: unknown;
  announcementStartsAt: Date | string | null;
  announcementEndsAt: Date | string | null;
  primaryCtaTarget: string;
  secondaryCtaTarget: string;
  announcementCtaTarget: string;
  featuredFallback: string;
};

export function toPublicSiteSettings(source: PublicSiteSettingsSource): PublicSiteSettings {
  return {
    businessName: source.businessName,
    tagline: source.tagline,
    heroTitle: source.heroTitle,
    heroSubtitle: source.heroSubtitle,
    primaryCtaLabel: source.primaryCtaLabel,
    primaryCtaTarget: CTA_TARGETS.includes(source.primaryCtaTarget as PublicSiteSettings["primaryCtaTarget"]) ? source.primaryCtaTarget as PublicSiteSettings["primaryCtaTarget"] : "INVENTORY",
    secondaryCtaEnabled: source.secondaryCtaEnabled,
    secondaryCtaLabel: source.secondaryCtaLabel,
    secondaryCtaTarget: CTA_TARGETS.includes(source.secondaryCtaTarget as PublicSiteSettings["secondaryCtaTarget"]) ? source.secondaryCtaTarget as PublicSiteSettings["secondaryCtaTarget"] : "SHOWS",
    featuredSectionTitle: source.featuredSectionTitle,
    featuredMaxItems: source.featuredMaxItems,
    featuredPrioritizeRecentDrops: source.featuredPrioritizeRecentDrops,
    featuredIncludeFeatured: source.featuredIncludeFeatured,
    featuredIncludeComingSoon: source.featuredIncludeComingSoon,
    featuredFallback: MERCHANDISING_FALLBACKS.includes(source.featuredFallback as PublicSiteSettings["featuredFallback"]) ? source.featuredFallback as PublicSiteSettings["featuredFallback"] : "AVAILABLE",
    comingSoonSectionTitle: source.comingSoonSectionTitle,
    comingSoonMaxItems: source.comingSoonMaxItems,
    nextShowSectionTitle: source.nextShowSectionTitle,
    buySellTradeTitle: source.buySellTradeTitle,
    buySellTradeText: source.buySellTradeText,
    buySellTradeCtaLabel: source.buySellTradeCtaLabel,
    inventoryPageTitle: source.inventoryPageTitle,
    inventoryIntroText: source.inventoryIntroText,
    showsPageTitle: source.showsPageTitle,
    showsIntroText: source.showsIntroText,
    contactPageTitle: source.contactPageTitle,
    contactText: source.contactText,
    instagramUrl: source.instagramUrl,
    contactEmail: source.contactEmail,
    homepageSections: normalizeHomepageSections(source.homepageSections),
    announcementEnabled: source.announcementEnabled,
    announcementMessage: source.announcementMessage,
    announcementCtaLabel: source.announcementCtaLabel,
    announcementCtaTarget: CTA_TARGETS.includes(source.announcementCtaTarget as PublicSiteSettings["announcementCtaTarget"]) ? source.announcementCtaTarget as PublicSiteSettings["announcementCtaTarget"] : "INVENTORY",
    announcementStartsAt: source.announcementStartsAt ? new Date(source.announcementStartsAt).toISOString() : null,
    announcementEndsAt: source.announcementEndsAt ? new Date(source.announcementEndsAt).toISOString() : null,
  };
}
