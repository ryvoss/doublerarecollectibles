import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { PublicInventoryItem } from "../../shared/publicInventory";

type Catalog = { products: PublicInventoryItem[]; loading: boolean; error: string | null; retry: () => void };
const CatalogContext = createContext<Catalog>({ products: [], loading: true, error: null, retry: () => undefined });

/** One public inventory request feeds homepage sections and the full catalog. */
export function PublicCatalogProvider({ children, pathname }: { children: ReactNode; pathname: string }) {
  const [products, setProducts] = useState<PublicInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastSuccess = useRef<number | null>(null);
  const inFlight = useRef(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (pathname !== "/" && pathname !== "/inventory") return;
    const controller = new AbortController();
    inFlight.current = true;
    setLoading(true); setError(null);
    void fetch("/api/public/inventory", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Inventory could not be loaded right now.");
        const body: unknown = await response.json();
        if (!Array.isArray(body)) throw new Error("Inventory could not be loaded right now.");
        if (!controller.signal.aborted) { lastSuccess.current = Date.now(); setProducts(body as PublicInventoryItem[]); }
      }).catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Inventory could not be loaded right now.");
      }).finally(() => { if (!controller.signal.aborted) { inFlight.current = false; setLoading(false); } });
    return () => { controller.abort(); inFlight.current = false; };
  }, [version, pathname]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible" && !inFlight.current && (lastSuccess.current === null || Date.now() - lastSuccess.current >= 60000)) {
        setVersion((value) => value + 1);
      }
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  return <CatalogContext.Provider value={{ products, loading, error, retry: () => setVersion((value) => value + 1) }}>{children}</CatalogContext.Provider>;
}

export function usePublicCatalog() { return useContext(CatalogContext); }
