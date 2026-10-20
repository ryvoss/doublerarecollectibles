import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { frontendStatic } from "./frontendStatic";
import { noStore } from "../security/httpSecurity";

test("only hashed frontend assets are immutable; HTML, public files and admin API retain their policy", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "double-rare-cache-"));
  try {
    await mkdir(path.join(root, "assets"));
    for (const file of ["assets/index-D78v1H45.js", "assets/index-9R2RgxrT.css", "assets/runtime.js", "index.html", "favicon.svg"]) {
      await writeFile(path.join(root, file), "fixture");
    }
    const app = express();
    app.get("/api/private", noStore, (_req, res) => res.json({ ok: true }));
    app.use(frontendStatic(root));
    app.get("/", (_req, res) => { res.set("Cache-Control", "no-cache"); res.sendFile(path.join(root, "index.html")); });
    for (const file of ["index-D78v1H45.js", "index-9R2RgxrT.css"]) {
      await request(app).get(`/assets/${file}`).expect(200).expect("Cache-Control", "public, max-age=31536000, immutable");
    }
    for (const file of ["/index.html", "/"]) await request(app).get(file).expect(200).expect("Cache-Control", "no-cache");
    for (const file of ["/favicon.svg", "/assets/runtime.js"]) {
      const response = await request(app).get(file).expect(200);
      assert.equal(response.headers["cache-control"], "public, max-age=3600");
    }
    await request(app).get("/api/private").expect(200).expect("Cache-Control", "no-store");
  } finally { await rm(root, { recursive: true, force: true }); }
});
