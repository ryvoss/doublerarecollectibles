import { adminFetch } from "./adminFetch";
const RETRYABLE_STATUS_CODES = new Set([500, 502, 503, 504]);

function wait(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal?.throwIfAborted();
    const abort = () => { window.clearTimeout(timer); reject(signal?.reason); };
    const timer = window.setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, milliseconds);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

async function responseError(response: Response, fallback: string) {
  try {
    const body = await response.json() as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim()) return body.error;
  } catch {
    // The API may be unavailable before it can return a JSON error body.
  }
  return fallback;
}

/**
 * Report screens combine several read-only requests. A stopped/restarted local
 * PostgreSQL listener can invalidate pooled connections once before the pool
 * reconnects, so GET requests receive a short retry without ever replaying a
 * business-data mutation.
 */
export async function fetchReportData<T>(url: string, fallbackMessage: string, signal?: AbortSignal): Promise<T> {
  const attempts = 3;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    signal?.throwIfAborted();
    let response: Response;
    try {
      response = await adminFetch(url, { headers: { Accept: "application/json" }, signal });
    } catch (error) {
      signal?.throwIfAborted();
      lastError = error;
      if (attempt === attempts - 1) break;
      await wait(250 * (attempt + 1), signal);
      continue;
    }

    if (response.ok) return await response.json() as T;

    const message = await responseError(response, fallbackMessage);
    lastError = new Error(message);
    if (!RETRYABLE_STATUS_CODES.has(response.status) || attempt === attempts - 1) break;
    await wait(250 * (attempt + 1), signal);
  }

  if (lastError instanceof Error && lastError.message) throw lastError;
  throw new Error(fallbackMessage);
}
