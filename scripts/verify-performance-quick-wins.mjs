// Real React effects with synthetic responses only: no business API or database.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const output = await mkdtemp(path.join(os.tmpdir(), "double-rare-quick-wins-"));
await build({ stdin: { contents: `
import React from 'react';
import { createRoot } from 'react-dom/client';
import Reports from './src/client/pages/ReportsPage';
import App from './src/App';
import Editor from './src/client/components/StorefrontContentManager';
import { PublicCatalogProvider, usePublicCatalog } from './src/client/public/PublicCatalog';
window.React = React;
const root = createRoot(document.getElementById('root'));
const editor = createRoot(document.getElementById('editor'));
window.requests = [];
window.pending = [];
window.holdPerformance = false;
window.failReference = false;
const emptyPerformance = revenue => ({totals:{revenue,cogs:0,grossProfit:0,grossMargin:0,unitsSold:0,saleCount:0},products:[],trends:[],shows:[],visits:[],pack:{summary:{},products:[]}});
window.fetch = async (url, init = {}) => {
  const record = {url:String(url), signal:init.signal, method:init.method || 'GET'};
  window.requests.push(record);
  if (String(url).startsWith('/api/reports/performance')) {
    if (window.holdPerformance) return new Promise(resolve => window.pending.push(revenue => resolve(Response.json(emptyPerformance(revenue)))));
    return Response.json(emptyPerformance(0));
  }
  if (url === '/api/auth/csrf') return Response.json({csrfToken:'x'.repeat(40)});
  if (url === '/api/site/content') return Response.json({categories:[],news:[],announcements:[]});
  if (url === '/api/health') return Response.json({status:'ok'});
  if (url === '/api/funds/summary') return Response.json({sealedBalance:'0', singlesBalance:'0',totalBusinessFunds:'0'});
  if (window.failReference && url === '/api/inventory') return Response.json({error:'Reference fixture failure'}, {status:400});
  if (record.method !== 'GET') return Response.json({ok:true});
  return Response.json([]);
};
window.mount = kind => {
  root.render(kind === 'reports' ? <Reports/> : kind === 'admin' ? <App/> : null);
};
window.mountEditor = () => editor.render(<Editor kind="categories"/>);
function CatalogState() { const catalog = usePublicCatalog(); return <span id="catalog-state">{catalog.loading ? 'loading' : 'ready'}</span>; }
window.catalog = pathname => root.render(<PublicCatalogProvider pathname={pathname}><CatalogState/></PublicCatalogProvider>);
window.change = (selector, value) => {
  const element = document.querySelector(selector);
  const prototype = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
  element.dispatchEvent(new Event('input', {bubbles:true}));
  element.dispatchEvent(new Event('change', {bubbles:true}));
};
window.ready = true;
`, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, define: { 'import.meta.env.MODE': '"test"' }, outfile: path.join(output, "fixture.js"), platform: "browser", format: "esm", logLevel: "silent" });

const server = createServer(async (req, res) => {
  if (req.url === "/fixture.js") { res.setHeader("Content-Type", "text/javascript"); res.end(await readFile(path.join(output, "fixture.js"))); }
  else res.end('<div id="root"></div><div id="editor"></div><script type="module" src="/fixture.js"></script>');
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const chrome = process.env.STOREFRONT_QA_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browser = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", "--disable-background-networking", "--disable-extensions", `--user-data-dir=${path.join(output, "profile")}`, "--remote-debugging-port=0", "about:blank"], { windowsHide: true, stdio: "ignore" });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = (await readFile(path.join(output, "profile/DevToolsActivePort"), "utf8")).split("\n")[0]; break; }
    catch { await pause(100); }
  }
  if (!port) throw new Error("Local Chrome did not start");
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(res => res.json());
  socket = new WebSocket(targets.find(target => target.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0; const pending = new Map();
  socket.onmessage = ({data}) => {
    const message = JSON.parse(data);
    if (!message.id) return;
    const request = pending.get(message.id); pending.delete(message.id);
    message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result);
  };
  const call = (method, params) => new Promise((resolve, reject) => {
    const next = ++id; pending.set(next, {resolve, reject}); socket.send(JSON.stringify({id:next, method, params}));
  });
  const evaluate = async expression => {
    const result = await call("Runtime.evaluate", {expression, awaitPromise:true, returnByValue:true});
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const waitFor = async expression => {
    for (let i = 0; i < 100; i++) { if (await evaluate(`Boolean(${expression})`)) return; await pause(30); }
    throw new Error(`Timed out: ${expression}; ${await evaluate("document.body.innerText")} `);
  };
  const count = url => evaluate(`requests.filter(r => r.url === ${JSON.stringify(url)}).length`);
  await call("Page.navigate", {url:`http://127.0.0.1:${server.address().port}`});
  await waitFor("window.ready");
  await evaluate("mount('reports')");
  await waitFor("document.querySelector('.report-metrics')");
  assert.equal(await count("/api/inventory"), 1);
  await evaluate("holdPerformance = true; change('.report-filters select', 'month')");
  await waitFor("pending.length === 1");
  await evaluate("change('.report-filters select', 'year')");
  await waitFor("pending.length === 2");
  assert.equal(await evaluate("requests.filter(r=>r.url.startsWith('/api/reports/performance'))[1].signal.aborted"), true);
  await evaluate("pending[1](222)");
  await waitFor("document.querySelector('.report-metrics')?.textContent.includes('$222.00')");
  await evaluate("pending[0](111)"); await pause(100);
  assert.equal(await evaluate("document.querySelector('.report-metrics').textContent.includes('$222.00')"), true);
  for (const url of ["/api/inventory", "/api/funds/summary", "/api/products", "/api/shows"]) assert.equal(await count(url), 1);
  await evaluate("holdPerformance = false; window.dispatchEvent(new Event('business-data-changed'))");
  await waitFor("requests.filter(r=>r.url==='/api/inventory').length === 2 && document.querySelector('.report-metrics')");
  for (const url of ["/api/funds/summary", "/api/products", "/api/shows"]) assert.equal(await count(url), 2);
  await evaluate("failReference = true; window.dispatchEvent(new Event('business-data-changed'))");
  await waitFor("document.querySelector('[role=alert]')?.textContent.includes('Reference fixture failure')");
  await evaluate("failReference = false; document.querySelector('[role=alert] button').click()");
  await waitFor("document.querySelector('.report-metrics') && !document.querySelector('[role=alert]')");
  console.log('PASS Reports: filter isolation, performance refresh, abort, stale response, business refresh, error/retry');

  await evaluate("mount('none')"); await pause(50);
  await evaluate("requests = []; window.clock = 100000; Date.now = () => clock; catalog('/')");
  await waitFor("document.querySelector('#catalog-state')?.textContent === 'ready'");
  await evaluate("clock += 59000; window.dispatchEvent(new Event('focus'))"); await pause(60);
  assert.equal(await count("/api/public/inventory"), 1);
  await evaluate("catalog('/inventory')");
  await waitFor("requests.length === 2 && document.querySelector('#catalog-state')?.textContent === 'ready'");
  await evaluate("clock += 2000; window.dispatchEvent(new Event('focus'))"); await pause(60);
  assert.equal(await count("/api/public/inventory"), 2);
  await evaluate("clock += 60000; window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange'))");
  await waitFor("requests.length === 3 && document.querySelector('#catalog-state')?.textContent === 'ready'");
  assert.equal(await count("/api/public/inventory"), 3);
  console.log('PASS Catalog: success timestamp, fresh focus, stale focus, navigation resets freshness');

  await evaluate("mount('none')"); await pause(50);
  await evaluate("requests = []; mount('admin'); mountEditor()");
  await waitFor("document.querySelector('#editor form') && requests.some(r=>r.url==='/api/inventory')");
  await pause(100);
  const inventoryBefore = await count("/api/inventory");
  await evaluate("change('#editor input:not([type])', 'Fixture category')"); await pause(40);
  await evaluate(`change('#editor input[maxlength="100"]', 'fixture-category')`); await pause(40);
  await evaluate("document.querySelector('#editor form').requestSubmit()");
  await waitFor("requests.some(r=>r.method==='POST' && r.url==='/api/site/content/categories')");
  await waitFor("document.querySelector('#editor').textContent.includes('Saved.')");
  assert.equal(await count("/api/inventory"), inventoryBefore);
  await evaluate("window.dispatchEvent(new Event('business-data-changed'))");
  await waitFor(`requests.filter(r=>r.url==='/api/inventory').length === ${inventoryBefore + 1}`);
  console.log('PASS Admin: actual editorial save avoids inventory reload; business mutation event refreshes inventory');
  console.log(JSON.stringify({result:"PASS", fixtures:output, databaseAccess:false}));
} finally {
  socket?.close(); browser.kill(); await new Promise(resolve => server.close(resolve));
}
