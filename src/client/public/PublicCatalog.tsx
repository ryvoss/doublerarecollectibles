import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { PublicInventoryItem } from "../../shared/publicInventory";

type Catalog = { products: PublicInventoryItem[]; loading: boolean; error: string | null; retry: () => void };
const CatalogContext = createContext<Catalog>({ products: [], loading: true, error: null, retry: () => undefined });

/** One public inventory request feeds homepage sections and the full catalog. */
export function PublicCatalogProvider({ children, pathname }: { children: ReactNode; pathname: string }) {
  const [products, setProducts] = useState<PublicInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (pathname !== "/" && pathname !== "/inventory") return;
    const controller = new AbortController();
    setLoading(true); setError(null);
    void fetch("/api/public/inventory", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Inventory could not be loaded right now.");
        const body: unknown = await response.json();
        if (!Array.isArray(body)) throw new Error("Inventory could not be loaded right now.");
        if (!controller.signal.aborted) setProducts(body as PublicInventoryItem[]);
      }).catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Inventory could not be loaded right now.");
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [version, pathname]);
  useEffect(() => {
    let lastRefresh = Date.now();
    const refresh = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRefresh > 60000) {
        lastRefresh = Date.now(); setVersion((value) => value + 1);
      }
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  return <CatalogContext.Provider value={{ products, loading, error, retry: () => setVersion((value) => value + 1) }}>{children}</CatalogContext.Provider>;
}

export function usePublicCatalog() { return useContext(CatalogContext); }
