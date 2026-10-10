import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  createProductImageStorage,
  S3ProductImageStorage,
  type SendS3StorageCommand,
  type StoredProductImage,
} from "./productImageStorage";

function inMemoryS3() {
  const objects = new Map<string, Buffer>();
  const commands: Array<PutObjectCommand | GetObjectCommand | DeleteObjectCommand> = [];
  const send: SendS3StorageCommand = async command => {
    commands.push(command);
    const key = command.input.Key;
    assert.equal(command.input.Bucket, "double-rare-images");
    if (typeof key !== "string") throw new Error("Expected an S3 object key");

    if (command instanceof PutObjectCommand) {
      assert.ok(command.input.Body instanceof Uint8Array);
      objects.set(key, Buffer.from(command.input.Body));
      return {};
    }
    if (command instanceof GetObjectCommand) {
      const data = objects.get(key);
      if (!data) throw new Error("No such key");
      return { Body: data, ContentLength: data.length };
    }
    objects.delete(key);
    return {};
  };
  return { commands, objects, send };
}

const image: StoredProductImage = {
  data: Buffer.from("test image bytes"),
  extension: "webp",
  mimeType: "image/webp",
};

test("local adapter remains available for development", async () => {
  const uploadsRoot = await mkdtemp(path.join(tmpdir(), "double-rare-images-"));
  try {
    const storage = createProductImageStorage({
      IMAGE_STORAGE_DRIVER: "local",
      LOCAL_UPLOADS_DIR: uploadsRoot,
      NODE_ENV: "development",
    });
    const key = await storage.saveProductImage(7, image);
    assert.deepEqual(await storage.readProductImage(key), image);
    await storage.deleteProductImage(key);
    await assert.rejects(storage.readProductImage(key));
  } finally {
    await rm(uploadsRoot, { recursive: true, force: true });
  }
});

test("S3 adapter saves, reads, and deletes product images behind the existing public URL", async () => {
  const memory = inMemoryS3();
  const storage = new S3ProductImageStorage("double-rare-images", memory.send);

  const key = await storage.saveProductImage(42, image);
  assert.match(key, /^products\/42\/[0-9a-f-]{36}\.webp$/);
  assert.equal(storage.getPublicUrl(key), `/api/public/product-images/42/${key.split("/").at(-1)}`);
  assert.deepEqual(await storage.readProductImage(key), image);
  assert.equal(memory.commands[0] instanceof PutObjectCommand, true);
  assert.equal((memory.commands[0] as PutObjectCommand).input.ContentType, "image/webp");

  await storage.deleteProductImage(key);
  assert.equal(memory.objects.has(key), false);
  await assert.rejects(storage.readProductImage(key), /No such key/);
});

test("S3 adapter uses the same key and backend URL behavior for private site assets", async () => {
  const memory = inMemoryS3();
  const storage = new S3ProductImageStorage("double-rare-images", memory.send);

  const key = await storage.saveSiteAsset("PRIMARY_LOGO", image);
  assert.match(key, /^site-assets\/primary-logo\/[0-9a-f-]{36}\.webp$/);
  assert.equal(storage.getPublicUrl(key), `/api/public/site-assets/primary-logo/${key.split("/").at(-1)}`);
  assert.deepEqual(await storage.readSiteAsset(key), image);

  await storage.deleteSiteAsset(key);
  assert.equal(memory.objects.has(key), false);
});

test("S3 factory validates private bucket configuration without exposing credentials", () => {
  assert.throws(
    () => createProductImageStorage({ IMAGE_STORAGE_DRIVER: "s3" }),
    /S3_BUCKET_NAME or BUCKET is required/,
  );
  assert.throws(
    () => createProductImageStorage({
      IMAGE_STORAGE_DRIVER: "s3",
      BUCKET: "double-rare-images",
      ENDPOINT: "not-a-url",
      ACCESS_KEY_ID: "access-key",
      SECRET_ACCESS_KEY: "secret-key",
    }),
    /must be a valid URL/,
  );

  const storage = createProductImageStorage({
    IMAGE_STORAGE_DRIVER: "s3",
    BUCKET: "double-rare-images",
    ENDPOINT: "https://example.storage.invalid",
    ACCESS_KEY_ID: "access-key",
    SECRET_ACCESS_KEY: "secret-key",
    REGION: "auto",
  });
  assert.ok(storage instanceof S3ProductImageStorage);
});
