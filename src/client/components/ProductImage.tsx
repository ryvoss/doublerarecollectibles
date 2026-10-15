import type { ImgHTMLAttributes, ReactNode } from "react";

export type ProductImageVariant = "thumbnail" | "card" | "modal" | "admin-preview";

type ProductImageProps = {
  alt: string;
  className?: string;
  fallbackAriaLabel?: string;
  fallbackDescription?: string;
  fallbackMark?: ReactNode;
  loading?: ImgHTMLAttributes<HTMLImageElement>["loading"];
  src: string | null | undefined;
  variant: ProductImageVariant;
};

/**
 * Shared presentation frame for product imagery. The frame owns dimensions and
 * spacing; the source image is always contained without changing the upload.
 */
export function ProductImage({
  alt,
  className,
  fallbackAriaLabel,
  fallbackDescription,
  fallbackMark = "DR",
  loading,
  src,
  variant,
}: ProductImageProps) {
  const classes = [
    "product-image-frame",
    `product-image-frame--${variant}`,
    className,
  ].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      {src ? (
        <img
          className="product-image-frame__image"
          src={src}
          alt={alt}
          loading={loading}
          decoding="async"
        />
      ) : (
        <div
          className="product-image-frame__fallback"
          role={fallbackAriaLabel ? "img" : undefined}
          aria-label={fallbackAriaLabel}
          aria-hidden={fallbackAriaLabel ? undefined : true}
        >
          <span>{fallbackMark}</span>
          {fallbackDescription && <small>{fallbackDescription}</small>}
        </div>
      )}
    </div>
  );
}

export default ProductImage;
