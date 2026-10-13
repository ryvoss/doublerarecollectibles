const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const ADMIN_AUTH_LOST_EVENT = "admin-auth-lost";

let csrfToken: string | null = null;
let csrfRequest: Promise<string> | null = null;
let csrfGeneration = 0;

function requestMethod(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

async function loadCsrfToken() {
  if (csrfToken) return csrfToken;
  if (!csrfRequest) {
    const requestGeneration = csrfGeneration;
    const request = fetch("/api/auth/csrf", {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    }).then(async (response) => {
      if (response.status === 401) handleAdminUnauthorized();
      if (!response.ok) throw new Error("The secure admin session could not be verified.");
      const payload = await response.json() as { csrfToken?: unknown };
      if (typeof payload.csrfToken !== "string" || payload.csrfToken.length < 32) {
        throw new Error("The server returned an invalid security token.");
      }
      if (requestGeneration !== csrfGeneration) {
        throw new Error("The secure admin session could not be verified.");
      }
      csrfToken = payload.csrfToken;
      return csrfToken;
    }).finally(() => {
      if (csrfRequest === request) csrfRequest = null;
    });
    csrfRequest = request;
  }
  return csrfRequest;
}

export function clearAdminCsrfToken() {
  csrfGeneration += 1;
  csrfToken = null;
  csrfRequest = null;
}

function handleAdminUnauthorized() {
  clearAdminCsrfToken();

  if (typeof window === "undefined") return;
  if (window.location.pathname !== "/admin/login") {
    window.history.replaceState({}, "", "/admin/login");
  }
  window.dispatchEvent(new Event(ADMIN_AUTH_LOST_EVENT));
}

function handleAdminResponse(response: Response) {
  if (response.status === 401) handleAdminUnauthorized();
  return response;
}

export async function adminFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const method = requestMethod(input, init);
  if (!UNSAFE_METHODS.has(method)) {
    const response = await fetch(input, {
      ...init,
      credentials: init.credentials ?? "same-origin",
    });
    return handleAdminResponse(response);
  }

  const headers = new Headers(init.headers);
  headers.set("X-CSRF-Token", await loadCsrfToken());
  const response = await fetch(input, {
    ...init,
    credentials: init.credentials ?? "same-origin",
    headers,
  });
  if (method === "POST" && String(input) === "/api/auth/logout") clearAdminCsrfToken();
  return handleAdminResponse(response);
}
