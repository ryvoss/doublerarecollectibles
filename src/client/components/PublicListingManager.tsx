import { useEffect, useMemo, useState } from "react";
import type {
  AdminPublicListingItem,
  AdminPublicListingUpdate,
  PublicInventoryAvailability,
} from "../../shared/publicInventory";
import ProductImageManager from "./ProductImageManager";

type ListingFilter = "ALL" | "PUBLIC" | "HIDDEN" | "FEATURED";

type ListingDraft = {
  displayName: string;
  shortDescription: string;
  publicPrice: string;
  publicVisible: boolean;
  featured: boolean;
};

const filters: Array<{ value: ListingFilter; label: string }> = [
  { value: "ALL", label: "All Sellable" },
  { value: "PUBLIC", label: "Public" },
  { value: "HIDDEN", label: "Hidden" },
  { value: "FEATURED", label: "Featured" },
];

const stockLabels: Record<PublicInventoryAvailability, string> = {
  IN_STOCK: "In Stock",
  LOW_STOCK: "Low Stock",
  SOLD_OUT: "Sold Out",
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function money(value: number | null) {
  return value === null ? "Not set" : currencyFormatter.format(value);
}

function draftsFrom(items: AdminPublicListingItem[]) {
  return Object.fromEntries(
    items.map((item) => [
      item.id,
      {
        displayName: item.displayName ?? "",
        shortDescription: item.shortDescription ?? "",
        publicPrice: item.publicPrice === null ? "" : String(item.publicPrice),
        publicVisible: item.publicVisible,
        featured: item.featured,
      },
    ]),
  ) as Record<number, ListingDraft>;
}

function publicPriceFrom(value: string) {
  return value.trim() === "" ? null : Number(value);
}

export default function PublicListingManager({
  onClose,
}: {
  onClose: () => void;
}) {
  const [items, setItems] = useState<AdminPublicListingItem[]>([]);
  const [drafts, setDrafts] = useState<Record<number, ListingDraft>>({});
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<ListingFilter>("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadListings() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/api/products/public-listings", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Public listings could not be loaded.");
        }

        const data = await response.json() as AdminPublicListingItem[];
        if (!controller.signal.aborted) {
          setItems(data);
          setDrafts(draftsFrom(data));
          setSelectedIds(new Set());
        }
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Public listings could not be loaded.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadListings();
    return () => controller.abort();
  }, [reloadKey]);

  const dirtyIds = useMemo(() => {
    const dirty = new Set<number>();

    for (const item of items) {
      const draft = drafts[item.id];
      if (!draft) continue;

      const draftPrice = publicPriceFrom(draft.publicPrice);
      if (
        (draft.displayName.trim() || null) !== item.displayName ||
        (draft.shortDescription.trim() || null) !== item.shortDescription ||
        draft.publicVisible !== item.publicVisible ||
        draft.featured !== item.featured ||
        draftPrice !== item.publicPrice
      ) {
        dirty.add(item.id);
      }
    }

    return dirty;
  }, [drafts, items]);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();

    return items.filter((item) => {
      const draft = drafts[item.id];
      const searchableName = `${item.internalName} ${draft?.displayName ?? ""}`.toLocaleLowerCase();
      if (!draft || (query && !searchableName.includes(query))) {
        return false;
      }

      if (filter === "PUBLIC") return draft.publicVisible;
      if (filter === "HIDDEN") return !draft.publicVisible;
      if (filter === "FEATURED") return draft.featured;
      return true;
    });
  }, [drafts, filter, items, search]);

  const allVisibleSelected =
    visibleItems.length > 0 &&
    visibleItems.every((item) => selectedIds.has(item.id));

  function updateDraft(productId: number, update: Partial<ListingDraft>) {
    setSuccess(null);
    setDrafts((current) => ({
      ...current,
      [productId]: {
        ...current[productId],
        ...update,
      },
    }));
  }

  function toggleSelected(productId: number) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        visibleItems.forEach((item) => next.delete(item.id));
      } else {
        visibleItems.forEach((item) => next.add(item.id));
      }
      return next;
    });
  }

  function applyBulk(update: Partial<ListingDraft>) {
    if (selectedIds.size === 0) return;
    setSuccess(null);
    setDrafts((current) => {
      const next = { ...current };
      selectedIds.forEach((productId) => {
        if (next[productId]) {
          next[productId] = { ...next[productId], ...update };
        }
      });
      return next;
    });
  }

  function requestClose() {
    if (dirtyIds.size > 0) {
      setError("You have unsaved listing changes. Save them or use Discard Changes & Close.");
      return;
    }
    onClose();
  }

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) {
        requestClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  });

  async function saveChanges() {
    const updates: AdminPublicListingUpdate[] = [];

    for (const item of items) {
      if (!dirtyIds.has(item.id)) continue;
      const draft = drafts[item.id];
      const publicPrice = publicPriceFrom(draft.publicPrice);

      if (
        publicPrice !== null &&
        (!Number.isFinite(publicPrice) || publicPrice < 0 || publicPrice > 99999999.99)
      ) {
        setError(`Enter a valid public price for ${item.internalName}.`);
        return;
      }

      if (draft.displayName.trim().length > 160) {
        setError(`Display name is too long for ${item.internalName}.`);
        return;
      }

      if (draft.shortDescription.trim().length > 240) {
        setError(`Short description is too long for ${item.internalName}.`);
        return;
      }

      updates.push({
        id: item.id,
        displayName: draft.displayName.trim() || null,
        shortDescription: draft.shortDescription.trim() || null,
        publicPrice,
        publicVisible: draft.publicVisible,
        featured: draft.featured,
      });
    }

    if (updates.length === 0) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      const response = await fetch("/api/products/public-listings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(body?.error ?? "Public listings could not be saved.");
      }

      const savedCount = updates.length;
      const nextItems = items.map((item) => {
        const update = updates.find((candidate) => candidate.id === item.id);
        return update
          ? {
              ...item,
              displayName: update.displayName ?? null,
              shortDescription: update.shortDescription ?? null,
              publicPrice: update.publicPrice ?? null,
              publicVisible: update.publicVisible ?? item.publicVisible,
              featured: update.featured ?? item.featured,
            }
          : item;
      });
      setItems(nextItems);
      setDrafts(draftsFrom(nextItems));
      setSelectedIds(new Set());
      setSuccess(
        `${savedCount} ${savedCount === 1 ? "listing" : "listings"} saved.`,
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Public listings could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop public-listing-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) requestClose();
      }}
    >
      <section
        className="modal-surface public-listing-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="public-listing-title"
      >
        <header className="public-listing-header">
          <div>
            <span>Customer site merchandising</span>
            <h2 id="public-listing-title">Manage Public Listings</h2>
            <p>Update visibility, featured products, and customer-facing prices.</p>
          </div>
          <div className="public-listing-header__summary">
            <span><strong>{items.filter((item) => drafts[item.id]?.publicVisible).length}</strong> public</span>
            <span><strong>{items.filter((item) => drafts[item.id]?.featured).length}</strong> featured</span>
          </div>
          <button type="button" aria-label="Close public listing manager" onClick={requestClose}>
            &times;
          </button>
        </header>

        <div className="public-listing-controls">
          <input
            type="search"
            aria-label="Search sellable products"
            placeholder="Search products"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="public-listing-filters" aria-label="Listing filters">
            {filters.map((option) => (
              <button
                key={option.value}
                type="button"
                className={filter === option.value ? "is-active" : undefined}
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="public-listing-bulk">
          <label>
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleAllVisible}
              disabled={visibleItems.length === 0}
            />
            Select all shown
          </label>
          <span>{selectedIds.size} selected</span>
          <div>
            <button type="button" disabled={selectedIds.size === 0} onClick={() => applyBulk({ publicVisible: true })}>Make Public</button>
            <button type="button" disabled={selectedIds.size === 0} onClick={() => applyBulk({ publicVisible: false })}>Hide</button>
            <button type="button" disabled={selectedIds.size === 0} onClick={() => applyBulk({ featured: true })}>Feature</button>
            <button type="button" disabled={selectedIds.size === 0} onClick={() => applyBulk({ featured: false })}>Unfeature</button>
          </div>
        </div>

        {(error || success) && (
          <div
            className={error ? "public-listing-notice is-error" : "public-listing-notice is-success"}
            role={error ? "alert" : "status"}
          >
            {error ?? success}
          </div>
        )}

        <div className="public-listing-content">
          {loading ? (
            <div className="public-listing-state" role="status">Loading sellable products...</div>
          ) : error && items.length === 0 ? (
            <div className="public-listing-state">
              <strong>Listings unavailable</strong>
              <button type="button" className="secondary-button" onClick={() => setReloadKey((key) => key + 1)}>Try Again</button>
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="public-listing-state">
              <strong>No matching sellable products</strong>
              <span>Try another search or listing filter.</span>
            </div>
          ) : (
            <div className="public-listing-rows">
              <div className="public-listing-row public-listing-row--head" aria-hidden="true">
                <span />
                <span>Image</span>
                <span>Customer name</span>
                <span>Description</span>
                <span>Stock</span>
                <span>Expected Price</span>
                <span>Public Price</span>
                <span>Public</span>
                <span>Featured</span>
              </div>
              {visibleItems.map((item) => {
                const draft = drafts[item.id];
                return (
                  <article
                    className={`public-listing-row${dirtyIds.has(item.id) ? " is-dirty" : ""}`}
                    key={item.id}
                  >
                    <label className="public-listing-select">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleSelected(item.id)}
                        aria-label={`Select ${item.internalName}`}
                      />
                    </label>
                    <ProductImageManager
                      compact
                      productId={item.id}
                      productName={draft.displayName.trim() || item.internalName}
                      imageUrl={item.imageUrl}
                      onImageChange={(imageUrl) => {
                        setItems((current) => current.map((candidate) =>
                          candidate.id === item.id ? { ...candidate, imageUrl } : candidate
                        ));
                        setSuccess(imageUrl ? "Product image saved." : "Product image removed.");
                      }}
                    />
                    <div className="public-listing-product">
                      <input
                        type="text"
                        maxLength={160}
                        value={draft.displayName}
                        onChange={(event) => updateDraft(item.id, { displayName: event.target.value })}
                        aria-label={`Display name for ${item.internalName}`}
                        placeholder={item.internalName}
                      />
                      <small>Internal: {item.internalName}</small>
                      {dirtyIds.has(item.id) && <span>Unsaved</span>}
                    </div>
                    <label className="public-listing-description">
                      <input
                        type="text"
                        maxLength={240}
                        value={draft.shortDescription}
                        onChange={(event) => updateDraft(item.id, { shortDescription: event.target.value })}
                        aria-label={`Short description for ${item.internalName}`}
                        placeholder="Add a short customer description"
                      />
                      <small>{draft.shortDescription.length}/240</small>
                    </label>
                    <span className={`public-listing-stock is-${item.stockStatus.toLowerCase()}`}>
                      {stockLabels[item.stockStatus]}
                    </span>
                    <div className="public-listing-expected">
                      <small>Expected</small>
                      <strong>{money(item.expectedSalePrice)}</strong>
                    </div>
                    <label className="public-listing-price">
                      <span>$</span>
                      <input
                        type="number"
                        min="0"
                        max="99999999.99"
                        step="0.01"
                        value={draft.publicPrice}
                        onChange={(event) => updateDraft(item.id, { publicPrice: event.target.value })}
                        aria-label={`Public price for ${item.internalName}`}
                        placeholder={item.expectedSalePrice === null ? "Not set" : item.expectedSalePrice.toFixed(2)}
                      />
                      <small>
                        {draft.publicPrice.trim() === ""
                          ? item.expectedSalePrice === null
                            ? "No fallback price"
                            : `Uses ${money(item.expectedSalePrice)}`
                          : "Overrides expected price"}
                      </small>
                    </label>
                    <label className="public-listing-switch">
                      <input
                        type="checkbox"
                        checked={draft.publicVisible}
                        onChange={(event) => updateDraft(item.id, { publicVisible: event.target.checked })}
                      />
                      <span aria-hidden="true" />
                      <small>{draft.publicVisible ? "Public" : "Hidden"}</small>
                    </label>
                    <label className="public-listing-switch">
                      <input
                        type="checkbox"
                        checked={draft.featured}
                        onChange={(event) => updateDraft(item.id, { featured: event.target.checked })}
                      />
                      <span aria-hidden="true" />
                      <small>{draft.featured ? "Featured" : "Standard"}</small>
                    </label>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <footer className="public-listing-footer">
          <div>
            <strong>{dirtyIds.size}</strong>{" "}
            {dirtyIds.size === 1 ? "product has" : "products have"} unsaved changes
          </div>
          <div>
            <button type="button" className="secondary-button" disabled={saving} onClick={dirtyIds.size > 0 ? onClose : requestClose}>
              {dirtyIds.size > 0 ? "Discard Changes & Close" : "Close"}
            </button>
            <button type="button" className="primary-button" disabled={saving || dirtyIds.size === 0} onClick={() => void saveChanges()}>
              {saving ? "Saving..." : `Save Changes${dirtyIds.size > 0 ? ` (${dirtyIds.size})` : ""}`}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
