import assert from "node:assert/strict";
import { before, test } from "node:test";
import type { Request, Response } from "express";
import express, { Router } from "express";
import session from "express-session";
import request from "supertest";
import { sessionCookieName, sessionCookieOptions } from "./config";
import { requireAdmin, requireAdminPage } from "./authorization";
import { hashAdminPassword } from "./credentials";
import {
  createAdminPassport,
  type AdminAuthenticationRecord,
} from "./passportFactory";
import { createAuthRouter } from "../routes/auth";
import { mountApiRoutes } from "../routes/mountApiRoutes";

const username = "security-integration-admin";
const password = "test-only-password-phrase";
let admin: AdminAuthenticationRecord | null = null;
let productMutationCount = 0;

const testPassport = createAdminPassport({
  findById: async (id) => admin?.id === id ? admin : null,
  findByUsername: async (candidate) => admin?.username === candidate ? admin : null,
});

const app = express();
app.use(express.json());
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
publicRouter.get("/inventory", (_req, res) => res.json([]));
publicRouter.get("/site", (_req, res) => res.json({ settings: {}, assets: {} }));

const ordersRouter = Router();
ordersRouter.get("/", (_req, res) => res.json([]));
const inventoryRouter = Router();
inventoryRouter.get("/", (_req, res) => res.json([]));
const fundsRouter = Router();
fundsRouter.get("/summary", (_req, res) => res.json({ total: 0 }));
const reportsRouter = Router();
reportsRouter.get("/business-position", (_req, res) => res.json({ totalBusinessValue: 0 }));
const productsRouter = Router();
productsRouter.post("/", (_req, res) => {
  productMutationCount += 1;
  res.status(201).json({ id: productMutationCount });
});

mountApiRoutes(app, {
  auth: createAuthRouter({ adminPassport: testPassport, production: false }),
  funds: fundsRouter,
  inventory: inventoryRouter,
  orders: ordersRouter,
  packPools: Router(),
  products: productsRouter,
  public: publicRouter,
  reports: reportsRouter,
  sales: Router(),
  shows: Router(),
  site: Router(),
  whatIfScenarios: Router(),
}, requireAdmin);
app.use("/admin", requireAdminPage);

before(async () => {
  admin = {
    id: 1,
    username,
    passwordHash: await hashAdminPassword(password),
    role: "ADMIN",
    active: true,
  };
});

test("public APIs remain available without a session", async () => {
  await request(app).get("/api/health").expect(200);
  await request(app).get("/api/public/inventory").expect(200);
  await request(app).get("/api/public/site").expect(200);
});

test("representative admin reads reject unauthenticated requests", async () => {
  await request(app).get("/api/orders").expect(401);
  await request(app).get("/api/inventory").expect(401);
  await request(app).get("/api/funds/summary").expect(401);
  await request(app).get("/api/reports/business-position").expect(401);
});

test("unauthenticated writes cannot reach business handlers or mutate data", async () => {
  const beforeCount = productMutationCount;
  await request(app).post("/api/products").send({}).expect(401);
  assert.equal(productMutationCount, beforeCount);
});

test("unauthenticated admin pages redirect to login", async () => {
  const response = await request(app).get("/admin").expect(302);
  assert.equal(response.headers.location, "/admin/login");
});

test("ADMIN login grants protected access and logout invalidates the session", async () => {
  const agent = request.agent(app);
  const beforeLogin = await agent.get("/api/auth/session").expect(200);
  assert.equal(beforeLogin.body.authenticated, false);

  const login = await agent
    .post("/api/auth/login")
    .send({ username: username.toUpperCase(), password })
    .expect(200);

  assert.equal(login.body.authenticated, true);
  assert.equal(login.body.user.role, "ADMIN");
  const cookies = login.headers["set-cookie"] as unknown as string[];
  assert.ok(cookies.some((cookie) => cookie.startsWith("drc_session=")));
  assert.ok(cookies.some((cookie) => cookie.includes("HttpOnly")));
  assert.ok(cookies.some((cookie) => cookie.includes("SameSite=Strict")));
  assert.ok(cookies.every((cookie) => !cookie.includes("Domain=")));

  await agent.get("/api/orders").expect(200);
  await agent.get("/api/reports/business-position").expect(200);
  const activeSession = await agent.get("/api/auth/session").expect(200);
  assert.equal(activeSession.body.authenticated, true);

  const logout = await agent.post("/api/auth/logout").expect(204);
  const clearedCookies = logout.headers["set-cookie"] as unknown as string[];
  assert.ok(clearedCookies.some((cookie) => cookie.startsWith("drc_session=")));
  assert.ok(clearedCookies.some((cookie) => cookie.includes("Expires=Thu, 01 Jan 1970")));
  await agent.get("/api/orders").expect(401);
  const afterLogout = await agent.get("/api/auth/session").expect(200);
  assert.equal(afterLogout.body.authenticated, false);
});

test("the production cookie uses the required host-only security settings", () => {
  assert.equal(sessionCookieName(true), "__Host-drc_session");
  assert.deepEqual(sessionCookieOptions(true), {
    httpOnly: true,
    maxAge: 12 * 60 * 60 * 1000,
    path: "/",
    sameSite: "strict",
    secure: true,
  });
});

test("authenticated users without ADMIN role receive 403", () => {
  const req = {
    isAuthenticated: () => true,
    user: { id: 999, username: "not-admin", role: "VIEWER" },
  } as unknown as Request;
  let statusCode = 200;
  let nextCalled = false;
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json() {
      return this;
    },
  } as unknown as Response;

  requireAdmin(req, res, () => {
    nextCalled = true;
  });

  assert.equal(statusCode, 403);
  assert.equal(nextCalled, false);
});
