import {
  EMPTY_PUBLIC_SITE_ASSETS,
  PUBLIC_SITE_DEFAULTS,
  type PublicSiteConfiguration,
  type PublicSiteSettings,
  type SiteAssetType,
} from "../../shared/publicSite";
import { prisma } from "../prisma";
import { productImageStorage } from "./productImageStorage";

export async function getPublicSiteConfiguration(): Promise<PublicSiteConfiguration> {
  const [settingsRecord, assetRecords] = await Promise.all([
    prisma.siteSettings.findUnique({ where: { id: 1 } }),
    prisma.siteAsset.findMany({ select: { type: true, imageKey: true } }),
  ]);

  const settings: PublicSiteSettings = settingsRecord
    ? {
        businessName: settingsRecord.businessName,
        tagline: settingsRecord.tagline,
        heroTitle: settingsRecord.heroTitle,
        heroSubtitle: settingsRecord.heroSubtitle,
        primaryCtaLabel: settingsRecord.primaryCtaLabel,
        secondaryCtaLabel: settingsRecord.secondaryCtaLabel,
        featuredSectionTitle: settingsRecord.featuredSectionTitle,
        buySellTradeTitle: settingsRecord.buySellTradeTitle,
        buySellTradeText: settingsRecord.buySellTradeText,
        inventoryPageTitle: settingsRecord.inventoryPageTitle,
        inventoryIntroText: settingsRecord.inventoryIntroText,
        showsPageTitle: settingsRecord.showsPageTitle,
        showsIntroText: settingsRecord.showsIntroText,
        contactPageTitle: settingsRecord.contactPageTitle,
        contactText: settingsRecord.contactText,
        instagramUrl: settingsRecord.instagramUrl,
        contactEmail: settingsRecord.contactEmail,
      }
    : { ...PUBLIC_SITE_DEFAULTS };

  const imageUrlFor = (type: SiteAssetType) =>
    productImageStorage.getPublicUrl(
      assetRecords.find((asset) => asset.type === type)?.imageKey ?? null,
    );

  return {
    settings,
    assets: {
      ...EMPTY_PUBLIC_SITE_ASSETS,
      primaryLogoUrl: imageUrlFor("PRIMARY_LOGO"),
      faviconUrl: imageUrlFor("FAVICON"),
      heroImageUrl: imageUrlFor("HERO_IMAGE"),
    },
  };
}
