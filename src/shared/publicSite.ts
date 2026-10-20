export const HOMEPAGE_SECTION_KEYS = [
  "UPDATES",
  "HERO",
  "MERCHANDISING",
  "COMING_SOON",
  "NEXT_SHOW",
  "BUY_SELL_TRADE",
  "CONTACT",
] as const;

export type HomepageSectionKey = typeof HOMEPAGE_SECTION_KEYS[number];

export type HomepageSectionConfig = {
  key: HomepageSectionKey;
  visible: boolean;
};

export const CTA_TARGETS = ["INVENTORY", "BUY_SELL_TRADE", "CONTACT", "SHOWS"] as const;
export type StorefrontCtaTarget = typeof CTA_TARGETS[number];

export const CTA_TARGET_PATHS: Record<StorefrontCtaTarget, string> = {
  INVENTORY: "/inventory",
  BUY_SELL_TRADE: "/buy-sell-trade",
  CONTACT: "/contact",
  SHOWS: "/shows",
};

export const MERCHANDISING_FALLBACKS = ["NONE", "AVAILABLE", "INCLUDING_SOLD_OUT"] as const;
export type MerchandisingFallback = typeof MERCHANDISING_FALLBACKS[number];

export type PublicSiteSettings = {
  businessName: string;
  tagline: string;
  heroTitle: string;
  heroSubtitle: string;
  primaryCtaLabel: string;
  primaryCtaTarget: StorefrontCtaTarget;
  secondaryCtaEnabled: boolean;
  secondaryCtaLabel: string;
  secondaryCtaTarget: StorefrontCtaTarget;
  featuredSectionTitle: string;
  featuredMaxItems: number;
  featuredPrioritizeRecentDrops: boolean;
  featuredIncludeFeatured: boolean;
  featuredIncludeComingSoon: boolean;
  featuredFallback: MerchandisingFallback;
  comingSoonSectionTitle: string;
  comingSoonMaxItems: number;
  nextShowSectionTitle: string;
  buySellTradeTitle: string;
  buySellTradeText: string;
  buySellTradeCtaLabel: string;
  inventoryPageTitle: string;
  inventoryIntroText: string;
  showsPageTitle: string;
  showsIntroText: string;
  contactPageTitle: string;
  contactText: string;
  instagramUrl: string;
  contactEmail: string;
  homepageSections: HomepageSectionConfig[];
  announcementEnabled: boolean;
  announcementMessage: string;
  announcementCtaLabel: string;
  announcementCtaTarget: StorefrontCtaTarget;
  announcementStartsAt: string | null;
  announcementEndsAt: string | null;
};

export type SiteAssetType = "PRIMARY_LOGO" | "FAVICON" | "HERO_IMAGE";

export type PublicSiteAssets = {
  primaryLogoUrl: string | null;
  faviconUrl: string | null;
  heroImageUrl: string | null;
};

export type PublicNextShow = {
  name: string;
  date: string;
  venue: string | null;
  location: string | null;
  boothInfo: string | null;
  note: string | null;
};

export type PublicSiteConfiguration = {
  settings: PublicSiteSettings;
  assets: PublicSiteAssets;
  nextShow: PublicNextShow | null;
  upcomingShows?: PublicNextShow[];
};

export const DEFAULT_HOMEPAGE_SECTIONS: HomepageSectionConfig[] = [
  { key: "UPDATES", visible: true },
  { key: "MERCHANDISING", visible: true },
  { key: "COMING_SOON", visible: false },
  { key: "NEXT_SHOW", visible: true },
  { key: "BUY_SELL_TRADE", visible: true },
  { key: "HERO", visible: true },
  { key: "CONTACT", visible: true },
];

export const PUBLIC_SITE_DEFAULTS: PublicSiteSettings = {
  businessName: "Double Rare Collectibles",
  tagline: "Pokémon • Buy • Sell • Trade",
  heroTitle: "Find your next double rare.",
  heroSubtitle: "Double Rare Collectibles brings sealed Pokémon products, personal service, and a collector-first experience to shows across the region.",
  primaryCtaLabel: "View inventory",
  primaryCtaTarget: "INVENTORY",
  secondaryCtaEnabled: false,
  secondaryCtaLabel: "Upcoming shows",
  secondaryCtaTarget: "SHOWS",
  featuredSectionTitle: "Featured & Recent Drops",
  featuredMaxItems: 4,
  featuredPrioritizeRecentDrops: true,
  featuredIncludeFeatured: true,
  featuredIncludeComingSoon: true,
  featuredFallback: "AVAILABLE",
  comingSoonSectionTitle: "Coming Soon",
  comingSoonMaxItems: 4,
  nextShowSectionTitle: "Next Show",
  buySellTradeTitle: "Buy. Sell. Trade.",
  buySellTradeText: "Looking for something new or ready to move part of your collection? Start a conversation with Double Rare.",
  buySellTradeCtaLabel: "Learn how it works",
  inventoryPageTitle: "Sealed inventory",
  inventoryIntroText: "Browse our current selection of sealed Pokémon products. See something you like? Send us a quick inquiry and we will help from there.",
  showsPageTitle: "Shows",
  showsIntroText: "Find Double Rare at upcoming card shows and collector events.",
  contactPageTitle: "Contact",
  contactText: "Have a product question, a collection to sell, or want to know where Double Rare will be next? Reach out on Instagram.",
  instagramUrl: "https://www.instagram.com/",
  contactEmail: "",
  homepageSections: DEFAULT_HOMEPAGE_SECTIONS.map((section) => ({ ...section })),
  announcementEnabled: false,
  announcementMessage: "",
  announcementCtaLabel: "",
  announcementCtaTarget: "INVENTORY",
  announcementStartsAt: null,
  announcementEndsAt: null,
};

export const EMPTY_PUBLIC_SITE_ASSETS: PublicSiteAssets = {
  primaryLogoUrl: null,
  faviconUrl: null,
  heroImageUrl: null,
};

export function isAnnouncementActive(
  settings: Pick<PublicSiteSettings, "announcementEnabled" | "announcementMessage" | "announcementStartsAt" | "announcementEndsAt">,
  now = new Date(),
) {
  if (!settings.announcementEnabled || settings.announcementMessage.trim() === "") return false;
  const nowValue = now.getTime();
  const starts = settings.announcementStartsAt ? new Date(settings.announcementStartsAt).getTime() : null;
  const ends = settings.announcementEndsAt ? new Date(settings.announcementEndsAt).getTime() : null;
  return (starts === null || starts <= nowValue) && (ends === null || ends >= nowValue);
}

export function selectNearestUpcomingShow(
  shows: PublicNextShow[],
  now = new Date(),
) {
  return upcomingPublicShows(shows, now)[0] ?? null;
}

export function upcomingPublicShows(shows: PublicNextShow[], now = new Date()) {
  const beginningOfToday = new Date(now);
  beginningOfToday.setUTCHours(0, 0, 0, 0);
  return shows
    .filter((show) => new Date(show.date).getTime() >= beginningOfToday.getTime())
    .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime() || left.name.localeCompare(right.name));
}

export function visibleHomepageSectionKeys(sections: HomepageSectionConfig[]) {
  return sections.filter((section) => section.visible).map((section) => section.key);
}
