// Isolated admin inventory visual review. Synthetic data only; no business database.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";


const root = process.cwd();
const output = await mkdtemp(path.join(os.tmpdir(), "double-rare-inventory-"));
const screenshots = path.join(output, "screenshots"); await mkdir(screenshots);
const items = [
  [1, "Gem 3 Box", 6, 0, 10], [2, "Gem 4 Box", 6, 20, 10],
  [3, "Empty product", 0, 0, 10], [4, "Healthy product", 40, 0, 10],
  [5, "Small restock with a longer collector product name", 2, 3, 10], [6, "Product-specific threshold", 6, 0, 4],
].map(([productId, productName, unitsOnHand, unitsInbound, reorderPoint]) => ({ productId, productName, itemId: `QA-${productId}`, productType: "SEALED", unitsOnHand, unitsInbound, reorderPoint, unitCost: unitsOnHand ? 12.5 : null, inventoryValue: (unitsOnHand + unitsInbound) * 12.5, onHandInventoryValue: unitsOnHand * 12.5, inboundInventoryValue: unitsInbound * 12.5, expectedSalePrice: 20, retailValue: unitsOnHand * 20, potentialGrossProfit: unitsOnHand * 7.5, batchCount: 1, packPoolCount: 0, unitType: "BOX", unitsPurchased: unitsOnHand + unitsInbound, unitsReceived: unitsOnHand, unitsSold: 0, packsPerBox: null, packDisplayName: null, defaultPackPrice: null }));
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const json = data => { res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(data)); };
  if (url.pathname === "/api/auth/session") return json({ authenticated: true });
  if (url.pathname === "/api/auth/csrf") return json({ csrfToken: "inventory-visual-qa-token-with-at-least-32-characters" });
  if (url.pathname === "/api/inventory") return json(items);
  if (/^\/api\/inventory\/\d+\/reorder-point$/.test(url.pathname) && req.method === "PATCH") {
    let data = ""; for await (const chunk of req) data += chunk;
    const item = items.find(item => item.productId === Number(url.pathname.split("/")[3]));
    item.reorderPoint = JSON.parse(data).reorderPoint;
    return json({ productId: item.productId, reorderPoint: item.reorderPoint });
  }
  if (/^\/api\/inventory\/\d+$/.test(url.pathname)) return json({ product: { id: Number(url.pathname.split("/")[3]) }, batches: [] });
  if (url.pathname.startsWith("/api/")) return json([]);
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
    await evaluate("window.scrollTo(0, 0)");
    await evaluate("Promise.all(document.getAnimations().filter(animation => animation.effect.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})))");
    // Full-page captures should include offscreen lazy images as well as the first row.
    await evaluate("Promise.all([...document.images].map(image => { image.loading = 'eager'; return image.decode().catch(() => {}); }))");
    const modal = name.includes("modal");
    const bounds = await evaluate(`({ width: innerWidth, height: ${name.includes("modal") ? "innerHeight" : "document.documentElement.scrollHeight"} })`);
    const image = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: !modal, ...(modal ? {} : { clip: { x: 0, y: 0, ...bounds, scale: 1 } }) });
    await writeFile(path.join(screenshots, `${name}.png`), Buffer.from(image.data, "base64"));
  };
  await call("Page.enable"); await call("Runtime.enable"); await call("DOM.enable"); await call("CSS.enable");
  for (const width of [375, 390, 430, 768, 1024, 1440]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    await call("Page.navigate", { url: base + "/admin" });
    await waitFor("[...document.querySelectorAll('button')].some(button => button.classList.contains('nav-item') && button.textContent.includes('Inventory'))");
    await evaluate("[...document.querySelectorAll('button')].find(button => button.classList.contains('nav-item') && button.textContent.includes('Inventory')).click()");
    await waitFor("document.querySelectorAll('.inventory-table .expandable-row').length === 6");
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Sort inventory\"]').value"), "onHandDesc");
    assert.equal(await evaluate("document.querySelector('.inventory-quick-filters [aria-pressed=true]').textContent"), "All");
    assert.match(await evaluate("document.querySelector('.inventory-table .expandable-row').textContent"), /Healthy product/);
    const layout = await evaluate("({ width: innerWidth, scroll: document.documentElement.scrollWidth, rowDisplay: getComputedStyle(document.querySelector('.inventory-table .expandable-row')).display })");
    assert.ok(layout.scroll <= width); assert.equal(layout.rowDisplay, width <= 900 ? "grid" : "table-row");
    if (width <= 900) assert.equal(await evaluate("getComputedStyle(document.querySelector('.inventory-table .expandable-row td')).paddingTop"), "0px");
    results.push(layout); await capture(`${width}-inventory`);
    await evaluate("document.querySelectorAll('.inventory-quick-filters button')[1].click()");
    await waitFor("document.querySelectorAll('.inventory-table .expandable-row').length === 3");
    await evaluate("document.querySelectorAll('.inventory-quick-filters button')[2].click()");
    await waitFor("document.querySelectorAll('.inventory-table .expandable-row').length === 2");
    await evaluate("document.querySelectorAll('.inventory-quick-filters button')[3].click()");
    await waitFor("document.querySelectorAll('.inventory-table .expandable-row').length === 1");
    await evaluate("document.querySelectorAll('.inventory-quick-filters button')[0].click()");
    await evaluate("document.querySelector('.inventory-row-actions summary').click(); [...document.querySelectorAll('.inventory-row-actions button')].find(button => button.textContent === 'Edit reorder point').click()");
    await waitFor("!!document.querySelector('.inventory-reorder-editor')");
    assert.ok(await evaluate("document.querySelector('.inventory-reorder-editor').contains(document.activeElement)"));
    await capture(`${width}-reorder-editor`);
    await evaluate("(() => { const input=document.querySelector('.inventory-reorder-editor input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '50'); input.dispatchEvent(new Event('input', { bubbles: true })); })()");
    await evaluate("document.querySelector('.inventory-reorder-editor').requestSubmit()");
    await waitFor("!document.querySelector('.inventory-reorder-editor')");
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Sort inventory\"]').value"), "onHandDesc");
    assert.equal(items.find(item => item.productId === 4).reorderPoint, 50);
    items.find(item => item.productId === 4).reorderPoint = 10;
  }
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, "results.json"), JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ output, layouts: results.length, errors }, null, 2));
} finally { socket?.close(); browser.kill(); await new Promise(resolve => server.close(resolve)); }
