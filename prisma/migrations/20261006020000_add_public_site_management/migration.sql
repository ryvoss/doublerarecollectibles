CREATE TYPE "SiteAssetType" AS ENUM ('PRIMARY_LOGO', 'FAVICON', 'HERO_IMAGE');

CREATE TABLE "SiteSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "businessName" TEXT NOT NULL,
    "tagline" TEXT NOT NULL,
    "heroTitle" TEXT NOT NULL,
    "heroSubtitle" TEXT NOT NULL,
    "primaryCtaLabel" TEXT NOT NULL,
    "secondaryCtaLabel" TEXT NOT NULL,
    "featuredSectionTitle" TEXT NOT NULL,
    "buySellTradeTitle" TEXT NOT NULL,
    "buySellTradeText" TEXT NOT NULL,
    "inventoryPageTitle" TEXT NOT NULL,
    "inventoryIntroText" TEXT NOT NULL,
    "showsPageTitle" TEXT NOT NULL,
    "showsIntroText" TEXT NOT NULL,
    "contactPageTitle" TEXT NOT NULL,
    "contactText" TEXT NOT NULL,
    "instagramUrl" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SiteAsset" (
    "id" SERIAL NOT NULL,
    "type" "SiteAssetType" NOT NULL,
    "imageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SiteAsset_type_key" ON "SiteAsset"("type");

INSERT INTO "SiteSettings" (
    "id", "businessName", "tagline", "heroTitle", "heroSubtitle",
    "primaryCtaLabel", "secondaryCtaLabel", "featuredSectionTitle",
    "buySellTradeTitle", "buySellTradeText", "inventoryPageTitle",
    "inventoryIntroText", "showsPageTitle", "showsIntroText",
    "contactPageTitle", "contactText", "instagramUrl", "contactEmail",
    "updatedAt"
) VALUES (
    1,
    'Double Rare Collectibles',
    'Pokémon • Buy • Sell • Trade',
    'Find your next double rare.',
    'Double Rare Collectibles brings sealed Pokémon products, personal service, and a collector-first experience to shows across the region.',
    'View inventory',
    'Upcoming shows',
    'Featured inventory',
    'Buy. Sell. Trade.',
    'Looking for something new or ready to move part of your collection? Start a conversation with Double Rare.',
    'Sealed inventory',
    'Browse our current selection of sealed Pokémon products. See something you like? Send us a quick inquiry and we will help from there.',
    'Shows',
    'Find Double Rare at upcoming card shows and collector events.',
    'Contact',
    'Have a product question, a collection to sell, or want to know where Double Rare will be next? Reach out on Instagram.',
    'https://www.instagram.com/',
    '',
    CURRENT_TIMESTAMP
);
