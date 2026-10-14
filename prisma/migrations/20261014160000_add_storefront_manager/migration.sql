ALTER TABLE "SiteSettings"
ADD COLUMN "primaryCtaTarget" TEXT NOT NULL DEFAULT 'INVENTORY',
ADD COLUMN "secondaryCtaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "secondaryCtaTarget" TEXT NOT NULL DEFAULT 'SHOWS',
ADD COLUMN "featuredMaxItems" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN "featuredPrioritizeRecentDrops" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "featuredIncludeFeatured" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "featuredIncludeComingSoon" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "featuredFallback" TEXT NOT NULL DEFAULT 'AVAILABLE',
ADD COLUMN "comingSoonSectionTitle" TEXT NOT NULL DEFAULT 'Coming Soon',
ADD COLUMN "comingSoonMaxItems" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN "nextShowSectionTitle" TEXT NOT NULL DEFAULT 'Next Show',
ADD COLUMN "buySellTradeCtaLabel" TEXT NOT NULL DEFAULT 'Learn how it works',
ADD COLUMN "homepageSections" JSONB NOT NULL DEFAULT '[{"key":"HERO","visible":true},{"key":"MERCHANDISING","visible":true},{"key":"COMING_SOON","visible":false},{"key":"NEXT_SHOW","visible":true},{"key":"BUY_SELL_TRADE","visible":true},{"key":"CONTACT","visible":true}]'::jsonb,
ADD COLUMN "announcementEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "announcementMessage" TEXT NOT NULL DEFAULT '',
ADD COLUMN "announcementCtaLabel" TEXT NOT NULL DEFAULT '',
ADD COLUMN "announcementCtaTarget" TEXT NOT NULL DEFAULT 'INVENTORY',
ADD COLUMN "announcementStartsAt" TIMESTAMP(3),
ADD COLUMN "announcementEndsAt" TIMESTAMP(3);

ALTER TABLE "Show"
ADD COLUMN "publicVisible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "venue" TEXT,
ADD COLUMN "location" TEXT,
ADD COLUMN "boothInfo" TEXT,
ADD COLUMN "publicNote" TEXT;

CREATE INDEX "Show_publicVisible_idx" ON "Show"("publicVisible");
