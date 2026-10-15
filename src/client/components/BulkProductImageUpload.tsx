import { adminFetch } from "../adminFetch";
import ProductImage from "./ProductImage";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import type { AdminPublicListingItem } from "../../shared/publicInventory";
import {
  duplicateProductAssignments,
  runIndependentImageUploads,
  suggestProductForImage,
  type ImageMatchStatus,
} from "../../shared/bulkProductImages";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_BATCH_FILES = 30;
const MAX_BATCH_BYTES = 120 * 1024 * 1024;
const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type UploadState = "PENDING" | "UPLOADING" | "SUCCESS" | "FAILED";
type BatchImage = {
  id: string;
  file: File;
  previewUrl: string | null;
  productId: number | null;
  selectorValue: string;
  matchStatus: ImageMatchStatus | "MANUAL";
  validationError: string | null;
  skipped: boolean;
  uploadState: UploadState;
  uploadError: string | null;
};

type ViewFilter = "ALL" | "REVIEW" | "REPLACEMENTS";

function productOption(product: AdminPublicListingItem) {
  const names = product.displayName && product.displayName !== product.internalName
    ? `${product.internalName} — ${product.displayName}`
    : product.internalName;
  return `${names} (#${product.id})`;
}

function fileValidation(file: File) {
  if (!SUPPORTED_TYPES.has(file.type)) return "Use a JPEG, PNG, or WebP image.";
  if (file.size === 0) return "The image is empty.";
  if (file.size > MAX_FILE_BYTES) return "Images must be 8 MB or smaller.";
  return null;
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const matchLabels: Record<BatchImage["matchStatus"], string> = {
  EXACT: "Exact match",
  SUGGESTED: "Suggested match",
  NEEDS_REVIEW: "Needs review",
  UNMATCHED: "Unmatched",
  MANUAL: "Manual match",
};

export default function BulkProductImageUpload({ onClose, onUploaded }: { onClose: () => void; onUploaded?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrls = useRef(new Set<string>());
  const [products, setProducts] = useState<AdminPublicListingItem[]>([]);
  const [files, setFiles] = useState<BatchImage[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [filter, setFilter] = useState<ViewFilter>("ALL");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [replacementAcknowledged, setReplacementAcknowledged] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void adminFetch("/api/products/public-listings", { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as AdminPublicListingItem[] | { error?: string } | null;
        if (!response.ok || !Array.isArray(body)) throw new Error(body && !Array.isArray(body) ? body.error : "Products could not be loaded.");
        setProducts(body);
      })
      .catch((loadError: unknown) => { if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "Products could not be loaded."); })
      .finally(() => { if (!controller.signal.aborted) setLoadingProducts(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => () => { previewUrls.current.forEach((url) => URL.revokeObjectURL(url)); }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", handleKeyDown); };
  }, [busy, onClose]);

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const duplicateIds = useMemo(() => duplicateProductAssignments(files.filter((file) => !file.skipped && file.uploadState !== "SUCCESS").map((file) => file.productId)), [files]);
  const matched = files.filter((file) => file.productId !== null && !file.skipped && !file.validationError);
  const replacements = matched.filter((file) => productById.get(file.productId ?? 0)?.imageUrl);
  const uploadable = files.filter((file) => file.productId !== null && !file.skipped && !file.validationError && !duplicateIds.has(file.productId) && file.uploadState !== "SUCCESS");
  const completed = files.filter((file) => file.uploadState === "SUCCESS").length;
  const failed = files.filter((file) => file.uploadState === "FAILED").length;

  const visibleFiles = files.filter((file) => {
    if (filter === "REVIEW") return Boolean(file.validationError) || file.productId === null || file.matchStatus === "NEEDS_REVIEW" || (file.productId !== null && duplicateIds.has(file.productId));
    if (filter === "REPLACEMENTS") return file.productId !== null && Boolean(productById.get(file.productId)?.imageUrl);
    return true;
  });

  function updateFile(id: string, update: Partial<BatchImage>) {
    setConfirming(false); setReplacementAcknowledged(false);
    setFiles((current) => current.map((entry) => entry.id === id ? { ...entry, ...update } : entry));
  }

  function addFiles(selectedFiles: File[]) {
    setError(null); setConfirming(false); setReplacementAcknowledged(false);
    if (loadingProducts) { setError("Wait for the product catalog to finish loading."); return; }
    if (files.length + selectedFiles.length > MAX_BATCH_FILES) {
      setError(`Choose no more than ${MAX_BATCH_FILES} images per batch.`);
      return;
    }
    const totalBytes = [...files.map((entry) => entry.file.size), ...selectedFiles.map((file) => file.size)].reduce((sum, size) => sum + size, 0);
    if (totalBytes > MAX_BATCH_BYTES) {
      setError("The selected batch exceeds the 120 MB review limit.");
      return;
    }
    const additions = selectedFiles.map((file): BatchImage => {
      const validationError = fileValidation(file);
      const match = validationError ? { productId: null, status: "UNMATCHED" as const } : suggestProductForImage(file.name, products);
      const product = match.productId === null ? null : productById.get(match.productId) ?? null;
      const previewUrl = SUPPORTED_TYPES.has(file.type) ? URL.createObjectURL(file) : null;
      if (previewUrl) previewUrls.current.add(previewUrl);
      return {
        id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        file,
        previewUrl,
        productId: product?.id ?? null,
        selectorValue: product ? productOption(product) : "",
        matchStatus: match.status,
        validationError,
        skipped: false,
        uploadState: "PENDING",
        uploadError: null,
      };
    });
    setFiles((current) => [...current, ...additions]);
  }

  function handlePicker(event: ChangeEvent<HTMLInputElement>) {
    const selected = [...(event.target.files ?? [])]; event.target.value = ""; addFiles(selected);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault(); setDragging(false); addFiles([...event.dataTransfer.files]);
  }

  function assignFromSelector(id: string, value: string) {
    const product = products.find((candidate) => productOption(candidate) === value);
    updateFile(id, { selectorValue: value, productId: product?.id ?? null, matchStatus: product ? "MANUAL" : "NEEDS_REVIEW", uploadState: "PENDING", uploadError: null });
  }

  function removeFile(entry: BatchImage) {
    if (entry.previewUrl) { URL.revokeObjectURL(entry.previewUrl); previewUrls.current.delete(entry.previewUrl); }
    setFiles((current) => current.filter((candidate) => candidate.id !== entry.id));
    setConfirming(false);
  }

  function acceptExactMatches() {
    setFiles((current) => current.map((entry) => {
      if (entry.validationError || entry.uploadState === "SUCCESS") return entry;
      const match = suggestProductForImage(entry.file.name, products);
      if (match.status !== "EXACT" || match.productId === null) return entry;
      const product = productById.get(match.productId);
      return product ? { ...entry, productId: product.id, selectorValue: productOption(product), matchStatus: "EXACT", skipped: false } : entry;
    }));
  }

  function clearMatches() {
    setFiles((current) => current.map((entry) => entry.uploadState === "SUCCESS" ? entry : { ...entry, productId: null, selectorValue: "", matchStatus: "UNMATCHED", skipped: false }));
    setConfirming(false); setReplacementAcknowledged(false);
  }

  async function uploadReviewedImages() {
    if (uploadable.length === 0 || duplicateIds.size > 0) return;
    try {
      setBusy(true); setError(null);
      const results = await runIndependentImageUploads(uploadable, async (entry) => {
        updateFile(entry.id, { uploadState: "UPLOADING", uploadError: null });
        const response = await adminFetch(`/api/products/${entry.productId}/image`, {
          method: "PUT",
          headers: { "Content-Type": entry.file.type, "X-File-Name": encodeURIComponent(entry.file.name) },
          body: entry.file,
        });
        const body = await response.json().catch(() => null) as { imageUrl?: string; error?: string } | null;
        if (!response.ok || !body?.imageUrl) throw new Error(body?.error ?? "The image could not be uploaded.");
        setProducts((current) => current.map((product) => product.id === entry.productId ? { ...product, imageUrl: body.imageUrl ?? product.imageUrl } : product));
        setFiles((current) => current.map((candidate) => candidate.id === entry.id ? { ...candidate, uploadState: "SUCCESS", uploadError: null } : candidate));
      });
      results.filter((result) => !result.ok).forEach((result) => setFiles((current) => current.map((entry) => entry.id === result.item.id ? { ...entry, uploadState: "FAILED", uploadError: result.error } : entry)));
      if (results.some((result) => result.ok)) onUploaded?.();
      setConfirming(false);
    } finally { setBusy(false); }
  }

  const canConfirm = uploadable.length > 0 && duplicateIds.size === 0 && !busy;
  const pendingReplacements = replacements.filter((entry) => entry.uploadState !== "SUCCESS" && uploadable.some((candidate) => candidate.id === entry.id));
  const requiresReplacementAcknowledgement = pendingReplacements.length > 0;

  return <div className="modal-backdrop bulk-image-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="modal-surface bulk-image-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-image-title">
      <header className="bulk-image-header"><div><span>Storefront products</span><h2 id="bulk-image-title">Bulk Upload Images</h2><p>Review filename matches before any image is uploaded.</p></div><button type="button" aria-label="Close bulk image upload" disabled={busy} onClick={onClose}>&times;</button></header>
      <div className={`bulk-image-dropzone${dragging ? " is-dragging" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={handleDrop}>
        <input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={handlePicker} />
        <strong>Drop product images here</strong><span>JPEG, PNG, or WebP · up to 8 MB each · {MAX_BATCH_FILES} files per batch</span><button className="secondary-button" type="button" disabled={loadingProducts || busy} onClick={() => inputRef.current?.click()}>Choose Images</button>
      </div>

      <div className="bulk-image-toolbar"><div><button type="button" onClick={acceptExactMatches} disabled={files.length === 0 || busy}>Accept all exact matches</button><button type="button" onClick={clearMatches} disabled={files.length === 0 || busy}>Clear matches</button></div><div role="group" aria-label="Image review filter"><button type="button" className={filter === "ALL" ? "is-active" : undefined} onClick={() => setFilter("ALL")}>All</button><button type="button" className={filter === "REVIEW" ? "is-active" : undefined} onClick={() => setFilter("REVIEW")}>Needs Review</button><button type="button" className={filter === "REPLACEMENTS" ? "is-active" : undefined} onClick={() => setFilter("REPLACEMENTS")}>Replacements</button></div></div>
      {error && <div className="bulk-image-notice is-error" role="alert">{error}</div>}
      {duplicateIds.size > 0 && <div className="bulk-image-notice is-error" role="alert">Multiple files are assigned to the same product. Clear, skip, or reassign duplicate matches before uploading.</div>}

      <div className="bulk-image-content">
        {files.length === 0 ? <div className="bulk-image-empty"><strong>No images selected</strong><span>Files stay on your device until you review and confirm the upload.</span></div> : visibleFiles.length === 0 ? <div className="bulk-image-empty"><strong>No files match this filter</strong></div> : <div className="bulk-image-list">
          {visibleFiles.map((entry) => {
            const product = entry.productId === null ? null : productById.get(entry.productId) ?? null;
            const duplicate = entry.productId !== null && duplicateIds.has(entry.productId);
            return <article className={`bulk-image-row${entry.skipped ? " is-skipped" : ""}`} key={entry.id}>
              <ProductImage className="bulk-image-row__new" variant="thumbnail" src={entry.previewUrl} alt={`Preview of ${entry.file.name}`} fallbackMark="Invalid" />
              <div className="bulk-image-row__file"><strong title={entry.file.name}>{entry.file.name}</strong><span>{formatBytes(entry.file.size)}</span><b className={`is-${entry.matchStatus.toLowerCase()}`}>{matchLabels[entry.matchStatus]}</b>{entry.validationError && <small>{entry.validationError}</small>}</div>
              <div className="bulk-image-row__match"><label><span>Product match</span><input list="bulk-product-options" value={entry.selectorValue} disabled={busy || entry.uploadState === "SUCCESS" || Boolean(entry.validationError)} placeholder="Search product name" onChange={(event) => assignFromSelector(entry.id, event.target.value)} /></label>{duplicate && <small>Duplicate product assignment</small>}</div>
              <div className="bulk-image-row__replacement">{product?.imageUrl ? <><ProductImage className="bulk-image-row__current-image" variant="thumbnail" src={product.imageUrl} alt={`Current ${product.internalName}`} /><span aria-hidden="true">&rarr;</span><small>Replaces current image</small></> : <small>{product ? "Adds first image" : "No product selected"}</small>}</div>
              <div className="bulk-image-row__result"><strong className={`is-${entry.uploadState.toLowerCase()}`}>{entry.uploadState === "PENDING" ? "Ready for review" : entry.uploadState === "UPLOADING" ? "Uploading…" : entry.uploadState === "SUCCESS" ? "Uploaded" : "Upload failed"}</strong>{entry.uploadError && <small>{entry.uploadError}</small>}<label><input type="checkbox" checked={entry.skipped} disabled={busy || entry.uploadState === "SUCCESS"} onChange={(event) => updateFile(entry.id, { skipped: event.target.checked })} /> Skip</label><button type="button" disabled={busy} onClick={() => removeFile(entry)}>Remove</button></div>
            </article>;
          })}
        </div>}
      </div>
      <datalist id="bulk-product-options">{products.map((product) => <option key={product.id} value={productOption(product)} />)}</datalist>

      <footer className="bulk-image-footer">
        <div><strong>{files.length}</strong> selected · <strong>{matched.length}</strong> matched · <strong>{files.filter((entry) => entry.productId === null && !entry.skipped).length}</strong> unmatched · <strong>{replacements.length}</strong> replacements{completed > 0 && <> · <strong>{completed}</strong> uploaded</>}{failed > 0 && <> · <strong>{failed}</strong> failed</>}</div>
        {confirming && <div className="bulk-image-confirm"><p>Upload {uploadable.length} matched {uploadable.length === 1 ? "image" : "images"}? Unmatched and skipped files will remain untouched.</p>{requiresReplacementAcknowledgement && <label><input type="checkbox" checked={replacementAcknowledged} onChange={(event) => setReplacementAcknowledged(event.target.checked)} /> I understand that {pendingReplacements.length} current product {pendingReplacements.length === 1 ? "image" : "images"} will be replaced after the new upload succeeds.</label>}</div>}
        <div className="bulk-image-footer__actions"><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>{completed > 0 ? "Done" : "Cancel"}</button>{!confirming ? <button type="button" className="primary-button" disabled={!canConfirm} onClick={() => setConfirming(true)}>{failed > 0 ? "Review Retry" : "Review Upload"}</button> : <button type="button" className="primary-button" disabled={!canConfirm || (requiresReplacementAcknowledgement && !replacementAcknowledged)} onClick={() => void uploadReviewedImages()}>{busy ? "Uploading…" : `Confirm & Upload (${uploadable.length})`}</button>}</div>
      </footer>
    </section>
  </div>;
}
