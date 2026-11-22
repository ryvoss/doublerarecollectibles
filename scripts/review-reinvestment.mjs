// Isolated reinvestment insights visual review. Synthetic data only; no business database.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";


import { scoreInvestment, rankInvestments } from "../src/server/reporting/reinvestment.ts";
const root = process.cwd();
const output = await mkdtemp(path.join(os.tmpdir(), "double-rare-reinvestment-"));
const screenshots = path.join(output, "screenshots"); await mkdir(screenshots);
const seed = { productId: 1, productName: "Gem 4 Box", itemId: "QA-1", onHand: 0, inbound: 0, reorderPoint: 10, units30: 20, unitsPrevious60: 40, revenue: 1500, cogs: 1000, grossProfit: 500, transactions30: 8, sellingDays30: 8, daysSinceLastSale: 2, historyDays: 60, costsReconcile: true, unitsPerCase: 20 };
const changes = [{}, {productId:2,productName:"Gem 3 Box - restock inbound",inbound:24}, {productId:3,productName:"New release",units30:0,unitsPrevious60:0,historyDays:null}, {productId:4,productName:"Slow-moving collector box",units30:1}, {productId:5,productName:"Overstock product",onHand:100}, {productId:6,productName:"Modest opportunity with a long product name",units30:2,unitsPrevious60:4,revenue:19,cogs:16,grossProfit:3,sellingDays30:1,daysSinceLastSale:25}];
let mode = "normal";
const mutations = [];
function report(horizon) {
  const items = mode === "empty" ? [] : rankInvestments(changes.map(change => scoreInvestment({...seed,...change},horizon)));
  return {asOf:"2026-11-22",currentFrom:"2026-10-24",previousFrom:"2026-08-25",horizon,items,topOpportunities:items.filter(item=>item.actionable).slice(0,5)};
}
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const json = data => { res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(data)); };
  if (url.pathname === "/api/auth/session") return json({ authenticated: true });
  if (url.pathname === "/api/auth/csrf") return json({ csrfToken: "inventory-visual-qa-token-with-at-least-32-characters" });
  if (req.method !== "GET") { mutations.push(req.method + " " + url.pathname); res.writeHead(405); return res.end(); }
  if (url.pathname === "/api/reports/reinvestment") {
    if (mode === "error") {res.writeHead(503); return res.end();}
    return json(report(Number(url.searchParams.get("horizon") ?? 30)));
  }
  if (url.pathname === "/api/reports/performance") return json({totals:{revenue:0,cogs:0,grossProfit:0,grossMargin:0,unitsSold:0,saleCount:0},trends:[],products:[],shows:[],visits:[]});
  if (url.pathname === "/api/funds/summary") return json({totalBusinessFunds:0,sealedBalance:0,singlesBalance:0});
  if (url.pathname === "/api/reports/business-position") return json({supplierCreditBalance:0,totalBusinessValue:0});
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
    await waitFor("[...document.querySelectorAll('.nav-item')].some(button => button.textContent.includes('Reports'))");
    await evaluate("[...document.querySelectorAll('.nav-item')].find(button => button.textContent.includes('Reports')).click()");
    await waitFor("!!document.querySelector('.report-tabs')");
    await evaluate("[...document.querySelectorAll('.report-tabs button')].find(button => button.textContent === 'Reinvestment Insights').click()");
    await waitFor("document.querySelectorAll('.investment-row').length === 6");
    assert.equal(await evaluate("document.querySelectorAll('.investment-winners li').length"), 2);
    assert.ok(!await evaluate("document.querySelector('.investment-winners').textContent.includes('restock inbound')"));
    const layout = await evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth})");
    assert.ok(layout.scroll <= width, JSON.stringify(layout)); results.push(layout);
    await capture(`${width}-insights`);
    await evaluate("document.querySelector('.investment-winners button').click()");
    await waitFor("!!document.querySelector('#investment-detail-1')");
    await waitFor("document.activeElement.id === 'investment-product-1'");
    assert.ok(await evaluate("document.querySelector('#investment-detail-1').textContent.includes('$1,000.00')"));
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
    await capture(`${width}-detail`);
    await evaluate("document.querySelectorAll('.investment-filters button')[2].click()");
    await waitFor("document.querySelectorAll('.investment-row').length === 1");
    assert.match(await evaluate("document.querySelector('.investment-row').textContent"), /WAIT - STOCK INBOUND/);
    await evaluate("document.querySelectorAll('.investment-filters button')[1].click()");
    await waitFor("document.querySelectorAll('.investment-row').length === 2");
    await evaluate("document.querySelectorAll('.investment-filters button')[3].click()");
    await waitFor("document.querySelectorAll('.investment-row').length === 2");
    await evaluate("document.querySelectorAll('.investment-filters button')[4].click()");
    await waitFor("document.querySelectorAll('.investment-row').length === 1");
    await evaluate("document.querySelectorAll('.investment-filters button')[0].click()");
    await evaluate("(() => { const select = document.querySelector('.investment-heading select'); select.value='60'; select.dispatchEvent(new Event('change',{bubbles:true})); })()");
    await waitFor("document.querySelector('.investment-winners .investment-buy')?.textContent === 'Buy 38-48 units'");
    assert.match(await evaluate("document.querySelector('#investment-product-1').textContent"), /98\/100/);
    assert.equal(await evaluate("document.querySelector('.investment-row .investment-grade').textContent"), "A");
  }
  mode = "empty";
  await evaluate("document.querySelector('.investment-heading button').click()");
  await waitFor("document.querySelector('.investment-winners')?.textContent.includes('No actionable purchases')");
  assert.ok(await evaluate("document.querySelector('.investment-list').textContent === ''"));
  mode = "error";
  await evaluate("document.querySelector('.investment-heading button').click()");
  await waitFor("!!document.querySelector('.reinvestment-insights [role=alert]')");
  mode = "normal";
  await evaluate("document.querySelector('.reinvestment-insights [role=alert] button').click()");
  await waitFor("document.querySelectorAll('.investment-row').length === 6");
  assert.deepEqual(mutations, []);
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, "results.json"), JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ output, layouts: results.length, errors }, null, 2));
} finally { socket?.close(); browser.kill(); await new Promise(resolve => server.close(resolve)); }
