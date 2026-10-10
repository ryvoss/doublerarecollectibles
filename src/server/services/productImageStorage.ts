import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SiteAssetType } from "../../shared/publicSite";

export const MAX_PRODUCT_IMAGE_BYTES = 8 * 1024 * 1024;

type SupportedImage = {
  extension: "jpg" | "png" | "webp";
  mimeType: "image/jpeg" | "image/png" | "image/webp";
};

export type StoredProductImage = SupportedImage & {
  data: Buffer;
};

export interface ProductImageStorage {
  saveProductImage(productId: number, image: StoredProductImage): Promise<string>;
  saveSiteAsset(assetType: SiteAssetType, image: StoredProductImage): Promise<string>;
  deleteProductImage(imageKey: string | null): Promise<void>;
  deleteSiteAsset(imageKey: string | null): Promise<void>;
  readProductImage(imageKey: string): Promise<StoredProductImage>;
  readSiteAsset(imageKey: string): Promise<StoredProductImage>;
  getPublicUrl(imageKey: string | null): string | null;
}

export class ProductImageValidationError extends Error {}

const IMAGE_KEY_PATTERN = /^products\/([1-9]\d*)\/([0-9a-f-]{36})\.(jpg|png|webp)$/;
const SITE_ASSET_KEY_PATTERN = /^site-assets\/(primary-logo|favicon|hero-image)\/([0-9a-f-]{36})\.(jpg|png|webp)$/;
const SITE_ASSET_SLUGS: Record<SiteAssetType, string> = {
  PRIMARY_LOGO: "primary-logo",
  FAVICON: "favicon",
  HERO_IMAGE: "hero-image",
};

function supportedImageForMime(mimeType: string): SupportedImage | null {
  if (mimeType === "image/jpeg") return { mimeType, extension: "jpg" };
  if (mimeType === "image/png") return { mimeType, extension: "png" };
  if (mimeType === "image/webp") return { mimeType, extension: "webp" };
  return null;
}

function hasExpectedSignature(data: Buffer, extension: SupportedImage["extension"]) {
  if (extension === "jpg") {
    return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  }
  if (extension === "png") {
    return data.length >= 8 && data.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  }
  return data.length >= 12 &&
    data.subarray(0, 4).toString("ascii") === "RIFF" &&
    data.subarray(8, 12).toString("ascii") === "WEBP";
}

export function validateProductImageUpload({
  data,
  mimeType,
  originalFileName,
}: {
  data: Buffer;
  mimeType: string;
  originalFileName: string;
}): StoredProductImage {
  if (data.length === 0) {
    throw new ProductImageValidationError("Choose a non-empty image file");
  }
  if (data.length > MAX_PRODUCT_IMAGE_BYTES) {
    throw new ProductImageValidationError("Product images must be 8 MB or smaller");
  }

  const supportedImage = supportedImageForMime(mimeType.toLowerCase());
  if (!supportedImage) {
    throw new ProductImageValidationError("Product images must be JPEG, PNG, or WebP");
  }

  const suppliedExtension = path.extname(path.basename(originalFileName)).toLowerCase();
  const acceptedExtensions = supportedImage.extension === "jpg"
    ? new Set([".jpg", ".jpeg"])
    : new Set([`.${supportedImage.extension}`]);
  if (!acceptedExtensions.has(suppliedExtension)) {
    throw new ProductImageValidationError("The image filename extension does not match its MIME type");
  }
  if (!hasExpectedSignature(data, supportedImage.extension)) {
    throw new ProductImageValidationError("The uploaded file content does not match its declared image type");
  }

  return { ...supportedImage, data };
}

class LocalProductImageStorage implements ProductImageStorage {
  private readonly uploadsRoot = path.resolve(process.cwd(), "uploads");

  private filePath(imageKey: string) {
    if (!IMAGE_KEY_PATTERN.test(imageKey) && !SITE_ASSET_KEY_PATTERN.test(imageKey)) {
      throw new Error("Invalid image key");
    }
    const resolvedPath = path.resolve(this.uploadsRoot, ...imageKey.split("/"));
    if (!resolvedPath.startsWith(`${this.uploadsRoot}${path.sep}`)) {
      throw new Error("Invalid product image path");
    }
    return resolvedPath;
  }

  async saveProductImage(productId: number, image: StoredProductImage) {
    if (!Number.isSafeInteger(productId) || productId <= 0) {
      throw new Error("Invalid product ID");
    }
    const imageKey = `products/${productId}/${randomUUID()}.${image.extension}`;
    const destination = this.filePath(imageKey);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, image.data, { flag: "wx" });
    return imageKey;
  }

  async saveSiteAsset(assetType: SiteAssetType, image: StoredProductImage) {
    const assetSlug = SITE_ASSET_SLUGS[assetType];
    if (!assetSlug) throw new Error("Invalid site asset type");
    const imageKey = `site-assets/${assetSlug}/${randomUUID()}.${image.extension}`;
    const destination = this.filePath(imageKey);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, image.data, { flag: "wx" });
    return imageKey;
  }

  async deleteProductImage(imageKey: string | null) {
    if (!imageKey) return;
    const imagePath = this.filePath(imageKey);
    await rm(imagePath, { force: true });
  }

  async deleteSiteAsset(imageKey: string | null) {
    return this.deleteProductImage(imageKey);
  }

  private async readImage(imageKey: string, pattern: RegExp, extensionIndex: number): Promise<StoredProductImage> {
    const match = pattern.exec(imageKey);
    if (!match) throw new Error("Invalid image key");
    const extension = match[extensionIndex] as SupportedImage["extension"];
    const mimeType: SupportedImage["mimeType"] = extension === "jpg"
      ? "image/jpeg"
      : extension === "png"
        ? "image/png"
        : "image/webp";
    return {
      extension,
      mimeType,
      data: await readFile(this.filePath(imageKey)),
    };
  }

  async readProductImage(imageKey: string): Promise<StoredProductImage> {
    return this.readImage(imageKey, IMAGE_KEY_PATTERN, 3);
  }

  async readSiteAsset(imageKey: string): Promise<StoredProductImage> {
    return this.readImage(imageKey, SITE_ASSET_KEY_PATTERN, 3);
  }

  getPublicUrl(imageKey: string | null) {
    if (!imageKey) return null;
    const match = IMAGE_KEY_PATTERN.exec(imageKey);
    if (match) {
      return `/api/public/product-images/${match[1]}/${match[2]}.${match[3]}`;
    }
    const siteAssetMatch = SITE_ASSET_KEY_PATTERN.exec(imageKey);
    if (siteAssetMatch) {
      return `/api/public/site-assets/${siteAssetMatch[1]}/${siteAssetMatch[2]}.${siteAssetMatch[3]}`;
    }
    return null;
  }
}

// This is the storage boundary: replace this implementation with S3/R2 later
// without changing product/site routes, API response mapping, or storefront code.
export const productImageStorage: ProductImageStorage = new LocalProductImageStorage();
