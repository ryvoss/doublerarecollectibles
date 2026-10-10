import { lazy, Suspense, useEffect, useState } from "react";
import PublicSite from "./client/public/PublicSite";

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

  useEffect(() => {
    function handlePopState() {
      setPathname(normalizePath(window.location.pathname));
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
      document.title = "Admin | Double Rare Collectibles";
    }
  }, [pathname]);

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
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return (
      <Suspense fallback={<div className="route-loading">Loading Double Rare…</div>}>
        <AdminApp />
      </Suspense>
    );
  }

  return <PublicSite pathname={pathname} onNavigate={navigate} />;
}

export default RootApp;
