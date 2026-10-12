import { adminFetch } from "../adminFetch";
import { useRef, useState, type ChangeEvent } from "react";

const MAX_PRODUCT_IMAGE_BYTES = 8 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export default function ProductImageManager({
  compact = false,
  imageUrl,
  onImageChange,
  productId,
  productName,
}: {
  compact?: boolean;
  imageUrl: string | null;
  onImageChange: (imageUrl: string | null) => void;
  productId: number;
  productName: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function uploadImage(file: File) {
    if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
      setError("Use a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
      setError("Images must be 8 MB or smaller.");
      return;
    }

    try {
      setBusy(true);
      setError(null);
      setMessage(null);
      const response = await adminFetch(`/api/products/${productId}/image`, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
          "X-File-Name": encodeURIComponent(file.name),
        },
        body: file,
      });
      const body = await response.json().catch(() => null) as { imageUrl?: string; error?: string } | null;
      if (!response.ok || !body?.imageUrl) {
        throw new Error(body?.error ?? "The product image could not be uploaded.");
      }
      onImageChange(body.imageUrl);
      setMessage(imageUrl ? "Image replaced." : "Image uploaded.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "The product image could not be uploaded.");
    } finally {
      setBusy(false);
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await uploadImage(file);
  }

  async function removeImage() {
    if (!imageUrl || !window.confirm(`Remove the public image for ${productName}?`)) return;
    try {
      setBusy(true);
      setError(null);
      setMessage(null);
      const response = await adminFetch(`/api/products/${productId}/image`, { method: "DELETE" });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "The product image could not be removed.");
      }
      onImageChange(null);
      setMessage("Image removed.");
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "The product image could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`product-image-manager${compact ? " product-image-manager--compact" : ""}`}>
      <div className="product-image-manager__preview">
        {imageUrl ? (
          <img src={imageUrl} alt={`${productName} product`} />
        ) : (
          <span aria-label="No product image">DR</span>
        )}
      </div>
      <div className="product-image-manager__controls">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          onChange={(event) => void handleFileChange(event)}
          disabled={busy}
        />
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Working..." : imageUrl ? "Replace Image" : "Upload Image"}
        </button>
        {imageUrl && (
          <button type="button" className="product-image-manager__remove" disabled={busy} onClick={() => void removeImage()}>
            Remove
          </button>
        )}
        {(error || message) && (
          <small className={error ? "is-error" : "is-success"} role={error ? "alert" : "status"}>
            {error ?? message}
          </small>
        )}
      </div>
    </div>
  );
}
