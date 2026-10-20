import { lazy, Suspense, useEffect, useState } from "react";
import PublicSite from "./client/public/PublicSite";
import AdminLoginPage from "./client/pages/AdminLoginPage";
import {
  ADMIN_AUTH_LOST_EVENT,
  clearAdminCsrfToken,
} from "./client/adminFetch";

const AdminApp = lazy(() => import("./App"));

function normalizePath(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

function RootApp() {
  const [locationPath, setPathname] = useState(() =>
    normalizePath(window.location.pathname) + window.location.search,
  );
  const pathname = locationPath.split("?")[0]!;
  const search = locationPath.includes("?") ? locationPath.slice(locationPath.indexOf("?")) : "";
  const [adminAuth, setAdminAuth] = useState<"checking" | "authenticated" | "unauthenticated">("checking");
  const [adminAuthInvalidated, setAdminAuthInvalidated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const adminPath = pathname === "/admin" || pathname.startsWith("/admin/");

  useEffect(() => {
    function handlePopState() {
      setPathname(normalizePath(window.location.pathname) + window.location.search);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    function handleAdminAuthLost() {
      clearAdminCsrfToken();
      setAdminAuthInvalidated(true);
      setAdminAuth("unauthenticated");
      setAuthError(null);
      if (window.location.pathname !== "/admin/login") {
        window.history.replaceState({}, "", "/admin/login");
      }
      setPathname("/admin/login");
    }

    window.addEventListener(ADMIN_AUTH_LOST_EVENT, handleAdminAuthLost);
    return () => window.removeEventListener(ADMIN_AUTH_LOST_EVENT, handleAdminAuthLost);
  }, []);

  useEffect(() => {
    if (adminPath) {
      document.title = "Admin | Double Rare Collectibles";
    }
  }, [adminPath]);

  useEffect(() => {
    if (!adminPath || adminAuthInvalidated) return;
    const controller = new AbortController();
    setAdminAuth("checking");
    setAuthError(null);

    void fetch("/api/auth/session", {
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("Admin authentication is unavailable.");
      return response.json() as Promise<{ authenticated: boolean }>;
    }).then((session) => {
      if (controller.signal.aborted) return;
      if (session.authenticated) {
        setAdminAuth("authenticated");
        if (pathname === "/admin/login") {
          window.history.replaceState({}, "", "/admin");
          setPathname("/admin");
        }
        return;
      }

      clearAdminCsrfToken();
      setAdminAuth("unauthenticated");
      if (pathname !== "/admin/login") {
        window.history.replaceState({}, "", "/admin/login");
        setPathname("/admin/login");
      }
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      clearAdminCsrfToken();
      setAdminAuth("unauthenticated");
      setAuthError(error instanceof Error ? error.message : "Admin authentication is unavailable.");
      if (pathname !== "/admin/login") {
        window.history.replaceState({}, "", "/admin/login");
        setPathname("/admin/login");
      }
    });

    return () => controller.abort();
  }, [adminAuthInvalidated, adminPath, pathname]);

  function navigate(nextPath: string) {
    const target = new URL(nextPath, window.location.origin);
    if (target.origin !== window.location.origin) return;
    const normalizedPath = normalizePath(target.pathname) + target.search;

    if (normalizedPath === locationPath) {
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }

    window.history.pushState({}, "", normalizedPath);
    setPathname(normalizedPath);
  }

  // Admin page selection remains managed by the established admin shell.
  // Keeping this boundary here prevents public pages from mounting admin data requests.
  if (adminPath) {
    if (adminAuth === "checking") {
      return <div className="route-loading">Checking admin access…</div>;
    }
    if (adminAuth !== "authenticated") {
      return (
        <AdminLoginPage
          initialError={authError}
          onAuthenticated={() => {
            setAdminAuthInvalidated(false);
            setAdminAuth("authenticated");
            window.history.replaceState({}, "", "/admin");
            setPathname("/admin");
          }}
        />
      );
    }
    return (
      <Suspense fallback={<div className="route-loading">Loading Double Rare…</div>}>
        <AdminApp />
      </Suspense>
    );
  }

  return <PublicSite pathname={pathname} search={search} onNavigate={navigate} />;
}

export default RootApp;
