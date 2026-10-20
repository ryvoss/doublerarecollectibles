// Isolated visual QA: serves the production build with synthetic public data.
// Never starts the business API, connects to PostgreSQL, or uses a personal browser profile.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

const root = process.cwd();
const output = await mkdtemp(path.join(os.tmpdir(), "double-rare-storefront-"));
const screenshots = path.join(output, "screenshots"); await mkdir(screenshots);
const { PUBLIC_SITE_DEFAULTS } = await import("../src/shared/publicSite.ts");
const { publicEditorial } = await import("../src/shared/storefrontContent.ts");
const show = { name: "Collector Expo", date: "2026-10-24T00:00:00Z", venue: "Community Hall", location: "St. Louis, MO", boothInfo: "Table 18", note: "Come browse the collection and say hello." };
const products = ["Booster Box", "Collector Collection Box — A Longer Product Name", "Blind Box", "Booster Pack", "Collector Accessories", "Special Collection"].map((name, index) => ({ id: index + 1, name, shortDescription: "Synthetic layout fixture. Ask us about this product.", imageUrl: index === 5 ? null : `/api/public/product-images/${index + 1}/qa.png`, displayPrice: index === 5 ? null : [45, 139.99, 39, 8, 24, 99][index], compareAtPrice: index === 2 ? 45 : null, recentPriceDrop: index === 2, featured: index < 2, availability: ["IN_STOCK", "LOW_STOCK", "IN_STOCK", "COMING_SOON", "SOLD_OUT", "IN_STOCK"][index], moreArrivingSoon: index === 0 }));
const categories = ["Booster Boxes", "Blind Boxes", "Packs", "Accessories", "Special Collections"].map((name, index) => ({ id: index + 1, name, slug: name.toLowerCase().replaceAll(" ", "-"), visible: true, sortOrder: index, productIds: [index + 1] }));
const news = [{ id: 1, title: "From our table to your collection", slug: "from-our-table", summary: "A quick update from Double Rare, with what to look for at the next show.", body: "There is always something new to discover. Ask us questions, compare a few favorites, or tell us what you collect.\n\nPlanning a gift? We are happy to help you find a starting point.", imageUrl: "/api/public/product-images/1/qa.png", published: true, publishAt: "2026-10-18T12:00:00Z" }];
const announcements = [
  { type: "PRICE_DROP", title: "A fresh look at recent drops", summary: "See products with a recent price drop.", destination: "RECENT_DROPS", destinationSlug: null },
  { type: "UPCOMING_SHOW", title: "Find us at Collector Expo", summary: "October 24 · Community Hall · Table 18", destination: "SHOWS", destinationSlug: null },
  { type: "NEWS", title: "From our table to yours", summary: "A short update for collectors and curious newcomers.", destination: "NEWS", destinationSlug: "from-our-table" },
  { type: "NEW_RELEASE", title: "Explore the collection", summary: "A closer look at the latest public listings.", destination: "INVENTORY", destinationSlug: null },
].map((item, index) => ({ ...item, id: index + 1, imageUrl: null, published: true, sortOrder: index, startsAt: null, endsAt: null }));
const config = { settings: PUBLIC_SITE_DEFAULTS, assets: { primaryLogoUrl: "/qa-logo.svg", faviconUrl: null, heroImageUrl: null }, nextShow: show, upcomingShows: [show, { ...show, name: "Regional Card Show", date: "2026-11-08T00:00:00Z" }] };
const content = { categories, news, announcements };
const media = (text, width = 180, height = 230) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect x="6" y="6" width="${width - 12}" height="${height - 12}" rx="5" fill="#283842" stroke="#bba271" stroke-width="3"/><rect x="18" y="18" width="${width - 36}" height="${height - 36}" rx="2" fill="none" stroke="#91a5ac"/><text x="50%" y="44%" fill="#e5d1a6" font-family="sans-serif" font-size="24" text-anchor="middle">DR</text><text x="50%" y="58%" fill="#e3e6e4" font-family="sans-serif" font-size="12" text-anchor="middle">${text}</text><text x="50%" y="72%" fill="#c0c9c9" font-family="sans-serif" font-size="10" text-anchor="middle">LAYOUT FIXTURE</text></svg>`;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const json = (data, status = 200) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(data)); };
  if (url.pathname === "/api/public/site" || url.pathname === "/api/site") return json(config);
  if (url.pathname === "/api/public/inventory") return json(products);
  if (url.pathname === "/api/public/editorial") return json(publicEditorial(content, products.map((item) => item.id)));
  if (url.pathname === "/api/public/news") return json({ posts: news.map(({ body, id, published, ...post }) => post), hasMore: false });
  if (url.pathname === "/api/public/news/from-our-table") { const { id, published, ...post } = news[0]; return json(post); }
  if (url.pathname.startsWith("/api/public/product-images/")) { res.writeHead(200, { "Content-Type": "image/svg+xml" }); return res.end(media("Collector fixture", url.pathname.includes("/2/") ? 260 : 180, url.pathname.includes("/2/") ? 160 : 230)); }
  if (url.pathname === "/qa-logo.svg") { res.writeHead(200, { "Content-Type": "image/svg+xml" }); return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="140" height="100"><rect x="1" y="1" width="138" height="98" fill="#131517" stroke="#c9af78"/><text x="70" y="62" font-family="sans-serif" font-size="44" text-anchor="middle" fill="#e8d4a7">DR</text></svg>'); }
  if (url.pathname === "/api/auth/session") return json({ authenticated: true });
  if (url.pathname === "/api/auth/csrf") return json({ csrfToken: "visual-qa-only" });
  if (url.pathname === "/api/site/content") return json(content);
  if (url.pathname === "/api/site/shows") return json([]);
  if (url.pathname === "/api/products/public-listings") return json(products.map((product) => ({ ...product, internalName: product.name, publicVisible: true, publicPrice: product.displayPrice, expectedSalePrice: product.displayPrice, stockStatus: product.availability })));
  if (url.pathname.startsWith("/api/")) return json([], 404);
  try {
    const filePath = url.pathname.startsWith("/assets/") ? path.resolve(root, "dist", `.${url.pathname}`) : path.resolve(root, "dist/index.html");
    if (!filePath.startsWith(path.resolve(root, "dist") + path.sep)) throw new Error("Invalid path");
    const data = await readFile(filePath);
    res.writeHead(200, { "Content-Type": filePath.endsWith(".css") ? "text/css" : filePath.endsWith(".js") ? "text/javascript" : "text/html" }); res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const chrome = process.env.STOREFRONT_QA_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browser = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-extensions", `--user-data-dir=${path.join(output, "chrome-profile")}`, "--remote-debugging-port=0", "about:blank"], { windowsHide: true, stdio: "ignore" });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let socket;
const results = [];
try {
  let port;
  for (let i = 0; i < 100; i++) { try { port = (await readFile(path.join(output, "chrome-profile/DevToolsActivePort"), "utf8")).split("\n")[0]; break; } catch { await pause(100); } }
  if (!port) throw new Error("Headless Chrome did not start");
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
  socket = new WebSocket(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let nextId = 0; const pending = new Map(); const errors = [];
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text + ": " + message.params.exceptionDetails.exception?.description);
    if (message.id) { const request = pending.get(message.id); pending.delete(message.id); message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result); }
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => {
    const value = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description ?? value.exceptionDetails.text);
    return value.result.value;
  };
  const waitFor = async (expression) => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await pause(50); } throw new Error(`Timed out: ${expression}`); };
  const capture = async (name) => {
    await evaluate("Promise.all(document.getAnimations().filter(animation => animation.effect.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})))");
    const image = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: !name.includes('modal') });
    await writeFile(path.join(screenshots, `${name}.png`), Buffer.from(image.data, "base64"));
  };
  await call("Page.enable"); await call("Runtime.enable");
  for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height: width < 768 ? 844 : 1000, deviceScaleFactor: 1, mobile: false });
    for (const [route, label, selector] of [["/", "home", ".public-catalog-card"], ["/inventory", "inventory", ".public-catalog-card"], ["/shows", "shows", ".public-show-card"], ["/buy-sell-trade", "bst", ".public-bst-options"], ["/news", "news", ".public-news-card"], ["/news/from-our-table", "article", ".public-news-article"]]) {
      await call("Page.navigate", { url: base + route });
      await waitFor(`!!document.querySelector(${JSON.stringify(selector)})`);
      await evaluate("document.fonts.ready"); await pause(100);
      const layout = await evaluate(`(() => { const grid = document.querySelector('.public-catalog-grid'); return { width: innerWidth, documentWidth: document.documentElement.scrollWidth, columns: grid ? getComputedStyle(grid).gridTemplateColumns : null, font: getComputedStyle(document.querySelector('.public-site')).fontFamily, imagesContained: [...document.querySelectorAll('.product-image-frame__image')].every(image => getComputedStyle(image).objectFit === 'contain') }; })()`);
      assert.ok(layout.documentWidth <= width, `Horizontal overflow: ${width}px ${route}: ${layout.documentWidth}`);
      assert.ok(layout.imagesContained);
      if (label === "article") assert.match(await evaluate("document.title"), /From our table to your collection/);
      if (gridRoute(label)) assert.ok(await evaluate("[...document.querySelectorAll('.public-catalog-card__action')].every(button => button.getBoundingClientRect().height >= 44)"));
      if (gridRoute(label) && width >= 375 && width <= 430) assert.equal(layout.columns.split(" ").length, 2);
      results.push({ width, route, ...layout });
      await capture(`${width}-${label}`);
      if (label === "inventory") {
        await evaluate("document.querySelector('.public-catalog-card__open').click()");
        await waitFor("!!document.querySelector('[role=dialog]')");
        const dialog = await evaluate("(() => { const dialog=document.querySelector('[role=dialog]'); const r=dialog.getBoundingClientRect(); return { width:r.width,height:r.height, viewportHeight:innerHeight, viewportWidth:innerWidth, inside:dialog.contains(document.activeElement) }; })()");
        assert.ok(dialog.width <= width && dialog.height <= dialog.viewportHeight); assert.ok(dialog.inside);
        await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", modifiers: 8 });
        await call("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", modifiers: 8 });
        assert.ok(await evaluate("document.querySelector('[role=dialog]').contains(document.activeElement)"));
        await capture(`${width}-modal`);
        await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
        await call("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
        await waitFor("!document.querySelector('[role=dialog]')");
        if (width === 375) {
          await evaluate("document.querySelector('.public-catalog-card__open').click()");
          await waitFor("!!document.querySelector('.public-product-detail-modal')");
          products[0].availability = "SOLD_OUT";
          await evaluate("window.qaOriginalNow = Date.now; Date.now = () => window.qaOriginalNow() + 61000; window.dispatchEvent(new Event('focus'))");
          await waitFor("document.querySelector('.public-product-detail__status')?.textContent.includes('Sold Out')");
          products[0].availability = "IN_STOCK";
          await evaluate("Date.now = () => window.qaOriginalNow() + 122000; window.dispatchEvent(new Event('focus'))");
          await waitFor("document.querySelector('.public-product-detail__status')?.textContent.includes('In Stock')");
          await evaluate("Date.now = window.qaOriginalNow; delete window.qaOriginalNow");
          await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
          await call("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
          await waitFor("!document.querySelector('[role=dialog]')");
        }
        await waitFor("document.activeElement?.classList.contains('public-catalog-card__open')");
        await evaluate("document.querySelector('a[href=\"/inventory?category=booster-boxes\"]').click()");
        await waitFor("document.querySelectorAll('.public-catalog-card').length === 1");
        await evaluate("document.querySelector('.public-category-navigation a[href=\"/inventory\"]').click()");
        await waitFor("document.querySelectorAll('.public-catalog-card').length === 6");
        await evaluate("document.querySelector('.public-filter-link').click()");
        await waitFor("document.querySelectorAll('.public-catalog-card').length === 1 && document.querySelector('.public-catalog-card h2').textContent === 'Blind Box'");
        await evaluate("document.querySelector('.public-category-navigation a[href=\"/inventory\"]').click()");
        await waitFor("document.querySelectorAll('.public-catalog-card').length === 6");
        await evaluate("document.querySelector('.public-catalog-card__action').click()");
        await waitFor("!!document.querySelector('.public-contact-modal')");
        await capture(`${width}-contact-modal`);
        const contactBounds = await evaluate("(() => { const r=document.querySelector('.public-contact-modal').getBoundingClientRect(); return {top:r.top,bottom:r.bottom,height:innerHeight}; })()");
        assert.ok(contactBounds.top >= 0 && contactBounds.bottom <= contactBounds.height, `Contact dialog outside viewport at ${width}px`);
        assert.match(await evaluate("document.querySelector('.public-contact-product-context').textContent"), /Booster Box/);
        await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
        await call("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
        await waitFor("!document.querySelector('[role=dialog]')");
      }
    }
  }
  // Mobile menu and keyboard focus behavior.
  await call("Emulation.setDeviceMetricsOverride", { width: 375, height: 844, deviceScaleFactor: 1, mobile: false });
  await call("Page.navigate", { url: base }); await waitFor("!!document.querySelector('.public-menu-button')");
  await evaluate("document.querySelector('.public-menu-button').click()");
  await waitFor("!!document.activeElement?.closest('#public-mobile-navigation')");
  await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await waitFor("document.activeElement?.classList.contains('public-menu-button')");
  await evaluate("document.querySelector('.public-horizontal-rail').focus()");
  await call("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight" });
  await call("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight" });
  await waitFor("document.querySelector('.public-horizontal-rail').scrollLeft > 0");
  await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await evaluate("document.querySelector('.public-catalog-card__open').click()");
  await waitFor("!!document.querySelector('.public-product-detail-backdrop')");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.public-product-detail-backdrop')).animationName"), "none");
  await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await call("Emulation.setEmulatedMedia", { features: [] });
  // Review the actual Storefront editor without submitting any forms.
  for (const width of [375, 1440]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    await call("Page.navigate", { url: base + "/admin" });
    await waitFor("[...document.querySelectorAll('button')].some(button => button.textContent.includes('Storefront'))");
    await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent.includes('Storefront')).click()");
    await waitFor("!!document.querySelector('.site-manager-tabs')");
    for (const [tab, kind] of [["Categories", "categories"], ["Announcements", "announcements"], ["News & Updates", "news"]]) {
      await evaluate(`[...document.querySelectorAll('.site-manager-tabs button')].find(button => button.textContent === ${JSON.stringify(tab)}).click()`);
      await waitFor("!!document.querySelector('.storefront-editor-fields')");
      await waitFor("document.querySelectorAll('.storefront-editor-list button').length > 1");
      await evaluate("document.querySelectorAll('.storefront-editor-list button')[1].click()");
      await capture(`${width}-admin-${kind}`);
      const overflow = await evaluate("document.documentElement.scrollWidth > innerWidth");
      assert.equal(overflow, false, `Admin content overflow at ${width}px ${kind}`);
    }
  }
  assert.deepEqual(errors, [], `Browser runtime errors: ${errors.join('\n')}`);
  await writeFile(path.join(output, "results.json"), JSON.stringify({ base, results, runtimeErrors: errors }, null, 2));
  console.log(JSON.stringify({ output, screenshots, reviewedLayouts: results.length, runtimeErrors: errors.length }, null, 2));
} finally { socket?.close(); browser.kill(); await new Promise((resolve) => server.close(resolve)); }

function gridRoute(label) { return label === "home" || label === "inventory"; }
