import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
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

type S3StorageCommand = PutObjectCommand | GetObjectCommand | DeleteObjectCommand;
export type SendS3StorageCommand = (command: S3StorageCommand) => Promise<unknown>;

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

function productImageKey(productId: number, image: StoredProductImage) {
  if (!Number.isSafeInteger(productId) || productId <= 0) throw new Error("Invalid product ID");
  return `products/${productId}/${randomUUID()}.${image.extension}`;
}

function siteAssetKey(assetType: SiteAssetType, image: StoredProductImage) {
  const assetSlug = SITE_ASSET_SLUGS[assetType];
  if (!assetSlug) throw new Error("Invalid site asset type");
  return `site-assets/${assetSlug}/${randomUUID()}.${image.extension}`;
}

function imageTypeForKey(imageKey: string, pattern: RegExp, extensionIndex: number): SupportedImage {
  const match = pattern.exec(imageKey);
  if (!match) throw new Error("Invalid image key");
  const extension = match[extensionIndex] as SupportedImage["extension"];
  return {
    extension,
    mimeType: extension === "jpg" ? "image/jpeg" : extension === "png" ? "image/png" : "image/webp",
  };
}

function assertKnownImageKey(imageKey: string) {
  if (!IMAGE_KEY_PATTERN.test(imageKey) && !SITE_ASSET_KEY_PATTERN.test(imageKey)) {
    throw new Error("Invalid image key");
  }
}

function publicImageUrl(imageKey: string | null): string | null {
  if (!imageKey) return null;
  const productMatch = IMAGE_KEY_PATTERN.exec(imageKey);
  if (productMatch) {
    return `/api/public/product-images/${productMatch[1]}/${productMatch[2]}.${productMatch[3]}`;
  }
  const siteAssetMatch = SITE_ASSET_KEY_PATTERN.exec(imageKey);
  if (siteAssetMatch) {
    return `/api/public/site-assets/${siteAssetMatch[1]}/${siteAssetMatch[2]}.${siteAssetMatch[3]}`;
  }
  return null;
}

async function objectBodyToBuffer(body: unknown): Promise<Buffer> {
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (!body || typeof body !== "object") throw new Error("Stored image has no readable body");

  if ("transformToByteArray" in body && typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }

  if (Symbol.asyncIterator in body) {
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array | string>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  throw new Error("Stored image has an unsupported body type");
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
  private readonly uploadsRoot: string;

  constructor(uploadsRoot = process.env.LOCAL_UPLOADS_DIR ?? "uploads") {
    this.uploadsRoot = path.resolve(process.cwd(), uploadsRoot);
  }

  private filePath(imageKey: string) {
    assertKnownImageKey(imageKey);
    const resolvedPath = path.resolve(this.uploadsRoot, ...imageKey.split("/"));
    if (!resolvedPath.startsWith(`${this.uploadsRoot}${path.sep}`)) {
      throw new Error("Invalid product image path");
    }
    return resolvedPath;
  }

  async saveProductImage(productId: number, image: StoredProductImage) {
    const imageKey = productImageKey(productId, image);
    const destination = this.filePath(imageKey);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, image.data, { flag: "wx" });
    return imageKey;
  }

  async saveSiteAsset(assetType: SiteAssetType, image: StoredProductImage) {
    const imageKey = siteAssetKey(assetType, image);
    const destination = this.filePath(imageKey);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, image.data, { flag: "wx" });
    return imageKey;
  }

  async deleteProductImage(imageKey: string | null) {
    if (!imageKey) return;
    await rm(this.filePath(imageKey), { force: true });
  }

  async deleteSiteAsset(imageKey: string | null) {
    return this.deleteProductImage(imageKey);
  }

  private async readImage(imageKey: string, pattern: RegExp, extensionIndex: number): Promise<StoredProductImage> {
    const imageType = imageTypeForKey(imageKey, pattern, extensionIndex);
    return { ...imageType, data: await readFile(this.filePath(imageKey)) };
  }

  async readProductImage(imageKey: string): Promise<StoredProductImage> {
    return this.readImage(imageKey, IMAGE_KEY_PATTERN, 3);
  }

  async readSiteAsset(imageKey: string): Promise<StoredProductImage> {
    return this.readImage(imageKey, SITE_ASSET_KEY_PATTERN, 3);
  }

  getPublicUrl(imageKey: string | null) {
    return publicImageUrl(imageKey);
  }
}

export class S3ProductImageStorage implements ProductImageStorage {
  private readonly bucket: string;
  private readonly sendCommand: SendS3StorageCommand;

  constructor(
    bucket: string,
    sendCommand: SendS3StorageCommand,
  ) {
    if (!bucket.trim()) throw new Error("S3 bucket name is required");
    this.bucket = bucket;
    this.sendCommand = sendCommand;
  }

  private async saveImage(imageKey: string, image: StoredProductImage) {
    assertKnownImageKey(imageKey);
    await this.sendCommand(new PutObjectCommand({
      Bucket: this.bucket,
      Key: imageKey,
      Body: image.data,
      ContentType: image.mimeType,
      CacheControl: "public, max-age=31536000, immutable",
    }));
    return imageKey;
  }

  async saveProductImage(productId: number, image: StoredProductImage) {
    return this.saveImage(productImageKey(productId, image), image);
  }

  async saveSiteAsset(assetType: SiteAssetType, image: StoredProductImage) {
    return this.saveImage(siteAssetKey(assetType, image), image);
  }

  private async deleteImage(imageKey: string | null) {
    if (!imageKey) return;
    assertKnownImageKey(imageKey);
    await this.sendCommand(new DeleteObjectCommand({ Bucket: this.bucket, Key: imageKey }));
  }

  async deleteProductImage(imageKey: string | null) {
    return this.deleteImage(imageKey);
  }

  async deleteSiteAsset(imageKey: string | null) {
    return this.deleteImage(imageKey);
  }

  private async readImage(imageKey: string, pattern: RegExp, extensionIndex: number): Promise<StoredProductImage> {
    const imageType = imageTypeForKey(imageKey, pattern, extensionIndex);
    const response = await this.sendCommand(new GetObjectCommand({ Bucket: this.bucket, Key: imageKey })) as {
      Body?: unknown;
      ContentLength?: number;
    };
    if (response.ContentLength !== undefined && response.ContentLength > MAX_PRODUCT_IMAGE_BYTES) {
      throw new Error("Stored image exceeds the supported size");
    }
    const data = await objectBodyToBuffer(response.Body);
    if (data.length > MAX_PRODUCT_IMAGE_BYTES) throw new Error("Stored image exceeds the supported size");
    return { ...imageType, data };
  }

  async readProductImage(imageKey: string): Promise<StoredProductImage> {
    return this.readImage(imageKey, IMAGE_KEY_PATTERN, 3);
  }

  async readSiteAsset(imageKey: string): Promise<StoredProductImage> {
    return this.readImage(imageKey, SITE_ASSET_KEY_PATTERN, 3);
  }

  getPublicUrl(imageKey: string | null) {
    return publicImageUrl(imageKey);
  }
}

function requiredS3Setting(
  environment: NodeJS.ProcessEnv,
  primaryName: string,
  railwayName: string,
) {
  const value = environment[primaryName] ?? environment[railwayName];
  if (!value?.trim()) throw new Error(`${primaryName} or ${railwayName} is required for S3 image storage.`);
  return value.trim();
}

function parseForcePathStyle(value: string | undefined) {
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new Error("S3_FORCE_PATH_STYLE must be true or false.");
}

export function createProductImageStorage(
  environment: NodeJS.ProcessEnv = process.env,
): ProductImageStorage {
  const driver = environment.IMAGE_STORAGE_DRIVER ?? "local";
  if (driver === "local") {
    if (environment.NODE_ENV === "production") {
      console.warn(
        "IMAGE_STORAGE_DRIVER=local uses ephemeral application storage. Use IMAGE_STORAGE_DRIVER=s3 for durable production images.",
      );
    }
    return new LocalProductImageStorage(environment.LOCAL_UPLOADS_DIR);
  }
  if (driver === "s3") {
    const bucket = requiredS3Setting(environment, "S3_BUCKET_NAME", "BUCKET");
    const endpoint = requiredS3Setting(environment, "S3_ENDPOINT", "ENDPOINT");
    const accessKeyId = requiredS3Setting(environment, "S3_ACCESS_KEY_ID", "ACCESS_KEY_ID");
    const secretAccessKey = requiredS3Setting(environment, "S3_SECRET_ACCESS_KEY", "SECRET_ACCESS_KEY");
    const region = (environment.S3_REGION ?? environment.REGION ?? "auto").trim();
    let endpointUrl: URL;
    try {
      endpointUrl = new URL(endpoint);
    } catch {
      throw new Error("S3_ENDPOINT or ENDPOINT must be a valid URL.");
    }
    if (endpointUrl.protocol !== "https:" && endpointUrl.protocol !== "http:") {
      throw new Error("S3_ENDPOINT or ENDPOINT must use http or https.");
    }

    const client = new S3Client({
      endpoint: endpointUrl.toString(),
      region: region || "auto",
      forcePathStyle: parseForcePathStyle(environment.S3_FORCE_PATH_STYLE),
      credentials: { accessKeyId, secretAccessKey },
    });
    return new S3ProductImageStorage(bucket, command => client.send(command));
  }
  throw new Error(`Unsupported IMAGE_STORAGE_DRIVER: ${driver}`);
}

// Storage-provider boundary: Product/site routes and storefront response types
// remain unchanged when switching between local files and private S3 storage.
export const productImageStorage: ProductImageStorage = createProductImageStorage();
