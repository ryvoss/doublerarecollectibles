import assert from "node:assert/strict";
import test from "node:test";
import { ProductImageConflictError, replaceProductImage } from "./productImageReplacement";
import type { ProductImageStorage, StoredProductImage } from "./productImageStorage";

const image: StoredProductImage = { data: Buffer.from("image"), extension: "png", mimeType: "image/png" };

function fakeStorage() {
  const keys = new Set(["products/2/old.png"]);
  const storage: ProductImageStorage = {
    saveProductImage: async () => { const key = "products/2/new.png"; keys.add(key); return key; },
    saveSiteAsset: async () => "",
    deleteProductImage: async (key) => { if (key) keys.delete(key); },
    deleteSiteAsset: async () => undefined,
    readProductImage: async () => image,
    readSiteAsset: async () => image,
    getPublicUrl: (key) => key ? `/api/public/product-images/2/${key.split("/").at(-1)}` : null,
  };
  return { keys, storage };
}

test("replacement commits the new key before removing the old object", async () => {
  const { keys, storage } = fakeStorage();
  const order: string[] = [];
  const originalDelete = storage.deleteProductImage;
  storage.deleteProductImage = async (key) => { order.push(`delete:${key}`); await originalDelete(key); };
  const key = await replaceProductImage({
    currentImageKey: "products/2/old.png",
    image,
    productId: 2,
    storage,
    updateImageKey: async (newKey) => { order.push(`commit:${newKey}`); return true; },
  });
  assert.equal(key, "products/2/new.png");
  assert.deepEqual(order, ["commit:products/2/new.png", "delete:products/2/old.png"]);
  assert.equal(keys.has("products/2/new.png"), true);
  assert.equal(keys.has("products/2/old.png"), false);
});

test("failed replacement keeps the old object and removes the uncommitted new object", async () => {
  const { keys, storage } = fakeStorage();
  await assert.rejects(replaceProductImage({
    currentImageKey: "products/2/old.png",
    image,
    productId: 2,
    storage,
    updateImageKey: async () => false,
  }), ProductImageConflictError);
  assert.equal(keys.has("products/2/old.png"), true);
  assert.equal(keys.has("products/2/new.png"), false);
});

test("storage failure never calls the database update", async () => {
  const { keys, storage } = fakeStorage();
  storage.saveProductImage = async () => { throw new Error("upload failed"); };
  let updated = false;
  await assert.rejects(replaceProductImage({
    currentImageKey: "products/2/old.png",
    image,
    productId: 2,
    storage,
    updateImageKey: async () => { updated = true; return true; },
  }), /upload failed/);
  assert.equal(updated, false);
  assert.equal(keys.has("products/2/old.png"), true);
});
