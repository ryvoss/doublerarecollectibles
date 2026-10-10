import { readdir } from "node:fs/promises";
import path from "node:path";

const origin = "http://localhost:3002";
const firstPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const secondPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAAC0lEQVR42mP8/x8AAusB9Wl2nAAAAABJRU5ErkJggg==", "base64");
const assets = [
  ["PRIMARY_LOGO", "primaryLogoUrl", "primary-logo"],
  ["FAVICON", "faviconUrl", "favicon"],
  ["HERO_IMAGE", "heroImageUrl", "hero-image"],
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function json(url, options) {
  const response = await fetch(`${origin}${url}`, options);
  const body = await response.json().catch(() => null);
  return { response, body };
}

const initial = await json("/api/site");
assert(initial.response.ok && initial.body?.settings && initial.body?.assets, "Admin site configuration did not load");
const originalSettings = initial.body.settings;
const publicInitial = await json("/api/public/site");
assert(publicInitial.response.ok, "Public site configuration did not load");
assert(JSON.stringify(publicInitial.body) === JSON.stringify(initial.body), "Public configuration differs from the safe admin configuration");
assert(assets.every(([, field]) => initial.body.assets[field] === null), "A site asset already exists; refusing destructive smoke test");

let settingsNeedRestore = false;
const assetsNeedingCleanup = new Set();
try {
  const rejectedSettings = await json("/api/site/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings: { ...originalSettings, internalOnly: "blocked" } }),
  });
  assert(rejectedSettings.response.status === 400, "Unknown setting was not rejected");

  const changedSettings = { ...originalSettings, heroTitle: `${originalSettings.heroTitle} Test` };
  const saved = await json("/api/site/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings: changedSettings }),
  });
  assert(saved.response.ok && saved.body.settings.heroTitle === changedSettings.heroTitle, "Admin settings update failed");
  settingsNeedRestore = true;
  const publicChanged = await json("/api/public/site");
  assert(publicChanged.body.settings.heroTitle === changedSettings.heroTitle, "Public endpoint did not reflect saved settings");

  for (const [assetType, responseField] of assets) {
    const upload = await json(`/api/site/assets/${assetType}`, {
      method: "PUT",
      headers: { "Content-Type": "image/png", "X-File-Name": "asset.png" },
      body: firstPng,
    });
    assert(upload.response.ok && upload.body.assets[responseField], `${assetType} upload failed`);
    assetsNeedingCleanup.add(assetType);
    const firstUrl = upload.body.assets[responseField];
    assert(firstUrl.startsWith("/api/public/site-assets/"), `${assetType} exposed an unsafe URL`);
    const served = await fetch(`${origin}${firstUrl}`);
    assert(served.ok && served.headers.get("cache-control")?.includes("immutable"), `${assetType} was not served with immutable caching`);

    const replace = await json(`/api/site/assets/${assetType}`, {
      method: "PUT",
      headers: { "Content-Type": "image/png", "X-File-Name": "replacement.png" },
      body: secondPng,
    });
    const secondUrl = replace.body.assets[responseField];
    assert(replace.response.ok && secondUrl && secondUrl !== firstUrl, `${assetType} replacement failed`);
    assert((await fetch(`${origin}${firstUrl}`)).status === 404, `${assetType} old URL remains available after replacement`);

    const remove = await json(`/api/site/assets/${assetType}`, { method: "DELETE" });
    assert(remove.response.ok && remove.body.assets[responseField] === null, `${assetType} removal failed`);
    assetsNeedingCleanup.delete(assetType);
    assert((await fetch(`${origin}${secondUrl}`)).status === 404, `${assetType} URL remains available after removal`);
  }

  const restored = await json("/api/site/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings: originalSettings }),
  });
  assert(restored.response.ok, "Original settings could not be restored");
  settingsNeedRestore = false;

  const publicFinal = await json("/api/public/site");
  assert(JSON.stringify(publicFinal.body.settings) === JSON.stringify(originalSettings), "Public settings were not restored");
  assert(assets.every(([, field]) => publicFinal.body.assets[field] === null), "Public asset fallback was not restored");

  const siteAssetRoot = path.resolve("uploads", "site-assets");
  const files = [];
  for (const [, , slug] of assets) {
    files.push(...await readdir(path.join(siteAssetRoot, slug)).catch(() => []));
  }
  assert(files.length === 0, "Site asset replacement/removal left files behind");

  console.log(JSON.stringify({
    seededSettingsLoaded: true,
    unknownSettingsRejected: true,
    settingsReachedPublicEndpoint: true,
    assetTypesTested: assets.map(([type]) => type),
    uploadReplaceRemovePassed: true,
    safePublicUrls: true,
    immutableCaching: true,
    fallbacksRestored: true,
    localFilesRemaining: files.length,
  }, null, 2));
} finally {
  for (const assetType of assetsNeedingCleanup) {
    await fetch(`${origin}/api/site/assets/${assetType}`, { method: "DELETE" });
  }
  if (settingsNeedRestore) {
    await fetch(`${origin}/api/site/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: originalSettings }),
    });
  }
}
