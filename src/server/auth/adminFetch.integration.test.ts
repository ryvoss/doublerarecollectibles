import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ADMIN_AUTH_LOST_EVENT,
  adminFetch,
  clearAdminCsrfToken,
} from "../../client/adminFetch";

type MutableLocation = { pathname: string };

function browserWindow(pathname: string) {
  const target = new EventTarget();
  const location: MutableLocation = { pathname };
  const history = {
    replaceState(_state: unknown, _unused: string, url?: string | URL | null) {
      if (url !== undefined && url !== null) location.pathname = String(url);
    },
  };

  return Object.assign(target, { history, location });
}

test("a protected 401 clears spoofed frontend auth state, CSRF state, and redirects", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const fakeWindow = browserWindow("/admin");
  let frontendAuthenticated = true;
  let csrfRequests = 0;
  let protectedReadReturns401 = false;

  fakeWindow.addEventListener(ADMIN_AUTH_LOST_EVENT, () => {
    frontendAuthenticated = false;
  });

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: fakeWindow,
  });
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "/api/auth/csrf") {
      csrfRequests += 1;
      return Response.json({ csrfToken: "x".repeat(32) });
    }
    if (url === "/api/orders" && protectedReadReturns401) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }
    return Response.json({ ok: true });
  };

  try {
    clearAdminCsrfToken();
    await adminFetch("/api/products", { method: "POST" });
    assert.equal(csrfRequests, 1);

    protectedReadReturns401 = true;
    await adminFetch("/api/orders");
    assert.equal(frontendAuthenticated, false);
    assert.equal(fakeWindow.location.pathname, "/admin/login");

    await adminFetch("/api/products", { method: "POST" });
    assert.equal(csrfRequests, 2, "the pre-401 CSRF token must not be reused");
  } finally {
    clearAdminCsrfToken();
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  }
});

test("a protected 403 preserves the current authenticated frontend state", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const fakeWindow = browserWindow("/admin");
  let authLostEvents = 0;

  fakeWindow.addEventListener(ADMIN_AUTH_LOST_EVENT, () => {
    authLostEvents += 1;
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: fakeWindow,
  });
  globalThis.fetch = async () => Response.json(
    { error: "Administrator access required" },
    { status: 403 },
  );

  try {
    clearAdminCsrfToken();
    const response = await adminFetch("/api/orders");
    assert.equal(response.status, 403);
    assert.equal(authLostEvents, 0);
    assert.equal(fakeWindow.location.pathname, "/admin");
  } finally {
    clearAdminCsrfToken();
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  }
});
