import { lazy, Suspense, useEffect, useState } from "react";
import PublicSite from "./client/public/PublicSite";
import AdminLoginPage from "./client/pages/AdminLoginPage";
import { clearAdminCsrfToken } from "./client/adminFetch";

const AdminApp = lazy(() => import("./App"));

function normalizePath(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

function RootApp() {
  const [pathname, setPathname] = useState(() =>
    normalizePath(window.location.pathname),
  );
  const [adminAuth, setAdminAuth] = useState<"checking" | "authenticated" | "unauthenticated">("checking");
  const [authError, setAuthError] = useState<string | null>(null);
  const adminPath = pathname === "/admin" || pathname.startsWith("/admin/");

  useEffect(() => {
    function handlePopState() {
      setPathname(normalizePath(window.location.pathname));
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (adminPath) {
      document.title = "Admin | Double Rare Collectibles";
    }
  }, [adminPath]);

  useEffect(() => {
    if (!adminPath) return;
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
  }, [adminPath, pathname]);

  function navigate(nextPath: string) {
    const normalizedPath = normalizePath(nextPath);

    if (normalizedPath === pathname) {
      window.scrollTo({ top: 0, behavior: "smooth" });
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

  return <PublicSite pathname={pathname} onNavigate={navigate} />;
}

export default RootApp;
