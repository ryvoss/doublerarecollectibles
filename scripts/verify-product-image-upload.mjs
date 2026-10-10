import { readdir } from "node:fs/promises";
import path from "node:path";

const origin = "http://localhost:3002";
const firstPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const secondPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAAC0lEQVR42mP8/x8AAusB9Wl2nAAAAABJRU5ErkJggg==", "base64");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const listingsResponse = await fetch(`${origin}/api/products/public-listings`);
assert(listingsResponse.ok, "Admin public listings did not load");
const listings = await listingsResponse.json();
const product = listings.find((item) => item.publicVisible && item.imageUrl === null);
assert(product, "No public product without an image is available for a reversible smoke test");

let needsCleanup = false;
try {
  const rejected = await fetch(`${origin}/api/products/${product.id}/image`, {
    method: "PUT",
    headers: { "Content-Type": "image/png", "X-File-Name": "wrong.jpg" },
    body: firstPng,
  });
  assert(rejected.status === 400, "Mismatched file extension was not rejected");

  const rejectedSignature = await fetch(`${origin}/api/products/${product.id}/image`, {
    method: "PUT",
    headers: { "Content-Type": "image/png", "X-File-Name": "invalid.png" },
    body: Buffer.from("not an image"),
  });
  assert(rejectedSignature.status === 400, "Invalid image signature was not rejected");

  const rejectedSize = await fetch(`${origin}/api/products/${product.id}/image`, {
    method: "PUT",
    headers: { "Content-Type": "image/png", "X-File-Name": "oversized.png" },
    body: Buffer.alloc((8 * 1024 * 1024) + 1),
  });
  assert(rejectedSize.status === 413, "Oversized image was not rejected");

  const upload = await fetch(`${origin}/api/products/${product.id}/image`, {
    method: "PUT",
    headers: { "Content-Type": "image/png", "X-File-Name": "first.png" },
    body: firstPng,
  });
  const uploadBody = await upload.json();
  assert(upload.ok && typeof uploadBody.imageUrl === "string", "Initial upload failed");
  needsCleanup = true;
  const firstUrl = uploadBody.imageUrl;

  const servedFirst = await fetch(`${origin}${firstUrl}`);
  assert(servedFirst.ok, "Uploaded image was not publicly served");
  assert(servedFirst.headers.get("content-type") === "image/png", "Public image MIME type is incorrect");
  assert(servedFirst.headers.get("cache-control")?.includes("immutable"), "Public image cache header is missing");
  assert(Buffer.from(await servedFirst.arrayBuffer()).equals(firstPng), "Served upload bytes differ");

  const publicAfterUpload = await fetch(`${origin}/api/public/inventory`).then((response) => response.json());
  assert(publicAfterUpload.find((item) => item.id === product.id)?.imageUrl === firstUrl, "Public API did not return the uploaded image URL");

  const replace = await fetch(`${origin}/api/products/${product.id}/image`, {
    method: "PUT",
    headers: { "Content-Type": "image/png", "X-File-Name": "second.png" },
    body: secondPng,
  });
  const replaceBody = await replace.json();
  assert(replace.ok && replaceBody.imageUrl && replaceBody.imageUrl !== firstUrl, "Replacement did not create a new image URL");
  const secondUrl = replaceBody.imageUrl;
  assert((await fetch(`${origin}${firstUrl}`)).status === 404, "Replaced image remains publicly accessible");
  const servedSecond = await fetch(`${origin}${secondUrl}`);
  assert(servedSecond.ok && Buffer.from(await servedSecond.arrayBuffer()).equals(secondPng), "Replacement image was not served");

  const remove = await fetch(`${origin}/api/products/${product.id}/image`, { method: "DELETE" });
  assert(remove.ok, "Image removal failed");
  needsCleanup = false;
  assert((await fetch(`${origin}${secondUrl}`)).status === 404, "Removed image remains publicly accessible");
  const publicAfterRemoval = await fetch(`${origin}/api/public/inventory`).then((response) => response.json());
  assert(publicAfterRemoval.find((item) => item.id === product.id)?.imageUrl === null, "Public API did not return to the placeholder state");

  const productDirectory = path.resolve("uploads", "products", String(product.id));
  const remainingFiles = await readdir(productDirectory).catch(() => []);
  assert(remainingFiles.length === 0, "Local replacement/removal left image files behind");

  console.log(JSON.stringify({
    productId: product.id,
    invalidExtensionRejected: true,
    invalidSignatureRejected: true,
    oversizedUploadRejected: true,
    uploadServed: true,
    publicApiSafeUrl: true,
    immutableCacheHeader: true,
    replacementCleanedOldFile: true,
    removalRestoredPlaceholder: true,
    localFilesRemaining: remainingFiles.length,
  }, null, 2));
} finally {
  if (needsCleanup) {
    await fetch(`${origin}/api/products/${product.id}/image`, { method: "DELETE" });
  }
}
