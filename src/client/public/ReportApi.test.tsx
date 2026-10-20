import assert from "node:assert/strict";
import test from "node:test";
import { fetchReportData } from "../reportApi";

test("report cancellation reaches fetch and stops retry timers without another request", async (context) => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { setTimeout, clearTimeout } });
  try {
    const controller = new AbortController();
    let attempts = 0;
    context.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
      attempts++;
      assert.equal(init?.signal, controller.signal);
      return Response.json({ error: "Temporary failure" }, { status: 503 });
    });
    const pending = fetchReportData("/api/reports/performance", "Unavailable", controller.signal);
    // Allow response parsing to enter the retry delay, then cancel it.
    await new Promise(resolve => setTimeout(resolve, 20));
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
    assert.equal(attempts, 1);
    await assert.rejects(fetchReportData("/api/reports/performance", "Unavailable", controller.signal), { name: "AbortError" });
    assert.equal(attempts, 1, "an already aborted request must not reach fetch");
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
