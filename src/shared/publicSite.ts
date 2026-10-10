export type PublicSiteSettings = {
  businessName: string;
  tagline: string;
  heroTitle: string;
  heroSubtitle: string;
  primaryCtaLabel: string;
  secondaryCtaLabel: string;
  featuredSectionTitle: string;
  buySellTradeTitle: string;
  buySellTradeText: string;
  inventoryPageTitle: string;
  inventoryIntroText: string;
  showsPageTitle: string;
  showsIntroText: string;
  contactPageTitle: string;
  contactText: string;
  instagramUrl: string;
  contactEmail: string;
};

export type SiteAssetType = "PRIMARY_LOGO" | "FAVICON" | "HERO_IMAGE";

export type PublicSiteAssets = {
  primaryLogoUrl: string | null;
  faviconUrl: string | null;
  heroImageUrl: string | null;
};

export type PublicSiteConfiguration = {
  settings: PublicSiteSettings;
  assets: PublicSiteAssets;
};

export const PUBLIC_SITE_DEFAULTS: PublicSiteSettings = {
  businessName: "Double Rare Collectibles",
  tagline: "Pokémon • Buy • Sell • Trade",
  heroTitle: "Find your next double rare.",
  heroSubtitle: "Double Rare Collectibles brings sealed Pokémon products, personal service, and a collector-first experience to shows across the region.",
  primaryCtaLabel: "View inventory",
  secondaryCtaLabel: "Upcoming shows",
  featuredSectionTitle: "Featured inventory",
  buySellTradeTitle: "Buy. Sell. Trade.",
  buySellTradeText: "Looking for something new or ready to move part of your collection? Start a conversation with Double Rare.",
  inventoryPageTitle: "Sealed inventory",
  inventoryIntroText: "Browse our current selection of sealed Pokémon products. See something you like? Send us a quick inquiry and we will help from there.",
  showsPageTitle: "Shows",
  showsIntroText: "Find Double Rare at upcoming card shows and collector events.",
  contactPageTitle: "Contact",
  contactText: "Have a product question, a collection to sell, or want to know where Double Rare will be next? Reach out on Instagram.",
  instagramUrl: "https://www.instagram.com/",
  contactEmail: "",
};

export const EMPTY_PUBLIC_SITE_ASSETS: PublicSiteAssets = {
  primaryLogoUrl: null,
  faviconUrl: null,
  heroImageUrl: null,
};
