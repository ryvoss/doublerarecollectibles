// Real React/browser checks with synthetic responses. No business API or DB.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const output = await mkdtemp(path.join(os.tmpdir(), "double-rare-sale-corrections-"));
await build({ stdin: { contents: `
import React from 'react';
import { createRoot } from 'react-dom/client';
import Actions from './src/client/components/ShowSaleActions';
import './src/App.css';
window.React = React;
window.requests = []; window.refreshes = 0; window.rejectSave = false;
window.addEventListener('business-data-changed', () => refreshes++);
window.fetch = async (url, init = {}) => {
  const method = init.method || 'GET';
  requests.push({url, method, body: init.body ? JSON.parse(init.body) : null});
  if (url === '/api/auth/csrf') return Response.json({csrfToken:'a'.repeat(40)});
  if (url === '/api/products') return Response.json([{id:1,name:'Gem Box',active:true,sellable:true,type:'SEALED',unitType:'BOX'}, {id:2,name:'Other Box',active:true,sellable:true,type:'SEALED',unitType:'BOX'}]);
  if (method !== 'GET') return rejectSave ? Response.json({error:'This sale cannot be edited because the Show has been finalized.'},{status:409}) : Response.json({ok:true});
  return Response.json({revision:'b'.repeat(64),sale:{saleNumber:'SALE-0001',paymentMethod:'CASH',notes:'Original notes',lines:[{productId:1,quantity:2,unitSalePrice:'75.00',product:{name:'Gem Box'}}]}});
};
const root = createRoot(document.getElementById('root'));
window.mount = locked => root.render(<Actions saleId={1} locked={locked}/>);
window.change = (selector, value) => {
  const element = document.querySelector(selector);
  const prototype = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
  element.dispatchEvent(new Event('input', {bubbles:true})); element.dispatchEvent(new Event('change', {bubbles:true}));
};
mount(false); window.ready = true;
`, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, outfile: path.join(output, "fixture.js"), platform: "browser", format: "esm", logLevel: "silent" });
const server = createServer(async (req, res) => {
  if (req.url === "/fixture.js" || req.url === "/fixture.css") {
    res.setHeader("Content-Type", req.url.endsWith("css") ? "text/css" : "text/javascript");
    res.end(await readFile(path.join(output, req.url.slice(1))));
  } else { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end('<!doctype html><link rel="stylesheet" href="/fixture.css"><div id="root" style="padding:24px"></div><script type="module" src="/fixture.js"></script>'); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = spawn(process.env.STOREFRONT_QA_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--disable-gpu", "--no-first-run", "--disable-background-networking", "--disable-extensions", `--user-data-dir=${path.join(output, "profile")}`, "--remote-debugging-port=0", "about:blank"], { windowsHide: true, stdio: "ignore" });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = (await readFile(path.join(output, "profile/DevToolsActivePort"), "utf8")).split("\n")[0]; break; } catch { await pause(100); }
  }
  if (!port) throw new Error("Local Chrome did not start");
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
  socket = new WebSocket(targets.find(target => target.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0; const pending = new Map();
  socket.onmessage = ({ data }) => { const message = JSON.parse(data); if (!message.id) return; const task = pending.get(message.id); pending.delete(message.id); message.error ? task.reject(new Error(JSON.stringify(message.error))) : task.resolve(message.result); };
  const call = (method, params) => new Promise((resolve, reject) => { const next = ++id; pending.set(next, {resolve,reject}); socket.send(JSON.stringify({id:next,method,params})); });
  const evaluate = async expression => { const result = await call("Runtime.evaluate", {expression,awaitPromise:true,returnByValue:true}); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text); return result.result.value; };
  const waitFor = async expression => { for (let i = 0; i < 100; i++) { if (await evaluate(`Boolean(${expression})`)) return; await pause(30); } throw new Error(`Timed out: ${expression}: ${await evaluate("document.body.innerText")}`); };
  const click = text => evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent===${JSON.stringify(text)}).click()`);
  const open = async mode => { await evaluate("document.querySelector('summary').click()"); await click(mode); await waitFor("document.querySelector('dialog[open] form')"); };
  await call("Page.navigate", {url:`http://127.0.0.1:${server.address().port}`});
  await waitFor("window.ready && document.querySelector('summary')");
  await open("Edit");
  assert.equal(await evaluate("document.querySelector('input[type=number]').value"), "2");
  assert.equal(await evaluate("document.querySelector('textarea').value"), "Original notes");
  assert.equal(await evaluate("document.querySelector('dialog').contains(document.activeElement)"), true);
  await evaluate("change('input[type=number]', '1')"); await pause(50);
  await click("Review Changes"); await waitFor("document.querySelector('dialog').textContent.includes('Revenue: $150.00 → $75.00')");
  for (const width of [375, 1440]) {
    await call("Emulation.setDeviceMetricsOverride", {width,height:900,deviceScaleFactor:1,mobile:false});
    assert.equal(await evaluate("document.querySelector('dialog').getBoundingClientRect().right <= innerWidth"), true);
    const screenshot = await call("Page.captureScreenshot", {format:"png"});
    await writeFile(path.join(output, `review-${width}.png`), Buffer.from(screenshot.data, "base64"));
  }
  await click("Confirm Update"); await waitFor("!document.querySelector('dialog') && refreshes === 1");
  assert.equal(await evaluate("requests.find(r=>r.method==='PATCH').body.lines[0].quantity"), 1);
  assert.deepEqual(await evaluate("Object.keys(requests.find(r=>r.method==='PATCH').body).sort()"), ["lines","notes","paymentMethod","revision"]);
  await open("Delete"); await click("Cancel"); await waitFor("!document.querySelector('dialog')");
  assert.equal(await evaluate("requests.filter(r=>r.method==='DELETE').length"), 0);
  await open("Delete"); await click("Delete Sale"); await waitFor("!document.querySelector('dialog') && refreshes === 2");
  assert.deepEqual(await evaluate("Object.keys(requests.find(r=>r.method==='DELETE').body)"), ["revision"]);
  await evaluate("rejectSave = true"); await open("Edit"); await click("Review Changes"); await click("Confirm Update");
  await waitFor("document.querySelector('[role=alert]')?.textContent.includes('Show has been finalized')");
  assert.equal(await evaluate("refreshes"), 2);
  await click("Cancel"); await waitFor("!document.querySelector('dialog')");
  assert.equal(await evaluate("document.activeElement.tagName"), "SUMMARY");
  await open("Edit");
  await call("Input.dispatchKeyEvent", {type:"keyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
  await call("Input.dispatchKeyEvent", {type:"keyUp",key:"Escape",code:"Escape",windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
  await waitFor("!document.querySelector('dialog')");
  await evaluate("mount(true)"); await waitFor("document.body.textContent.includes('Locked') && !document.querySelector('summary')");
  console.log(JSON.stringify({result:"PASS", checks:["prefill","review","PATCH payload","delete confirmation/cancel","DELETE payload","refresh event","409 feedback","focus restore","Escape","finalized lock","375/1440 dialog bounds"],artifacts:output,databaseAccess:false}));
} finally { socket?.close(); browser.kill(); await new Promise(resolve => server.close(resolve)); }
