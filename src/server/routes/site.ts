import { Router } from "express";
import {
  PUBLIC_SITE_DEFAULTS,
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
const settingsLimits: Record<keyof PublicSiteSettings, number> = {
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
};

function parseAssetType(value: string | string[]): SiteAssetType | null {
  return typeof value === "string" && siteAssetTypes.has(value as SiteAssetType)
    ? value as SiteAssetType
    : null;
}

function validateSettings(value: unknown): PublicSiteSettings | string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "Site settings are required";
  }
  const input = value as Record<string, unknown>;
  const expectedFields = Object.keys(PUBLIC_SITE_DEFAULTS) as Array<keyof PublicSiteSettings>;
  if (Object.keys(input).some((key) => !expectedFields.includes(key as keyof PublicSiteSettings))) {
    return "Unknown site setting";
  }

  const settings = {} as PublicSiteSettings;
  for (const field of expectedFields) {
    const fieldValue = input[field];
    if (typeof fieldValue !== "string") return `${field} must be text`;
    const normalized = fieldValue.trim();
    if (field !== "contactEmail" && normalized.length === 0) return `${field} cannot be blank`;
    if (normalized.length > settingsLimits[field]) return `${field} is too long`;
    settings[field] = normalized;
  }

  try {
    const instagramUrl = new URL(settings.instagramUrl);
    if (instagramUrl.protocol !== "https:" && instagramUrl.protocol !== "http:") {
      return "Instagram URL must use http or https";
    }
  } catch {
    return "Enter a valid Instagram URL";
  }
  if (settings.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.contactEmail)) {
    return "Enter a valid contact email";
  }
  return settings;
}

router.get("/", async (_req, res) => {
  try {
    res.json(await getPublicSiteConfiguration());
  } catch (error) {
    console.error("Site Manager configuration loading failed:", error);
    res.status(500).json({ error: "Site configuration could not be loaded" });
  }
});

router.put("/settings", async (req, res) => {
  try {
    const settings = validateSettings(req.body?.settings);
    if (typeof settings === "string") return res.status(400).json({ error: settings });

    await prisma.siteSettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...settings },
      update: settings,
    });
    res.json(await getPublicSiteConfiguration());
  } catch (error) {
    console.error("Site settings update failed:", error);
    res.status(500).json({ error: "Site settings could not be saved" });
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
      console.error("Old site asset cleanup failed:", cleanupError);
    }
    res.json(await getPublicSiteConfiguration());
  } catch (error) {
    if (newImageKey) await productImageStorage.deleteSiteAsset(newImageKey).catch(() => undefined);
    if (error instanceof ProductImageValidationError) {
      return res.status(400).json({ error: error.message });
    }
    console.error("Site asset upload failed:", error);
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
      console.error("Removed site asset cleanup failed:", cleanupError);
    }
    return res.json(await getPublicSiteConfiguration());
  } catch (error) {
    console.error("Site asset removal failed:", error);
    return res.status(500).json({ error: "Site asset could not be removed" });
  }
});

export default router;
