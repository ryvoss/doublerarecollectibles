const RETRYABLE_STATUS_CODES = new Set([500, 502, 503, 504]);

function wait(milliseconds: number) {
  return new Promise(resolve => window.setTimeout(resolve, milliseconds));
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
export async function fetchReportData<T>(url: string, fallbackMessage: string): Promise<T> {
  const attempts = 3;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, { headers: { Accept: "application/json" } });
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) break;
      await wait(250 * (attempt + 1));
      continue;
    }

    if (response.ok) return await response.json() as T;

    const message = await responseError(response, fallbackMessage);
    lastError = new Error(message);
    if (!RETRYABLE_STATUS_CODES.has(response.status) || attempt === attempts - 1) break;
    await wait(250 * (attempt + 1));
  }

  if (lastError instanceof Error && lastError.message) throw lastError;
  throw new Error(fallbackMessage);
}
