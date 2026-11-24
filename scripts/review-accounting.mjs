// Isolated accounting visual review. Synthetic data only; no business database.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";



const root = process.cwd();
const output = await mkdtemp(path.join(os.tmpdir(), "double-rare-accounting-"));
const screenshots = path.join(output, "screenshots"); await mkdir(screenshots);
let expense = {id:1,date:"2026-11-23",description:"Belleville booth fee",category:"Show / Booth",amount:"150.00",paidFrom:"SINGLES_CASH",version:1,voidedAt:null};
const mutations=[];
function report() {
 const common={date:"2026-11-23",createdAt:"2026-11-23T12:00:00Z",detail:"Authoritative financial record. Inventory purchases are separate from operating expenses."};
 const rows=[{...common,id:"SALE-1",sourceType:"SALE",sourceId:1,type:"Revenue",description:"SALE-0104",category:"Sales",amount:"425.00",paymentMethod:"DIGITAL",referenceLabel:"SALE-0104"},{...common,id:"FUND-1",sourceType:"ORDER",sourceId:1,type:"Inventory Purchase",description:"Inventory order ORD-0018",category:"Inventory",amount:"-2350.00",paymentMethod:"SEALED",referenceLabel:"ORD-0018",detail:"Inventory acquired $3380.00; supplier credit $1030.00; cash paid $2350.00."}];
 if (expense) rows.unshift({...common,id:"EXPENSE-1",sourceType:"BUSINESS_EXPENSE",sourceId:1,type:"Operating Expense",description:expense.description,category:expense.category,amount:"-"+expense.amount,paymentMethod:expense.paidFrom,referenceLabel:"Expense #1",expense});
 return {from:"2026-11-01",to:"2026-11-30",rows,summary:{revenue:"425.00",cogs:"250.00",grossProfit:"175.00",expenses:expense?.amount ?? "0",netOperatingProfit:String(175-Number(expense?.amount ?? 0)),inventoryPurchases:"3380.00",inventoryCashPaid:"2350.00",netCashMovement:"-2075.00"}};
}
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const json = data => { res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(data)); };
  if (url.pathname === "/api/auth/session") return json({ authenticated: true });
  if (url.pathname === "/api/auth/csrf") return json({ csrfToken: "inventory-visual-qa-token-with-at-least-32-characters" });
  if (url.pathname === "/api/accounting/ledger") return json(report());
  if (url.pathname.startsWith("/api/accounting/expenses") && req.method !== "GET") {
    mutations.push(req.method);let body="";for await (const chunk of req) body+=chunk;
    const input=JSON.parse(body);
    if(req.method === "DELETE") expense=null;
    else expense={id:1,voidedAt:null,...input,version:(expense?.version ?? 0)+1};
    return json(expense ?? {});
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
    await waitFor("[...document.querySelectorAll('.nav-item')].some(button=>button.textContent.includes('Accounting'))");
    await evaluate("[...document.querySelectorAll('.nav-item')].find(button=>button.textContent.includes('Accounting')).click()");
    await waitFor("document.querySelectorAll('.accounting-page tbody tr').length === 3");
    const layout=await evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth})");assert.ok(layout.scroll<=width,JSON.stringify(layout));results.push(layout);
    await capture(`${width}-accounting`);
    assert.equal(await evaluate("document.querySelector('.accounting-filters select').value"),"This Month");
    await evaluate("(() => {const select=document.querySelectorAll('.accounting-filters select')[1];select.value='Operating Expense';select.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await waitFor("document.querySelectorAll('.accounting-page tbody tr').length === 1");
    await evaluate("document.querySelector('.accounting-page tbody button').click()");
    await waitFor("document.querySelector('.expense-dialog').open");
    assert.equal(await evaluate("document.querySelectorAll('.expense-dialog label').length"),5);
    await capture(`${width}-expense-modal`);
    await evaluate("(() => {const input=document.querySelector('.expense-dialog input[type=number]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'175.00');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await evaluate("document.querySelector('.expense-dialog form').requestSubmit()");
    await waitFor("!document.querySelector('.expense-dialog').open && document.querySelector('.accounting-page tbody')?.textContent.includes('$175.00')");
    assert.equal(expense.amount,"175.00");expense.amount="150.00";
  }
  assert.equal(mutations.length,6);
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, "results.json"), JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ output, layouts: results.length, errors }, null, 2));
} finally { socket?.close(); browser.kill(); await new Promise(resolve => server.close(resolve)); }
