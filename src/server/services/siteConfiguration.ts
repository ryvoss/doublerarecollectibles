import {
  EMPTY_PUBLIC_SITE_ASSETS,
  PUBLIC_SITE_DEFAULTS,
  upcomingPublicShows,
  type PublicSiteConfiguration,
  type PublicSiteSettings,
  type SiteAssetType,
} from "../../shared/publicSite";
import { prisma } from "../prisma";
import { productImageStorage } from "./productImageStorage";
import { toPublicSiteSettings } from "./publicContracts";

export async function getPublicSiteConfiguration(): Promise<PublicSiteConfiguration> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const [settingsRecord, assetRecords, nextShowVisits] = await Promise.all([
    prisma.siteSettings.findUnique({ where: { id: 1 } }),
    prisma.siteAsset.findMany({ select: { type: true, imageKey: true } }),
    prisma.showVisit.findMany({
      where: {
        visitDate: { gte: today },
        status: { in: ["PLANNED", "ACTIVE"] },
        show: { publicVisible: true },
      },
      orderBy: [{ visitDate: "asc" }, { id: "asc" }],
      select: {
        visitDate: true,
        show: {
          select: {
            name: true,
            venue: true,
            location: true,
            boothInfo: true,
            publicNote: true,
          },
        },
      },
    }),
  ]);

  const settings: PublicSiteSettings = settingsRecord
    ? toPublicSiteSettings(settingsRecord)
    : { ...PUBLIC_SITE_DEFAULTS };

  const imageUrlFor = (type: SiteAssetType) =>
    productImageStorage.getPublicUrl(
      assetRecords.find((asset) => asset.type === type)?.imageKey ?? null,
    );

  const upcomingShows = upcomingPublicShows(nextShowVisits.map((visit) => ({
    name: visit.show.name,
    date: visit.visitDate.toISOString(),
    venue: visit.show.venue,
    location: visit.show.location,
    boothInfo: visit.show.boothInfo,
    note: visit.show.publicNote,
  })));

  return {
    settings,
    assets: {
      ...EMPTY_PUBLIC_SITE_ASSETS,
      primaryLogoUrl: imageUrlFor("PRIMARY_LOGO"),
      faviconUrl: imageUrlFor("FAVICON"),
      heroImageUrl: imageUrlFor("HERO_IMAGE"),
    },
    nextShow: upcomingShows[0] ?? null,
    upcomingShows,
  };
}
