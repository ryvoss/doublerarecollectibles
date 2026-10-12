const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

let csrfToken: string | null = null;
let csrfRequest: Promise<string> | null = null;

function requestMethod(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

async function loadCsrfToken() {
  if (csrfToken) return csrfToken;
  if (!csrfRequest) {
    csrfRequest = fetch("/api/auth/csrf", {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    }).then(async (response) => {
      if (!response.ok) throw new Error("The secure admin session could not be verified.");
      const payload = await response.json() as { csrfToken?: unknown };
      if (typeof payload.csrfToken !== "string" || payload.csrfToken.length < 32) {
        throw new Error("The server returned an invalid security token.");
      }
      csrfToken = payload.csrfToken;
      return csrfToken;
    }).finally(() => {
      csrfRequest = null;
    });
  }
  return csrfRequest;
}

export function clearAdminCsrfToken() {
  csrfToken = null;
  csrfRequest = null;
}

export async function adminFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const method = requestMethod(input, init);
  if (!UNSAFE_METHODS.has(method)) {
    return fetch(input, { ...init, credentials: init.credentials ?? "same-origin" });
  }

  const headers = new Headers(init.headers);
  headers.set("X-CSRF-Token", await loadCsrfToken());
  const response = await fetch(input, {
    ...init,
    credentials: init.credentials ?? "same-origin",
    headers,
  });
  if (method === "POST" && String(input) === "/api/auth/logout") clearAdminCsrfToken();
  return response;
}
