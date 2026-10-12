import { logServerError } from "../security/logging";
import { Router } from "express";
import { prisma } from "../prisma";
import { productImageStorage } from "../services/productImageStorage";
import { getPublicSiteConfiguration } from "../services/siteConfiguration";
import type { SiteAssetType } from "../../shared/publicSite";
import { toPublicInventoryItem } from "../services/publicContracts";

const router = Router();

router.get("/site", async (_req, res) => {
  try {
    res.json(await getPublicSiteConfiguration());
  } catch (error) {
    logServerError("Error retrieving public site configuration:", error);
    res.status(500).json({ error: "Public site configuration could not be loaded" });
  }
});

router.get("/site-assets/:assetSlug/:fileName", async (req, res) => {
  const assetTypes: Record<string, SiteAssetType> = {
    "primary-logo": "PRIMARY_LOGO",
    favicon: "FAVICON",
    "hero-image": "HERO_IMAGE",
  };
  const assetType = assetTypes[req.params.assetSlug];
  const fileName = req.params.fileName;
  if (!assetType || typeof fileName !== "string") return res.status(404).end();

  const imageKey = `site-assets/${req.params.assetSlug}/${fileName}`;
  try {
    const asset = await prisma.siteAsset.findFirst({
      where: { type: assetType, imageKey },
      select: { id: true },
    });
    if (!asset) return res.status(404).end();

    const image = await productImageStorage.readSiteAsset(imageKey);
    res.set({
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(image.data.length),
      "Content-Type": image.mimeType,
      "X-Content-Type-Options": "nosniff",
    });
    return res.send(image.data);
  } catch {
    return res.status(404).end();
  }
});

router.get("/product-images/:productId/:fileName", async (req, res) => {
  const productId = Number(req.params.productId);
  const fileName = req.params.fileName;
  if (!Number.isSafeInteger(productId) || productId <= 0 || typeof fileName !== "string") {
    return res.status(404).end();
  }

  const imageKey = `products/${productId}/${fileName}`;
  try {
    // Only serve a generated key that is still assigned to this Product.
    const product = await prisma.product.findFirst({
      where: { id: productId, imageKey },
      select: { id: true },
    });
    if (!product) return res.status(404).end();

    const image = await productImageStorage.readProductImage(imageKey);
    res.set({
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(image.data.length),
      "Content-Type": image.mimeType,
      "X-Content-Type-Options": "nosniff",
    });
    return res.send(image.data);
  } catch {
    return res.status(404).end();
  }
});

router.get("/inventory", async (_req, res) => {
  try {
    // This intentionally does not reuse the internal inventory response.
    // The narrow select and explicit mapping form the public data boundary.
    const products = await prisma.product.findMany({
      where: {
        publicVisible: true,
        active: true,
        sellable: true,
      },
      select: {
        id: true,
        name: true,
        displayName: true,
        shortDescription: true,
        imageKey: true,
        publicPrice: true,
        expectedSalePrice: true,
        featured: true,
        inventoryBatches: {
          select: {
            quantityReceived: true,
            quantitySold: true,
            quantityConverted: true,
          },
        },
      },
      orderBy: [
        { featured: "desc" },
        { name: "asc" },
      ],
    });

    const inventory = products.map((product) => toPublicInventoryItem(
      product,
      productImageStorage.getPublicUrl(product.imageKey),
    ));

    res.json(inventory);
  } catch (error) {
    logServerError("Error retrieving public inventory:", error);
    res.status(500).json({
      error: "Public inventory could not be loaded",
    });
  }
});

export default router;
