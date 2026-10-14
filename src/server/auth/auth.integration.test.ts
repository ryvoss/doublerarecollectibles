import assert from "node:assert/strict";
import { before, test } from "node:test";
import type { Request, Response } from "express";
import express, { Router } from "express";
import session from "express-session";
import request from "supertest";
import { sessionCookieName, sessionCookieOptions } from "./config";
import { requireAdmin, requireAdminPage } from "./authorization";
import { hashAdminPassword } from "./credentials";
import { createAdminPassport, type AdminAuthenticationRecord } from "./passportFactory";
import { createAuthRouter } from "../routes/auth";
import { mountApiRoutes } from "../routes/mountApiRoutes";
import { requireValidCsrf } from "../security/csrf";
import {
  authenticatedApiLimiter,
  contactSubmissionLimiter,
  createSameOriginWriteProtection,
  noStore,
  permissionsPolicy,
  publicApiLimiter,
  publicImageLimiter,
  securityHeaders,
} from "../security/httpSecurity";
import { safeErrorHandler } from "../security/errorHandler";
import { developmentErrorDetails } from "../security/logging";
import { toPublicInventoryItem, toPublicSiteSettings } from "../services/publicContracts";
import { EMPTY_PUBLIC_SITE_ASSETS, PUBLIC_SITE_DEFAULTS } from "../../shared/publicSite";

const username = "security-integration-admin";
const password = "test-only-password-phrase";
const testOrigin = "http://localhost:3003";
let admin: AdminAuthenticationRecord | null = null;
let productMutationCount = 0;

const testPassport = createAdminPassport({
  findById: async (id) => admin?.id === id ? admin : null,
  findByUsername: async (candidate) => admin?.username === candidate ? admin : null,
});
const originProtection = createSameOriginWriteProtection(new Set([testOrigin]));
const app = express();
app.disable("x-powered-by");
app.use(securityHeaders(true));
app.use(permissionsPolicy);
app.use(express.json({ limit: "256kb", strict: true }));
app.use(session({
  name: sessionCookieName(false),
  secret: "integration-test-session-secret-at-least-32-characters",
  cookie: sessionCookieOptions(false),
  resave: false,
  saveUninitialized: false,
}));
app.use(testPassport.initialize());
app.use(testPassport.session());

const publicRouter = Router();
publicRouter.get("/inventory", (_req, res) => res.json([toPublicInventoryItem({
  id: 7,
  name: "Internal catalog name",
  displayName: "Customer name",
  shortDescription: "Customer description",
  publicPrice: 12.5,
  expectedSalePrice: 14,
  featured: true,
  inventoryBatches: [{ quantityPurchased: 4, quantityReceived: 4, quantitySold: 0, quantityConverted: 0 }],
}, "/api/public/product-images/7/image.png")]));
publicRouter.get("/site", (_req, res) => res.json({
  settings: toPublicSiteSettings(PUBLIC_SITE_DEFAULTS),
  assets: EMPTY_PUBLIC_SITE_ASSETS,
}));

function readableRouter(path = "/") {
  const router = Router();
  router.get(path, (_req, res) => res.json([]));
  return router;
}

const reportsRouter = readableRouter("/business-position");
reportsRouter.get("/explode", () => {
  throw new Error("postgresql://secret-user:secret-password@private-host/private-db");
});
const productsRouter = readableRouter();
productsRouter.post("/", (_req, res) => {
  productMutationCount += 1;
  res.status(201).json({ id: productMutationCount });
});

mountApiRoutes(app, {
  auth: createAuthRouter({
    adminPassport: testPassport,
    production: false,
    csrfProtection: requireValidCsrf,
    originProtection,
  }),
  contact: Router(),
  funds: readableRouter("/summary"),
  inventory: readableRouter(),
  orders: readableRouter(),
  packPools: readableRouter(),
  products: productsRouter,
  public: publicRouter,
  reports: reportsRouter,
  sales: readableRouter(),
  shows: readableRouter(),
  site: readableRouter(),
  whatIfScenarios: readableRouter(),
}, requireAdmin, {
  authenticatedApiLimiter,
  contactSubmissionLimiter,
  csrfProtection: requireValidCsrf,
  noStore,
  originProtection,
  publicApiLimiter,
  publicImageLimiter,
});
app.use("/admin", noStore, requireAdminPage);
app.use(safeErrorHandler);

before(async () => {
  admin = {
    id: 1,
    username,
    passwordHash: await hashAdminPassword(password),
    role: "ADMIN",
    active: true,
  };
});

async function login(agent: ReturnType<typeof request.agent>) {
  return agent.post("/api/auth/login").set("Origin", testOrigin)
    .send({ username: username.toUpperCase(), password }).expect(200);
}

async function csrf(agent: ReturnType<typeof request.agent>) {
  const response = await agent.get("/api/auth/csrf").expect(200);
  assert.equal(typeof response.body.csrfToken, "string");
  return response.body.csrfToken as string;
}

test("public APIs remain available without a session", async () => {
  await request(app).get("/api/health").expect(200);
  const inventory = await request(app).get("/api/public/inventory").expect(200);
  assert.deepEqual(Object.keys(inventory.body[0]).sort(), [
    "availability", "displayPrice", "featured", "id", "imageUrl", "moreArrivingSoon", "name", "shortDescription",
  ]);
  assert.doesNotMatch(JSON.stringify(inventory.body), /landed|cost|cogs|quantity|margin|profit|batch|order|fund|internal/i);
  const site = await request(app).get("/api/public/site").expect(200);
  assert.deepEqual(Object.keys(site.body).sort(), ["assets", "settings"]);
  assert.deepEqual(Object.keys(site.body.settings).sort(), Object.keys(PUBLIC_SITE_DEFAULTS).sort());
  assert.deepEqual(Object.keys(site.body.assets).sort(), Object.keys(EMPTY_PUBLIC_SITE_ASSETS).sort());
});

test("every internal router rejects unauthenticated requests", async () => {
  const paths = [
    "/api/products", "/api/orders", "/api/inventory", "/api/sales", "/api/shows",
    "/api/funds/summary", "/api/reports/business-position", "/api/what-if-scenarios",
    "/api/site", "/api/pack-pools",
  ];
  for (const path of paths) {
    const response = await request(app).get(path).expect(401);
    assert.match(response.headers["cache-control"], /no-store/);
  }
});

test("unauthenticated writes cannot reach business handlers or mutate data", async () => {
  const beforeCount = productMutationCount;
  const response = await request(app).post("/api/products").send({}).expect(401);
  assert.match(response.headers["cache-control"], /no-store/);
  assert.equal(productMutationCount, beforeCount);
  await request(app).post("/api/orders/1/receive").send({ lines: [] }).expect(401);
  await request(app).post("/api/orders/1/correction-preview").send({}).expect(401);
  await request(app).post("/api/orders/1/corrections").send({}).expect(401);
});

test("unauthenticated admin pages redirect to login and are not cached", async () => {
  const response = await request(app).get("/admin").expect(302);
  assert.equal(response.headers.location, "/admin/login");
  assert.match(response.headers["cache-control"], /no-store/);
});

test("ADMIN can read every protected router and responses are not cached", async () => {
  const agent = request.agent(app);
  await login(agent);
  const paths = [
    "/api/products", "/api/orders", "/api/inventory", "/api/sales", "/api/shows",
    "/api/funds/summary", "/api/reports/business-position", "/api/what-if-scenarios",
    "/api/site", "/api/pack-pools",
  ];
  for (const path of paths) {
    const response = await agent.get(path).expect(200);
    assert.match(response.headers["cache-control"], /no-store/);
  }
});

test("CSRF blocks missing, invalid, and cross-session tokens without mutation", async () => {
  const first = request.agent(app);
  const second = request.agent(app);
  await login(first);
  await login(second);
  const firstToken = await csrf(first);
  const beforeCount = productMutationCount;
  await first.post("/api/orders/1/receive").set("Origin", testOrigin).send({ lines: [] }).expect(403);
  await first.post("/api/orders/1/corrections").set("Origin", testOrigin).send({}).expect(403);
  await first.post("/api/products").set("Origin", testOrigin).send({}).expect(403);
  await first.post("/api/products").set("Origin", testOrigin).set("X-CSRF-Token", "invalid").send({}).expect(403);
  await second.post("/api/products").set("Origin", testOrigin).set("X-CSRF-Token", firstToken).send({}).expect(403);
  assert.equal(productMutationCount, beforeCount);
  await first.post("/api/products").set("Origin", testOrigin).set("X-CSRF-Token", firstToken).send({}).expect(201);
  assert.equal(productMutationCount, beforeCount + 1);
});

test("same-origin validation protects login and authenticated writes", async () => {
  await request(app).post("/api/auth/login").set("Origin", "https://attacker.invalid")
    .send({ username, password }).expect(403);
  const agent = request.agent(app);
  await login(agent);
  const token = await csrf(agent);
  const beforeCount = productMutationCount;
  await agent.post("/api/products").set("Origin", "https://attacker.invalid")
    .set("X-CSRF-Token", token).send({}).expect(403);
  assert.equal(productMutationCount, beforeCount);
});

test("ADMIN login grants access and CSRF-protected logout invalidates the session", async () => {
  const agent = request.agent(app);
  assert.equal((await agent.get("/api/auth/session").expect(200)).body.authenticated, false);
  const loginResponse = await login(agent);
  assert.equal(loginResponse.body.authenticated, true);
  assert.equal(loginResponse.body.user.role, "ADMIN");
  const cookies = loginResponse.headers["set-cookie"] as unknown as string[];
  assert.ok(cookies.some((cookie) => cookie.startsWith("drc_session=")));
  assert.ok(cookies.some((cookie) => cookie.includes("HttpOnly")));
  assert.ok(cookies.some((cookie) => cookie.includes("SameSite=Strict")));
  assert.ok(cookies.every((cookie) => !cookie.includes("Domain=")));
  const token = await csrf(agent);
  await agent.post("/api/auth/logout").set("Origin", testOrigin).set("X-CSRF-Token", token).expect(204);
  await agent.get("/api/orders").expect(401);
  const beforeCount = productMutationCount;
  await agent.post("/api/products").set("Origin", testOrigin).set("X-CSRF-Token", token).send({}).expect(401);
  assert.equal(productMutationCount, beforeCount);
  assert.equal((await agent.get("/api/auth/session").expect(200)).body.authenticated, false);
});

test("security headers are present on public responses", async () => {
  const response = await request(app).get("/api/public/site").expect(200);
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers["x-frame-options"], "DENY");
  assert.equal(response.headers["x-powered-by"], undefined);
  assert.match(response.headers["strict-transport-security"], /max-age=31536000/);
  assert.match(response.headers["content-security-policy"], /default-src 'self'/);
  assert.match(response.headers["permissions-policy"], /camera=\(\)/);
  assert.equal(response.headers["referrer-policy"], "strict-origin-when-cross-origin");
});

test("oversized and malformed JSON receive controlled errors", async () => {
  await request(app).post("/api/auth/login").set("Origin", testOrigin)
    .set("Content-Type", "application/json")
    .send(JSON.stringify({ username, password: "x".repeat(300_000) }))
    .expect(413, { error: "Request body is too large" });
  await request(app).post("/api/auth/login").set("Origin", testOrigin)
    .set("Content-Type", "application/json").send("{\"username\":")
    .expect(400, { error: "Malformed JSON request body" });
});

test("unexpected production errors do not leak infrastructure details", async () => {
  const agent = request.agent(app);
  await login(agent);
  const originalConsoleError = console.error;
  console.error = () => undefined;
  let response: request.Response;
  try {
    response = await agent.get("/api/reports/explode").expect(500);
  } finally {
    console.error = originalConsoleError;
  }
  assert.deepEqual(response.body, { error: "Internal server error" });
  assert.doesNotMatch(JSON.stringify(response.body), /secret|postgresql|private-host/i);
});

test("route-level diagnostic details are suppressed in production", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assert.deepEqual(developmentErrorDetails(new Error("private schema and hostname")), {});
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("the production cookie uses the required host-only security settings", () => {
  assert.equal(sessionCookieName(true), "__Host-drc_session");
  assert.deepEqual(sessionCookieOptions(true), {
    httpOnly: true, maxAge: 12 * 60 * 60 * 1000, path: "/", sameSite: "strict", secure: true,
  });
});

test("authenticated users without ADMIN role receive 403", () => {
  const req = { isAuthenticated: () => true, user: { id: 999, username: "not-admin", role: "VIEWER" } } as unknown as Request;
  let statusCode = 200;
  let nextCalled = false;
  const res = {
    status(code: number) { statusCode = code; return this; },
    json() { return this; },
  } as unknown as Response;
  requireAdmin(req, res, () => { nextCalled = true; });
  assert.equal(statusCode, 403);
  assert.equal(nextCalled, false);
});

test("login rate limiting returns a controlled 429 without account disclosure", async () => {
  let limitedResponse: request.Response | null = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await request(app).post("/api/auth/login").set("Origin", testOrigin)
      .send({ username: "unknown-account", password: "invalid-password" });
    if (response.status === 429) {
      limitedResponse = response;
      break;
    }
  }
  assert.ok(limitedResponse);
  assert.deepEqual(limitedResponse.body, { error: "Too many login attempts. Try again later." });
});
