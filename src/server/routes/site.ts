import { logServerError } from "../security/logging";
import { Router } from "express";
import {
  CTA_TARGETS,
  HOMEPAGE_SECTION_KEYS,
  MERCHANDISING_FALLBACKS,
  PUBLIC_SITE_DEFAULTS,
  type HomepageSectionConfig,
  type PublicSiteSettings,
  type SiteAssetType,
} from "../../shared/publicSite";
import { parseImageBody } from "../middleware/imageUpload";
import { prisma } from "../prisma";
import {
  ProductImageValidationError,
  productImageStorage,
  validateProductImageUpload,
} from "../services/productImageStorage";
import { getPublicSiteConfiguration } from "../services/siteConfiguration";

const router = Router();
const siteAssetTypes = new Set<SiteAssetType>(["PRIMARY_LOGO", "FAVICON", "HERO_IMAGE"]);
const stringLimits = {
  businessName: 120,
  tagline: 180,
  heroTitle: 180,
  heroSubtitle: 1000,
  primaryCtaLabel: 80,
  secondaryCtaLabel: 80,
  featuredSectionTitle: 160,
  buySellTradeTitle: 160,
  buySellTradeText: 1000,
  inventoryPageTitle: 160,
  inventoryIntroText: 1000,
  showsPageTitle: 160,
  showsIntroText: 1000,
  contactPageTitle: 160,
  contactText: 1000,
  instagramUrl: 500,
  contactEmail: 254,
  comingSoonSectionTitle: 160,
  nextShowSectionTitle: 160,
  buySellTradeCtaLabel: 80,
  announcementMessage: 240,
  announcementCtaLabel: 80,
};
const optionalStringFields = new Set(["contactEmail", "instagramUrl", "announcementMessage", "announcementCtaLabel"]);
const booleanFields = [
  "secondaryCtaEnabled", "featuredPrioritizeRecentDrops", "featuredIncludeFeatured",
  "featuredIncludeComingSoon", "announcementEnabled",
] as const;
const numberFields = ["featuredMaxItems", "comingSoonMaxItems"] as const;
const targetFields = ["primaryCtaTarget", "secondaryCtaTarget", "announcementCtaTarget"] as const;

function parseAssetType(value: string | string[]): SiteAssetType | null {
  return typeof value === "string" && siteAssetTypes.has(value as SiteAssetType)
    ? value as SiteAssetType
    : null;
}

function validateHomepageSections(value: unknown): HomepageSectionConfig[] | string {
  if (!Array.isArray(value) || value.length !== HOMEPAGE_SECTION_KEYS.length) {
    return "Homepage sections must include every supported section";
  }
  const seen = new Set<string>();
  const sections: HomepageSectionConfig[] = [];
  for (const candidate of value) {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) return "Invalid homepage section";
    const entry = candidate as Record<string, unknown>;
    if (Object.keys(entry).some((key) => key !== "key" && key !== "visible")) return "Unknown homepage section field";
    if (typeof entry.key !== "string" || !HOMEPAGE_SECTION_KEYS.includes(entry.key as HomepageSectionConfig["key"]) || seen.has(entry.key)) {
      return "Homepage section keys must be unique and supported";
    }
    if (typeof entry.visible !== "boolean") return "Homepage section visibility must be true or false";
    seen.add(entry.key);
    sections.push({ key: entry.key as HomepageSectionConfig["key"], visible: entry.visible });
  }
  return sections;
}

export function validateStorefrontSettings(value: unknown): PublicSiteSettings | string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "Site settings are required";
  }
  const input = value as Record<string, unknown>;
  const expectedFields = Object.keys(PUBLIC_SITE_DEFAULTS) as Array<keyof PublicSiteSettings>;
  if (Object.keys(input).some((key) => !expectedFields.includes(key as keyof PublicSiteSettings))) {
    return "Unknown site setting";
  }

  const normalized = { ...input } as Record<string, unknown>;
  for (const [field, limit] of Object.entries(stringLimits)) {
    const fieldValue = input[field];
    if (typeof fieldValue !== "string") return `${field} must be text`;
    const text = fieldValue.trim();
    if (!optionalStringFields.has(field) && text.length === 0) return `${field} cannot be blank`;
    if (text.length > limit) return `${field} is too long`;
    normalized[field] = text;
  }
  for (const field of booleanFields) {
    if (typeof input[field] !== "boolean") return `${field} must be true or false`;
  }
  for (const field of numberFields) {
    if (!Number.isInteger(input[field]) || Number(input[field]) < 1 || Number(input[field]) > 12) {
      return `${field} must be a whole number from 1 to 12`;
    }
  }
  for (const field of targetFields) {
    if (typeof input[field] !== "string" || !CTA_TARGETS.includes(input[field] as PublicSiteSettings[typeof field])) {
      return `${field} must be a supported destination`;
    }
  }
  if (typeof input.featuredFallback !== "string" || !MERCHANDISING_FALLBACKS.includes(input.featuredFallback as PublicSiteSettings["featuredFallback"])) {
    return "featuredFallback must be a supported fallback";
  }
  const sections = validateHomepageSections(input.homepageSections);
  if (typeof sections === "string") return sections;
  normalized.homepageSections = sections;
  for (const field of ["announcementStartsAt", "announcementEndsAt"] as const) {
    const fieldValue = input[field];
    if (fieldValue !== null && (typeof fieldValue !== "string" || !Number.isFinite(new Date(fieldValue).getTime()))) {
      return `${field} must be a valid date or null`;
    }
    normalized[field] = fieldValue === null ? null : new Date(fieldValue as string).toISOString();
  }
  if (normalized.announcementStartsAt && normalized.announcementEndsAt &&
      new Date(normalized.announcementStartsAt as string) >= new Date(normalized.announcementEndsAt as string)) {
    return "Announcement end must be after its start";
  }
  if (input.announcementEnabled && String(normalized.announcementMessage).length === 0) return "Announcement message cannot be blank when enabled";
  if (input.secondaryCtaEnabled && String(normalized.secondaryCtaLabel).length === 0) return "Secondary CTA label cannot be blank when enabled";

  try {
    const instagramUrl = String(normalized.instagramUrl);
    if (instagramUrl) {
      const url = new URL(instagramUrl);
      if (url.protocol !== "https:" && url.protocol !== "http:") return "Instagram URL must use http or https";
    }
  } catch {
    return "Enter a valid Instagram URL";
  }
  const contactEmail = String(normalized.contactEmail);
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return "Enter a valid contact email";
  }
  return normalized as PublicSiteSettings;
}

type PublicShowUpdate = {
  publicVisible: boolean;
  venue: string | null;
  location: string | null;
  boothInfo: string | null;
  publicNote: string | null;
};

export function validatePublicShowUpdate(value: unknown): PublicShowUpdate | string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "Public show settings are required";
  const input = value as Record<string, unknown>;
  const keys = ["publicVisible", "venue", "location", "boothInfo", "publicNote"];
  if (Object.keys(input).some((key) => !keys.includes(key))) return "Unknown public show setting";
  if (typeof input.publicVisible !== "boolean") return "publicVisible must be true or false";
  const result: PublicShowUpdate = { publicVisible: input.publicVisible, venue: null, location: null, boothInfo: null, publicNote: null };
  const limits = { venue: 160, location: 160, boothInfo: 120, publicNote: 500 };
  for (const [field, limit] of Object.entries(limits)) {
    const candidate = input[field];
    if (candidate !== null && typeof candidate !== "string") return `${field} must be text or null`;
    const text = typeof candidate === "string" ? candidate.trim() : "";
    if (text.length > limit) return `${field} is too long`;
    result[field as keyof typeof limits] = text || null;
  }
  return result;
}

router.get("/", async (_req, res) => {
  try {
    res.json(await getPublicSiteConfiguration());
  } catch (error) {
    logServerError("Site Manager configuration loading failed:", error);
    res.status(500).json({ error: "Site configuration could not be loaded" });
  }
});

router.put("/settings", async (req, res) => {
  try {
    const settings = validateStorefrontSettings(req.body?.settings);
    if (typeof settings === "string") return res.status(400).json({ error: settings });

    await prisma.siteSettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...settings },
      update: settings,
    });
    res.json(await getPublicSiteConfiguration());
  } catch (error) {
    logServerError("Site settings update failed:", error);
    res.status(500).json({ error: "Site settings could not be saved" });
  }
});

router.get("/shows", async (_req, res) => {
  try {
    const shows = await prisma.show.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        publicVisible: true,
        venue: true,
        location: true,
        boothInfo: true,
        publicNote: true,
        visits: {
          where: { status: { in: ["PLANNED", "ACTIVE"] } },
          orderBy: { visitDate: "asc" },
          take: 1,
          select: { visitDate: true, status: true },
        },
      },
    });
    res.json(shows.map(({ visits, ...show }) => ({
      ...show,
      nextVisitDate: visits[0]?.visitDate.toISOString() ?? null,
      nextVisitStatus: visits[0]?.status ?? null,
    })));
  } catch (error) {
    logServerError("Storefront show settings loading failed:", error);
    res.status(500).json({ error: "Storefront shows could not be loaded" });
  }
});

router.put("/shows/:showId", async (req, res) => {
  const showId = Number(req.params.showId);
  if (!Number.isSafeInteger(showId) || showId <= 0) return res.status(404).json({ error: "Show not found" });
  const update = validatePublicShowUpdate(req.body);
  if (typeof update === "string") return res.status(400).json({ error: update });
  try {
    const result = await prisma.show.updateMany({ where: { id: showId }, data: update });
    if (result.count !== 1) return res.status(404).json({ error: "Show not found" });
    res.json({ ok: true });
  } catch (error) {
    logServerError("Storefront show settings update failed:", error);
    res.status(500).json({ error: "Storefront show could not be saved" });
  }
});

router.put("/assets/:assetType", parseImageBody, async (req, res) => {
  let newImageKey: string | null = null;
  try {
    const assetType = parseAssetType(req.params.assetType);
    if (!assetType) return res.status(404).json({ error: "Unknown site asset type" });
    if (!Buffer.isBuffer(req.body)) {
      return res.status(415).json({ error: "Upload a JPEG, PNG, or WebP image" });
    }
    const encodedFileName = req.get("x-file-name");
    if (!encodedFileName) return res.status(400).json({ error: "The image filename is required" });
    let originalFileName: string;
    try {
      originalFileName = decodeURIComponent(encodedFileName);
    } catch {
      return res.status(400).json({ error: "The image filename is invalid" });
    }

    const image = validateProductImageUpload({
      data: req.body,
      mimeType: req.get("content-type")?.split(";", 1)[0]?.trim() ?? "",
      originalFileName,
    });
    const existing = await prisma.siteAsset.findUnique({ where: { type: assetType } });
    newImageKey = await productImageStorage.saveSiteAsset(assetType, image);

    if (existing) {
      const updated = await prisma.siteAsset.updateMany({
        where: { id: existing.id, imageKey: existing.imageKey },
        data: { imageKey: newImageKey },
      });
      if (updated.count !== 1) {
        await productImageStorage.deleteSiteAsset(newImageKey);
        return res.status(409).json({ error: "The site asset changed during upload. Try again." });
      }
    } else {
      try {
        await prisma.siteAsset.create({ data: { type: assetType, imageKey: newImageKey } });
      } catch (error) {
        await productImageStorage.deleteSiteAsset(newImageKey);
        throw error;
      }
    }

    // The database now owns this key; later response/cleanup failures must not remove it.
    newImageKey = null;

    try {
      await productImageStorage.deleteSiteAsset(existing?.imageKey ?? null);
    } catch (cleanupError) {
      logServerError("Old site asset cleanup failed:", cleanupError);
    }
    res.json(await getPublicSiteConfiguration());
  } catch (error) {
    if (newImageKey) await productImageStorage.deleteSiteAsset(newImageKey).catch(() => undefined);
    if (error instanceof ProductImageValidationError) {
      return res.status(400).json({ error: error.message });
    }
    logServerError("Site asset upload failed:", error);
    return res.status(500).json({ error: "Site asset could not be saved" });
  }
});

router.delete("/assets/:assetType", async (req, res) => {
  try {
    const assetType = parseAssetType(req.params.assetType);
    if (!assetType) return res.status(404).json({ error: "Unknown site asset type" });
    const existing = await prisma.siteAsset.findUnique({ where: { type: assetType } });
    if (!existing) return res.json(await getPublicSiteConfiguration());

    const removed = await prisma.siteAsset.deleteMany({
      where: { id: existing.id, imageKey: existing.imageKey },
    });
    if (removed.count !== 1) {
      return res.status(409).json({ error: "The site asset changed during removal. Try again." });
    }
    try {
      await productImageStorage.deleteSiteAsset(existing.imageKey);
    } catch (cleanupError) {
      logServerError("Removed site asset cleanup failed:", cleanupError);
    }
    return res.json(await getPublicSiteConfiguration());
  } catch (error) {
    logServerError("Site asset removal failed:", error);
    return res.status(500).json({ error: "Site asset could not be removed" });
  }
});

export default router;
